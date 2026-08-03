package pizzapazzo.kitchen.printer

import java.io.ByteArrayOutputStream
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

/**
 * Tiny ESC/POS byte builder — only the commands the receipt needs, so the whole
 * command set stays auditable. Vendor-specific printers that don't speak plain
 * ESC/POS get their own [pizzapazzo.kitchen.bluetooth] transport later; this
 * class stays printer-agnostic.
 */
class EscPos(private val settings: PrinterSettings) {

    private val buf = ByteArrayOutputStream()
    private val charset: Charset = Charset.forName(settings.encoding.charsetName)

    /** ESC @ — reset formatting, then select the configured code page. */
    fun initialize(): EscPos = apply {
        raw(0x1B, 0x40)
        if (settings.codePage >= 0) {
            // ESC t n — select character code table. n differs between vendors,
            // which is why it is configurable (PrinterSettings.codePage).
            raw(0x1B, 0x74, settings.codePage)
        }
    }

    fun alignLeft(): EscPos = apply { raw(0x1B, 0x61, 0) }
    fun alignCenter(): EscPos = apply { raw(0x1B, 0x61, 1) }
    fun alignRight(): EscPos = apply { raw(0x1B, 0x61, 2) }

    fun bold(on: Boolean): EscPos = apply { raw(0x1B, 0x45, if (on) 1 else 0) }

    /**
     * GS ! n — character size. The high nibble is the width multiplier and the
     * low nibble the height multiplier, both 0-based (0 = 1×, 3 = 4×), which is
     * the entire size vocabulary an ESC/POS printer has. Points do not exist
     * here; that is why the website stores a 1–4 scale alongside its pt value.
     *
     * The spec allows up to 8×, but 4× already fills 80mm paper with a handful
     * of characters, so the range is clamped where it stays usable.
     */
    fun size(scale: Int): EscPos = apply {
        val steps = (scale.coerceIn(1, 4) - 1)
        raw(0x1D, 0x21, (steps shl 4) or steps)
    }

    /** GS ! — double width + double height when [on]. */
    fun doubleSize(on: Boolean): EscPos = apply { size(if (on) 2 else 1) }

    fun feed(lines: Int): EscPos = apply {
        if (lines > 0) raw(0x1B, 0x64, lines.coerceAtMost(20)) // ESC d n
    }

    /** GS V 66 0 — partial cut with feed; ignored by printers without a cutter. */
    fun cut(): EscPos = apply { raw(0x1D, 0x56, 0x42, 0x00) }

    /**
     * One line of text + LF. Characters the selected code page cannot express
     * are replaced with '?' rather than corrupting the byte stream.
     */
    fun line(text: String): EscPos = apply {
        buf.write(encode(text))
        buf.write(0x0A)
    }

    fun bytes(): ByteArray = buf.toByteArray()

    private fun encode(text: String): ByteArray {
        val encoder = charset.newEncoder()
            .onUnmappableCharacter(CodingErrorAction.REPLACE)
            .onMalformedInput(CodingErrorAction.REPLACE)
            .replaceWith(byteArrayOf('?'.code.toByte()))
        return try {
            val bb = encoder.encode(java.nio.CharBuffer.wrap(text))
            ByteArray(bb.remaining()).also { bb.get(it) }
        } catch (e: CharacterCodingException) {
            text.map { if (it.code in 32..126) it else '?' }.joinToString("")
                .toByteArray(Charsets.US_ASCII)
        }
    }

    private fun raw(vararg values: Int) {
        for (v in values) buf.write(v)
    }
}
