package bg.pizzapazzo.app.printer

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The logo on the thermal ticket: the bundled rasters themselves, the
 * GS v 0 bytes, and that the logo REPLACES the "PIZZA PAZZO" text (text only as
 * the fallback) on the kitchen and delivery tickets alike.
 */
class ReceiptLogoTest {

    /** Unit tests run with the module directory (app/) as working directory. */
    private fun bundled(width: Int): ReceiptLogo =
        ReceiptLogo.parse(File("src/main/res/raw/receipt_logo_$width.bin").readBytes())
            ?: error("receipt_logo_$width.bin did not parse")

    private fun order(templateId: String, headerLogo: Boolean? = null, headerVisible: Boolean = true) = """
        {
          "orderId": "152",
          "orderNumber": "152",
          "total": 25.50,
          "currency": "EUR",
          "items": [ { "name": "Маргарита", "quantity": 2, "totalPrice": 21.00 } ],
          "print": {
            "templateId": "$templateId",
            "name": "${if (templateId == "KITCHEN") "КУХНЯ" else "ДОСТАВКА"}",
            "headerText": "PIZZA PAZZO",
            ${if (headerLogo != null) "\"headerLogo\": $headerLogo," else ""}
            "sections": { "header": { "visible": $headerVisible, "scale": 2, "align": "center", "bold": true } }
          }
        }
    """.trimIndent()

    private fun service(
        transport: MockPrinterTransport,
        paper: PaperWidth = PaperWidth.MM80,
        logo: (PrinterSettings) -> ReceiptLogo? = { bundled(ReceiptLogo.widthDotsFor(it.paperWidth)) },
    ) = EscPosPrinterService(
        settingsProvider = { PrinterSettings(printerMac = "00:11:22:33:44:55", paperWidth = paper) },
        transportFactory = { EscPosPrinterService.TransportProvision.Ready(transport) },
        logoProvider = logo,
    )

    private fun ByteArray.indexOf(needle: ByteArray, from: Int = 0): Int {
        outer@ for (i in from..size - needle.size) {
            for (j in needle.indices) if (this[i + j] != needle[j]) continue@outer
            return i
        }
        return -1
    }

    private fun ByteArray.count(needle: ByteArray): Int {
        var n = 0
        var i = indexOf(needle)
        while (i >= 0) {
            n++
            i = indexOf(needle, i + needle.size)
        }
        return n
    }

    private val GS_V_0 = byteArrayOf(0x1D, 0x76, 0x30, 0x00)
    private val HEADER_TEXT = "PIZZA PAZZO".toByteArray(Charsets.US_ASCII)

    // ── The bundled rasters ──────────────────────────────────────────────────

    @Test
    fun `bundled rasters exist for both paper widths with the logo's proportions`() {
        val small = bundled(288)
        val large = bundled(384)
        assertEquals(288, small.widthDots)
        assertEquals(384, large.widthDots)
        // Same aspect ratio (≈ 528×298 source), neither stretched nor cropped.
        val ratio = { l: ReceiptLogo -> l.rows.toDouble() / l.widthDots }
        assertEquals(298.0 / 528.0, ratio(small), 0.01)
        assertEquals(298.0 / 528.0, ratio(large), 0.01)
        // A real image, not blank or solid: roughly a quarter of the dots are black.
        for (logo in listOf(small, large)) {
            var black = 0
            for (y in 0 until logo.rows) for (x in 0 until logo.widthDots) if (logo.isBlack(x, y)) black++
            val share = black.toDouble() / (logo.rows * logo.widthDots)
            assertTrue("black share $share", share in 0.15..0.45)
        }
    }

    @Test
    fun `logo touches its edges - trimmed, no large empty margin`() {
        val logo = bundled(384)
        fun rowHasInk(y: Int) = (0 until logo.widthDots).any { logo.isBlack(it, y) }
        fun colHasInk(x: Int) = (0 until logo.rows).any { logo.isBlack(x, it) }
        assertTrue(rowHasInk(0) || rowHasInk(1))
        assertTrue(rowHasInk(logo.rows - 1) || rowHasInk(logo.rows - 2))
        assertTrue(colHasInk(0) || colHasInk(1))
        assertTrue(colHasInk(logo.widthDots - 1) || colHasInk(logo.widthDots - 2))
    }

    @Test
    fun `malformed raster is rejected`() {
        assertNull(ReceiptLogo.parse(ByteArray(0)))
        assertNull(ReceiptLogo.parse("XXXX".toByteArray() + ByteArray(8)))
        // Header promises more rows than the file holds.
        assertNull(ReceiptLogo.parse(byteArrayOf(0x50, 0x50, 0x4C, 0x31, 0, 2, 0, 3, 1, 2)))
        assertNotNull(ReceiptLogo.parse(byteArrayOf(0x50, 0x50, 0x4C, 0x31, 0, 1, 0, 2, 1, 2)))
    }

