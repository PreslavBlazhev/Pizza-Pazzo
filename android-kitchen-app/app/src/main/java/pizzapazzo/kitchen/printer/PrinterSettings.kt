package pizzapazzo.kitchen.printer

/**
 * How Cyrillic text is sent to the printer.
 *
 * Not every ESC/POS printer understands UTF-8 — most budget thermal printers
 * only speak single-byte code pages selected with `ESC t n`, and the value of
 * `n` for a given code page differs between vendors. That is why the `ESC t`
 * argument is stored per mode and is user-overridable in settings.
 *
 * If none of the text modes renders Cyrillic on a particular printer, the
 * documented fallback is raster printing: render each line to a 1-bit bitmap
 * and send it with `GS v 0`. The seam for that is [EscPosPrinterService] —
 * a `RasterReceiptRenderer` would replace the text encoding step while reusing
 * [ReceiptFormatter] unchanged. Deliberately not implemented in v1.
 */
enum class CyrillicEncodingMode(
    val label: String,
    /** Java charset name used to encode the text bytes. */
    val charsetName: String,
    /** Default `ESC t n` argument; -1 = do not send a code page command. */
    val defaultCodePage: Int,
) {
    /** For printers with native UTF-8 support (newer models). */
    UTF8("UTF-8", "UTF-8", -1),

    /** DOS Cyrillic — the most widely supported Cyrillic code page. */
    CP866("CP866 (DOS Cyrillic)", "IBM866", 17),

    /** Windows Cyrillic — common on newer Chinese printers. */
    CP1251("CP1251 (Windows Cyrillic)", "windows-1251", 73);

    companion object {
        fun fromName(name: String?): CyrillicEncodingMode =
            entries.firstOrNull { it.name == name } ?: CP866
    }
}

enum class PaperWidth(val mm: Int, val defaultCharsPerLine: Int) {
    MM58(58, 32),
    MM80(80, 48);

    companion object {
        fun fromMm(mm: Int): PaperWidth = if (mm >= 80) MM80 else MM58
    }
}

/**
 * Everything the print pipeline needs to know, resolved from preferences at
 * print time. A plain data class so the formatter and encoder are trivially
 * unit-testable without Android.
 */
data class PrinterSettings(
    val printerName: String? = null,
    val printerMac: String? = null,
    val paperWidth: PaperWidth = PaperWidth.MM80,
    val charsPerLine: Int = paperWidth.defaultCharsPerLine,
    val encoding: CyrillicEncodingMode = CyrillicEncodingMode.CP866,
    /** `ESC t n` argument actually sent; falls back to the mode's default. */
    val codePage: Int = encoding.defaultCodePage,
    val autoConnect: Boolean = true,
    val autoCut: Boolean = true,
    /** Blank lines fed after the receipt so it clears the tear bar. */
    val feedLinesAfter: Int = 4,
    val connectTimeoutMs: Long = 10_000,
)
