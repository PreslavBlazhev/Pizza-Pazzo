package bg.pizzapazzo.app.printer

/**
 * The Pizza Pazzo logo as a ready 1-bit raster for the thermal printer.
 *
 * The bitmaps are generated from the ORIGINAL logo (lettering + every
 * ornament, black on white) by `scripts/generate-print-logo.mjs` in the
 * website repo and shipped in `res/raw`:
 *   - `receipt_logo_288.bin` → 58 mm paper (288 dots = 36 mm at 203 dpi)
 *   - `receipt_logo_384.bin` → 80 mm paper (384 dots = 48 mm)
 * Nothing is decoded or scaled on the tablet, so the bytes sent to the printer
 * are deterministic and covered by JVM unit tests.
 *
 * File format: "PPL1" | u16 BE bytes-per-row | u16 BE rows | rows × bytes.
 * Bit 7 of each byte is the leftmost dot, 1 = black — exactly the data layout
 * of the ESC/POS `GS v 0` raster command ([EscPos.rasterImage]).
 */
class ReceiptLogo(
    val bytesPerRow: Int,
    val rows: Int,
    /** `rows * bytesPerRow` bytes, row-major. */
    val data: ByteArray,
) {
    init {
        require(bytesPerRow > 0 && rows > 0 && data.size == bytesPerRow * rows) {
            "Invalid logo raster"
        }
    }

    val widthDots: Int get() = bytesPerRow * 8

    fun isBlack(x: Int, y: Int): Boolean =
        data[y * bytesPerRow + (x shr 3)].toInt() and (0x80 ushr (x and 7)) != 0

    /**
     * The same logo with blank columns added on the left so it sits centred on
     * paper [paperDots] wide. Centring is baked into the image instead of left
     * to `ESC a 1`, which not every printer applies to raster images; the
     * right side is NOT padded, so a printer whose real print area is a little
     * narrower (e.g. 512 dots on 80 mm) still prints the whole logo.
     */
    fun centredOn(paperDots: Int): ReceiptLogo {
        val padBytes = ((paperDots - widthDots) / 2 / 8).coerceAtLeast(0)
        if (padBytes == 0) return this
        val newBytesPerRow = bytesPerRow + padBytes
        val out = ByteArray(newBytesPerRow * rows)
        for (y in 0 until rows) {
            System.arraycopy(data, y * bytesPerRow, out, y * newBytesPerRow + padBytes, bytesPerRow)
        }
        return ReceiptLogo(newBytesPerRow, rows, out)
    }

    companion object {
        private val MAGIC = byteArrayOf('P'.code.toByte(), 'P'.code.toByte(), 'L'.code.toByte(), '1'.code.toByte())

        /** Logo width in dots for a paper width — the file `receipt_logo_<n>.bin`. */
        fun widthDotsFor(paper: PaperWidth): Int = when (paper) {
            PaperWidth.MM58 -> 288
            PaperWidth.MM80 -> 384
        }

        /** Print-head width at 203 dpi: 48 mm on 58 mm paper, 72 mm on 80 mm. */
        fun paperDotsFor(paper: PaperWidth): Int = when (paper) {
            PaperWidth.MM58 -> 384
            PaperWidth.MM80 -> 576
        }

        /** Parses a `.bin` raster; null for anything malformed (→ text header). */
        fun parse(bytes: ByteArray): ReceiptLogo? {
            if (bytes.size < 8) return null
            for (i in MAGIC.indices) if (bytes[i] != MAGIC[i]) return null
            val bytesPerRow = ((bytes[4].toInt() and 0xFF) shl 8) or (bytes[5].toInt() and 0xFF)
            val rows = ((bytes[6].toInt() and 0xFF) shl 8) or (bytes[7].toInt() and 0xFF)
            if (bytesPerRow !in 1..MAX_BYTES_PER_ROW || rows !in 1..MAX_ROWS) return null
            if (bytes.size != 8 + bytesPerRow * rows) return null
            return ReceiptLogo(bytesPerRow, rows, bytes.copyOfRange(8, bytes.size))
        }

        /** 576 dots — the widest common thermal head. */
        private const val MAX_BYTES_PER_ROW = 72
        /** ~6 cm of logo; anything taller is not a header. */
        private const val MAX_ROWS = 480
    }
}