    @Test
    fun `centring pads the left only and keeps every dot`() {
        val logo = bundled(288)
        val centred = logo.centredOn(ReceiptLogo.paperDotsFor(PaperWidth.MM58))
        assertEquals(288 + 48, centred.widthDots) // (384 − 288) / 2 = 48 dots on the left
        assertEquals(logo.rows, centred.rows)
        for (y in 0 until logo.rows step 7) for (x in 0 until 48) assertFalse(centred.isBlack(x, y))
        for (y in 0 until logo.rows step 5) for (x in 0 until logo.widthDots step 3) {
            assertEquals(logo.isBlack(x, y), centred.isBlack(x + 48, y))
        }
        val wide = bundled(384).centredOn(ReceiptLogo.paperDotsFor(PaperWidth.MM80))
        assertEquals(384 + 96, wide.widthDots) // fits even a 512-dot print head
    }

    @Test
    fun `raster is sent as GS v 0 bands with exact header bytes`() {
        val logo = ReceiptLogo(2, 70, ByteArray(140) { 0x55 })
        val bytes = EscPos(PrinterSettings()).rasterImage(logo).bytes()
        // band 1: 64 rows, band 2: 6 rows
        assertEquals(listOf(0x1D, 0x76, 0x30, 0x00, 2, 0, 64, 0), bytes.take(8).map { it.toInt() })
        val second = 8 + 64 * 2
        assertEquals(listOf(0x1D, 0x76, 0x30, 0x00, 2, 0, 6, 0), bytes.drop(second).take(8).map { it.toInt() })
        // then ESC J 8: a 1 mm gap under the logo
        assertEquals(listOf(0x1B, 0x4A, 8), bytes.takeLast(3).map { it.toInt() })
        assertEquals(8 + 128 + 8 + 12 + 3, bytes.size)
    }

    // ── On the ticket ────────────────────────────────────────────────────────

    @Test
    fun `kitchen and delivery tickets print the logo instead of the header text`() = runTest {
        for (paper in PaperWidth.entries) for (template in listOf("KITCHEN", "DELIVERY")) {
            val transport = MockPrinterTransport()
            assertTrue(service(transport, paper).printOrder(order(template)).isSuccess)
            val bytes = transport.allBytes()
            val logo = bundled(ReceiptLogo.widthDotsFor(paper)).centredOn(ReceiptLogo.paperDotsFor(paper))
            val expectedBands = (logo.rows + EscPos.RASTER_BAND_ROWS - 1) / EscPos.RASTER_BAND_ROWS
            assertEquals("$paper $template", expectedBands, bytes.count(GS_V_0))
            assertEquals("$paper $template: no duplicated header text", -1, bytes.indexOf(HEADER_TEXT))
            // Band width = the centred logo's bytes per row.
            val at = bytes.indexOf(GS_V_0)
            assertEquals(logo.bytesPerRow, bytes[at + 4].toInt() and 0xFF)
            // The ticket body still follows the logo.
            assertTrue(bytes.indexOf("152".toByteArray()) > at)
        }
    }

    @Test
    fun `combined print has one logo per ticket`() = runTest {
        val transport = MockPrinterTransport()
        val bundle = "[${order("KITCHEN")},${order("DELIVERY")}]"
        assertTrue(service(transport).printOrders(bundle).isSuccess)
        val bytes = transport.allBytes()
        val bands = (bundled(384).rows + EscPos.RASTER_BAND_ROWS - 1) / EscPos.RASTER_BAND_ROWS
        assertEquals(2 * bands, bytes.count(GS_V_0))
        assertEquals(-1, bytes.indexOf(HEADER_TEXT))
    }

    @Test
    fun `header text is the fallback when the logo cannot be loaded`() = runTest {
        for (provider in listOf<(PrinterSettings) -> ReceiptLogo?>({ null }, { error("missing resource") })) {
            val transport = MockPrinterTransport()
            assertTrue(service(transport, logo = provider).printOrder(order("DELIVERY")).isSuccess)
            val bytes = transport.allBytes()
            assertEquals(0, bytes.count(GS_V_0))
            assertEquals(1, bytes.count(HEADER_TEXT))
        }
    }

    @Test
    fun `headerLogo false prints the text, a hidden header prints neither`() = runTest {
        val text = MockPrinterTransport()
        service(text).printOrder(order("KITCHEN", headerLogo = false))
        assertEquals(0, text.allBytes().count(GS_V_0))
        assertEquals(1, text.allBytes().count(HEADER_TEXT))

        val hidden = MockPrinterTransport()
        service(hidden).printOrder(order("KITCHEN", headerVisible = false))
        assertEquals(0, hidden.allBytes().count(GS_V_0))
        assertEquals(-1, hidden.allBytes().indexOf(HEADER_TEXT))
    }

    @Test
    fun `test page shows the logo so raster support is checked up front`() = runTest {
        val transport = MockPrinterTransport()
        assertTrue(service(transport, PaperWidth.MM58).printTestPage().isSuccess)
        val bytes = transport.allBytes()
        assertTrue(bytes.count(GS_V_0) > 0)
        assertEquals(-1, bytes.indexOf(HEADER_TEXT))
    }
}
