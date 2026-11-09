package bg.pizzapazzo.app.printer

import kotlinx.coroutines.sync.Mutex
import bg.pizzapazzo.app.bluetooth.PrinterConnectionState
import bg.pizzapazzo.app.models.PrintableOrder
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
    /**
     * The logo raster for the configured paper width (res/raw, see
     * [ReceiptLogo]). Null — or a throw — prints the header text instead.
     */
    private val logoProvider: (PrinterSettings) -> ReceiptLogo? = { null },
) {

    sealed class TransportProvision {
        data class Ready(val transport: PrinterTransport) : TransportProvision()
        data class Unavailable(
            val reason: PrintResult.Reason,
            val message: String,
        ) : TransportProvision()
    }

    companion object {
        /** Blank lines between the parts of a combined print (kitchen → delivery). */
        const val GAP_LINES = 5
        const val MAX_BUNDLE_PARTS = 4
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

    /**
     * Prints several tickets of one order as ONE job — the site's "Принтиране"
     * button sends the kitchen ticket followed by the delivery ticket. Every
     * part keeps its own layout untouched; the only differences from printing
     * them separately are that there is no feed/cut between the parts and
     * exactly [GAP_LINES] blank lines (base line height) separate them. The
     * feed / cut after the whole job are the LAST part's settings.
     *
     * [bundleJson] is a JSON array of the same order objects [printOrder] takes.
     */
    suspend fun printOrders(bundleJson: String): PrintResult {
        val orders = parseBundle(bundleJson).getOrElse { e ->
            return fail(
                PrintResult.Failure(
                    PrintResult.Reason.INVALID_ORDER,
                    e.message ?: "Невалидна поръчка.",
                )
            )
        }
        val settings = settingsProvider()
        val last = orders.last()
        val effective = settings.copy(
            feedLinesAfter = last.layout.feedLinesAfter ?: settings.feedLinesAfter,
            autoCut = last.layout.autoCut ?: settings.autoCut,
        )
        return print(buildBundleBytes(orders, effective), effective)
    }

    private fun parseBundle(bundleJson: String): Result<List<PrintableOrder>> = runCatching {
        require(bundleJson.toByteArray(Charsets.UTF_8).size <= PrintableOrder.MAX_JSON_BYTES * MAX_BUNDLE_PARTS) {
            "Поръчката е твърде голяма."
        }
        val arr = org.json.JSONArray(bundleJson)
        require(arr.length() in 1..MAX_BUNDLE_PARTS) { "Невалидна поръчка." }
        (0 until arr.length()).map { i ->
            PrintableOrder.fromJson(arr.getJSONObject(i).toString()).getOrThrow()
        }
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

    internal fun buildBundleBytes(orders: List<PrintableOrder>, settings: PrinterSettings): ByteArray {
        val job = java.io.ByteArrayOutputStream()
        orders.forEachIndexed { index, order ->
            val lines = ReceiptFormatter.format(order, settings)
            if (index < orders.lastIndex) {
                job.write(renderLines(lines, settings, finish = false))
                // renderLines has reset size/bold/alignment, so this is the base line height.
                job.write(EscPos(settings).feed(GAP_LINES).bytes())
            } else {
                job.write(renderLines(lines, settings))
            }
        }
        val bytes = job.toByteArray()
        val copies = orders.maxOf { it.layout.copies }.coerceIn(1, 5)
        if (copies == 1) return bytes
        val out = java.io.ByteArrayOutputStream()
        repeat(copies) { out.write(bytes) }
        return out.toByteArray()
    }

    internal fun buildTestPageBytes(settings: PrinterSettings): ByteArray =
        renderLines(ReceiptFormatter.formatTestPage(settings), settings)

    /** The logo centred for this paper, or null (→ the header prints as text). */
    private fun logoFor(settings: PrinterSettings): ReceiptLogo? =
        runCatching { logoProvider(settings) }.getOrNull()
            ?.centredOn(ReceiptLogo.paperDotsFor(settings.paperWidth))

    /** [finish] = false leaves out the feed + cut, for a part followed by another. */
    private fun renderLines(
        lines: List<ReceiptFormatter.Line>,
        settings: PrinterSettings,
        finish: Boolean = true,
    ): ByteArray {
        val esc = EscPos(settings).initialize()
        var bold = false
        var scale = 1
        var align = "left"
        val logo = if (lines.any { it.logo }) logoFor(settings) else null
        var i = 0
        while (i < lines.size) {
            val line = lines[i++]
            if (line.logo && logo != null) {
                // ONE image for the whole run of header lines, whose text is
                // dropped — the logo and "PIZZA PAZZO" never print together.
                while (i < lines.size && lines[i].logo) i++
                // Centring is baked into the raster (left padding), so print
                // it from the left margin at normal size.
                if (align != "left") {
                    esc.alignLeft()
                    align = "left"
                }
                if (bold) {
                    esc.bold(false)
                    bold = false
                }
                if (scale != 1) {
                    esc.size(1)
                    scale = 1
                }
                esc.rasterImage(logo)
                continue
            }
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
        if (finish) {
            esc.feed(settings.feedLinesAfter)
            if (settings.autoCut) esc.cut()
        }
        return esc.bytes()
    }
}
