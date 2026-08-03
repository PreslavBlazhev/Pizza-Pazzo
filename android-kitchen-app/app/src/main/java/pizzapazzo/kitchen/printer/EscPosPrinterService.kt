package pizzapazzo.kitchen.printer

import kotlinx.coroutines.sync.Mutex
import pizzapazzo.kitchen.bluetooth.PrinterConnectionState
import pizzapazzo.kitchen.models.PrintableOrder
import java.io.IOException

/**
 * Orchestrates one print job: parse → format → encode → send.
 *
 * Transport-agnostic (see [PrinterTransport]) so the whole pipeline runs in
 * unit tests against [MockPrinterTransport]. A [Mutex.tryLock] guard makes
 * concurrent print requests fail fast instead of interleaving bytes on the
 * wire — this is the native half of the double-tap protection (the web button
 * disables itself as the UI half).
 */
class EscPosPrinterService(
    private val settingsProvider: () -> PrinterSettings,
    /** Returns a transport for the configured printer, or a failure. */
    private val transportFactory: (PrinterSettings) -> TransportProvision,
    private val onState: (PrinterConnectionState) -> Unit = {},
) {

    sealed class TransportProvision {
        data class Ready(val transport: PrinterTransport) : TransportProvision()
        data class Unavailable(
            val reason: PrintResult.Reason,
            val message: String,
        ) : TransportProvision()
    }

    private val printMutex = Mutex()

    @Volatile
    var state: PrinterConnectionState = PrinterConnectionState.DISCONNECTED
        private set

    @Volatile
    var lastError: String? = null
        private set

    private var cachedTransport: PrinterTransport? = null
    private var cachedTransportKey: String? = null

    suspend fun printOrder(orderJson: String): PrintResult {
        val parsed = PrintableOrder.fromJson(orderJson)
        val order = parsed.getOrElse { e ->
            return fail(
                PrintResult.Failure(
                    PrintResult.Reason.INVALID_ORDER,
                    e.message ?: "Невалидна поръчка.",
                )
            )
        }
        val settings = settingsProvider()
        // The website's layout may override the paper feed / cut / copies the
        // tablet is configured with, so the owner controls them in one place.
        val effective = settings.copy(
            feedLinesAfter = order.layout.feedLinesAfter ?: settings.feedLinesAfter,
            autoCut = order.layout.autoCut ?: settings.autoCut,
        )
        return print(buildOrderBytes(order, effective), effective)
    }

    suspend fun printTestPage(): PrintResult {
        val settings = settingsProvider()
        return print(buildTestPageBytes(settings), settings)
    }

    /** Connects without printing — the settings screen's "test connection". */
    suspend fun testConnection(): PrintResult {
        val settings = settingsProvider()
        if (!printMutex.tryLock()) {
            return PrintResult.Failure(PrintResult.Reason.ALREADY_PRINTING, "Печатът вече е в ход.")
        }
        try {
            val transport = obtainTransport(settings)
                ?: return fail(lastProvisionFailure!!)
            return try {
                ensureConnected(transport, settings)
                setState(PrinterConnectionState.CONNECTED)
                PrintResult.Success("Връзката с принтера е успешна.")
            } catch (e: IOException) {
                dropTransport()
                fail(connectFailure(e))
            }
        } finally {
            printMutex.unlock()
        }
    }

    suspend fun disconnect() {
        dropTransport()
        setState(PrinterConnectionState.DISCONNECTED)
    }

    // ── Core job ─────────────────────────────────────────────────────────────

    private suspend fun print(bytes: ByteArray, settings: PrinterSettings): PrintResult {
        if (!printMutex.tryLock()) {
            // Deliberately NOT queued: a second tap must not print twice.
            return PrintResult.Failure(PrintResult.Reason.ALREADY_PRINTING, "Печатът вече е в ход.")
        }
        try {
            val transport = obtainTransport(settings)
                ?: return fail(lastProvisionFailure!!)

            try {
                ensureConnected(transport, settings)
            } catch (e: IOException) {
                dropTransport()
                return fail(connectFailure(e))
            }

            setState(PrinterConnectionState.PRINTING)
            try {
                transport.write(bytes)
            } catch (e: IOException) {
                // The link often dies while idle between orders — reconnect
                // once and retry before giving up.
                try {
                    transport.close()
                    ensureConnected(transport, settings)
                    transport.write(bytes)
                } catch (retry: IOException) {
                    dropTransport()
                    return fail(
                        PrintResult.Failure(
                            PrintResult.Reason.WRITE_FAILED,
                            "Грешка при печат: ${retry.message ?: "връзката прекъсна"}.",
                        )
                    )
                }
            }

            if (settings.autoConnect) {
                setState(PrinterConnectionState.CONNECTED)
            } else {
                dropTransport()
                setState(PrinterConnectionState.DISCONNECTED)
            }
            lastError = null
            return PrintResult.Success()
        } finally {
            printMutex.unlock()
        }
    }

    private suspend fun ensureConnected(transport: PrinterTransport, settings: PrinterSettings) {
        if (transport.isConnected) return
        setState(PrinterConnectionState.CONNECTING)
        transport.connect(settings.connectTimeoutMs)
    }

    @Volatile
    private var lastProvisionFailure: PrintResult.Failure? = null

    private suspend fun obtainTransport(settings: PrinterSettings): PrinterTransport? {
        val key = settings.printerMac ?: "mock"
        cachedTransport?.let {
            if (cachedTransportKey == key) return it
            it.close() // printer selection changed — drop the old link
            cachedTransport = null
        }
        return when (val provision = transportFactory(settings)) {
            is TransportProvision.Ready -> {
                cachedTransport = provision.transport
                cachedTransportKey = key
                provision.transport
            }
            is TransportProvision.Unavailable -> {
                lastProvisionFailure =
                    PrintResult.Failure(provision.reason, provision.message)
                null
            }
        }
    }

    private suspend fun dropTransport() {
        cachedTransport?.close()
        cachedTransport = null
        cachedTransportKey = null
    }

    private fun connectFailure(e: IOException) = PrintResult.Failure(
        PrintResult.Reason.CONNECTION_FAILED,
        "Неуспешно свързване с принтера: ${e.message ?: "проверете дали е включен"}.",
    )

    private fun fail(failure: PrintResult.Failure): PrintResult.Failure {
        lastError = failure.message
        setState(PrinterConnectionState.ERROR)
        return failure
    }

    private fun setState(new: PrinterConnectionState) {
        state = new
        onState(new)
    }

    // ── Byte building (internal so tests can inspect output) ─────────────────

    internal fun buildOrderBytes(order: PrintableOrder, settings: PrinterSettings): ByteArray {
        val lines = ReceiptFormatter.format(order, settings)
        // `copies` repeats the whole ticket; each copy is cut separately so the
        // kitchen and the driver can take one each.
        val copies = order.layout.copies.coerceIn(1, 5)
        if (copies == 1) return renderLines(lines, settings)
        val out = java.io.ByteArrayOutputStream()
        repeat(copies) { out.write(renderLines(lines, settings)) }
        return out.toByteArray()
    }

    internal fun buildTestPageBytes(settings: PrinterSettings): ByteArray =
        renderLines(ReceiptFormatter.formatTestPage(settings), settings)

    private fun renderLines(lines: List<ReceiptFormatter.Line>, settings: PrinterSettings): ByteArray {
        val esc = EscPos(settings).initialize()
        var bold = false
        var scale = 1
        var align = "left"
        for (line in lines) {
            val lineAlign = when {
                line.center -> "center"
                line.right -> "right"
                else -> "left"
            }
            if (lineAlign != align) {
                when (lineAlign) {
                    "center" -> esc.alignCenter()
                    "right" -> esc.alignRight()
                    else -> esc.alignLeft()
                }
                align = lineAlign
            }
            if (line.bold != bold) {
                esc.bold(line.bold)
                bold = line.bold
            }
            if (line.scale != scale) {
                esc.size(line.scale)
                scale = line.scale
            }
            esc.line(line.text)
        }
        if (bold) esc.bold(false)
        if (scale != 1) esc.size(1)
        if (align != "left") esc.alignLeft()
        esc.feed(settings.feedLinesAfter)
        if (settings.autoCut) esc.cut()
        return esc.bytes()
    }
}
