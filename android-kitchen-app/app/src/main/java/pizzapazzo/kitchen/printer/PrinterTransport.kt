package pizzapazzo.kitchen.printer

/**
 * Abstraction over the physical link to the printer.
 *
 * v1 ships [pizzapazzo.kitchen.bluetooth.BluetoothSocketTransport] (Bluetooth
 * Classic SPP/RFCOMM) and [MockPrinterTransport] (tests + printer-less demo).
 * If the real printer turns out to need a vendor SDK instead of raw ESC/POS,
 * only a new implementation of this interface is required — the formatter,
 * service and bridge stay untouched.
 */
interface PrinterTransport {
    val isConnected: Boolean

    /** Opens the link. Must be called off the main thread; may throw IOException. */
    suspend fun connect(timeoutMs: Long)

    /** Sends raw bytes. May throw IOException on a broken link. */
    suspend fun write(bytes: ByteArray)

    /** Closes the link; never throws. */
    suspend fun close()
}

/**
 * In-memory transport: records everything "printed". Used by unit tests and as
 * a safe default while no Bluetooth printer is configured.
 */
class MockPrinterTransport(
    private val failOnConnect: Boolean = false,
    private val failOnWrite: Boolean = false,
    /** When >0, the first [failWriteCount] writes throw, then writes succeed. */
    private val failWriteCount: Int = 0,
) : PrinterTransport {

    private var remainingWriteFailures = failWriteCount
    val written = mutableListOf<ByteArray>()
    var connectCount = 0
        private set
    var closeCount = 0
        private set

    override var isConnected: Boolean = false
        private set

    override suspend fun connect(timeoutMs: Long) {
        connectCount++
        if (failOnConnect) throw java.io.IOException("Mock: connect failed")
        isConnected = true
    }

    override suspend fun write(bytes: ByteArray) {
        if (!isConnected) throw java.io.IOException("Mock: not connected")
        if (failOnWrite) throw java.io.IOException("Mock: write failed")
        if (remainingWriteFailures > 0) {
            remainingWriteFailures--
            isConnected = false
            throw java.io.IOException("Mock: transient write failure")
        }
        written += bytes
    }

    override suspend fun close() {
        closeCount++
        isConnected = false
    }

    fun allBytes(): ByteArray = written.fold(ByteArray(0)) { acc, b -> acc + b }
}
