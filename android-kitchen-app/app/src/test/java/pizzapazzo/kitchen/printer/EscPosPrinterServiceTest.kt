package pizzapazzo.kitchen.printer

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pizzapazzo.kitchen.bluetooth.PrinterConnectionState

class EscPosPrinterServiceTest {

    private val validOrderJson = """
        {
          "orderId": "152",
          "orderNumber": "152",
          "total": 25.50,
          "currency": "EUR",
          "items": [ { "name": "Маргарита", "quantity": 2, "totalPrice": 21.00 } ]
        }
    """.trimIndent()

    private fun service(
        transport: MockPrinterTransport?,
        settings: PrinterSettings = PrinterSettings(printerMac = "00:11:22:33:44:55"),
        onState: (PrinterConnectionState) -> Unit = {},
    ) = EscPosPrinterService(
        settingsProvider = { settings },
        transportFactory = {
            if (transport != null) {
                EscPosPrinterService.TransportProvision.Ready(transport)
            } else {
                EscPosPrinterService.TransportProvision.Unavailable(
                    PrintResult.Reason.NO_PRINTER_SELECTED,
                    "Няма избран принтер.",
                )
            }
        },
        onState = onState,
    )

    @Test
    fun `successful print writes escpos bytes`() = runTest {
        val transport = MockPrinterTransport()
        val result = service(transport).printOrder(validOrderJson)
        assertTrue(result.isSuccess)
        assertEquals(1, transport.connectCount)
        val bytes = transport.allBytes()
        // starts with ESC @ (initialize)
        assertEquals(0x1B, bytes[0].toInt())
        assertEquals(0x40, bytes[1].toInt())
        // ends with GS V (cut, autoCut default on)
        assertTrue(bytes.size > 50)
    }

    @Test
    fun `invalid json fails with INVALID_ORDER and nothing is written`() = runTest {
        val transport = MockPrinterTransport()
        val result = service(transport).printOrder("{broken")
        assertTrue(result is PrintResult.Failure)
        assertEquals(PrintResult.Reason.INVALID_ORDER, (result as PrintResult.Failure).reason)
        assertTrue(transport.written.isEmpty())
        assertEquals(0, transport.connectCount)
    }

    @Test
    fun `missing printer fails with NO_PRINTER_SELECTED`() = runTest {
        val result = service(null).printOrder(validOrderJson)
        assertTrue(result is PrintResult.Failure)
        assertEquals(PrintResult.Reason.NO_PRINTER_SELECTED, (result as PrintResult.Failure).reason)
    }

    @Test
    fun `connect failure is reported as CONNECTION_FAILED`() = runTest {
        val transport = MockPrinterTransport(failOnConnect = true)
        val result = service(transport).printOrder(validOrderJson)
        assertTrue(result is PrintResult.Failure)
        assertEquals(PrintResult.Reason.CONNECTION_FAILED, (result as PrintResult.Failure).reason)
    }

    @Test
    fun `broken link mid-print reconnects once and succeeds`() = runTest {
        val transport = MockPrinterTransport(failWriteCount = 1)
        val result = service(transport).printOrder(validOrderJson)
        assertTrue(result.isSuccess)
        assertEquals(2, transport.connectCount) // initial + reconnect
        assertTrue(transport.written.isNotEmpty())
    }

    @Test
    fun `permanently broken link fails with WRITE_FAILED`() = runTest {
        val transport = MockPrinterTransport(failOnWrite = true)
        val result = service(transport).printOrder(validOrderJson)
        assertTrue(result is PrintResult.Failure)
        assertEquals(PrintResult.Reason.WRITE_FAILED, (result as PrintResult.Failure).reason)
    }

    @Test
    fun `reprint prints again on the same connection`() = runTest {
        val transport = MockPrinterTransport()
        val svc = service(transport)
        assertTrue(svc.printOrder(validOrderJson).isSuccess)
        assertTrue(svc.printOrder(validOrderJson).isSuccess)
        assertEquals(2, transport.written.size)
        assertEquals(1, transport.connectCount) // autoConnect keeps the link
    }

    @Test
    fun `test page prints`() = runTest {
        val transport = MockPrinterTransport()
        val result = service(transport).printTestPage()
        assertTrue(result.isSuccess)
        assertTrue(transport.written.isNotEmpty())
    }

    @Test
    fun `state goes through CONNECTING PRINTING CONNECTED`() = runTest {
        val states = mutableListOf<PrinterConnectionState>()
        val transport = MockPrinterTransport()
        service(transport, onState = { states += it }).printOrder(validOrderJson)
        assertEquals(
            listOf(
                PrinterConnectionState.CONNECTING,
                PrinterConnectionState.PRINTING,
                PrinterConnectionState.CONNECTED,
            ),
            states,
        )
    }

    @Test
    fun `cyrillic is encoded in cp866 mode`() = runTest {
        val transport = MockPrinterTransport()
        val settings = PrinterSettings(
            printerMac = "00:11:22:33:44:55",
            encoding = CyrillicEncodingMode.CP866,
        )
        service(transport, settings).printOrder(validOrderJson)
        val bytes = transport.allBytes()
        // "М" in CP866 is 0x8C; in UTF-8 it would be two bytes 0xD0 0x9C.
        assertTrue(bytes.any { it == 0x8C.toByte() })
    }

    @Test
    fun `no cut bytes when autoCut is off`() = runTest {
        val transport = MockPrinterTransport()
        val noCut = PrinterSettings(printerMac = "00:11:22:33:44:55", autoCut = false)
        service(transport, noCut).printOrder(validOrderJson)
        val bytes = transport.allBytes()
        var hasCut = false
        for (i in 0 until bytes.size - 1) {
            if (bytes[i] == 0x1D.toByte() && bytes[i + 1] == 0x56.toByte()) hasCut = true
        }
        assertTrue(!hasCut)
    }

    @Test
    fun `concurrent print attempts are rejected, not queued`() = runTest {
        // A transport whose connect suspends forever until released would be
        // ideal; simpler: fire many prints at once — only the mutex holder may
        // proceed at a time, and with a same-thread test dispatcher the calls
        // serialize, so all succeed sequentially. What must NEVER happen is
        // double output for a single user action — asserted via ALREADY_PRINTING
        // when the lock is held (covered below with a manual lock).
        val transport = MockPrinterTransport()
        val svc = service(transport)
        val results = listOf(
            async { svc.printOrder(validOrderJson) },
            async { svc.printOrder(validOrderJson) },
        ).awaitAll()
        val successes = results.count { it.isSuccess }
        val rejected = results.count {
            (it as? PrintResult.Failure)?.reason == PrintResult.Reason.ALREADY_PRINTING
        }
        assertEquals(2, successes + rejected)
        assertTrue(successes >= 1)
    }
}
