package pizzapazzo.kitchen.printer

import pizzapazzo.kitchen.models.PrintableOrder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Turns a [PrintableOrder] into a list of styled receipt lines. Pure Kotlin —
 * no Android, no ESC/POS bytes — so it is fully unit-testable; the byte
 * encoding happens afterwards in [EscPosPrinterService] via [EscPos].
 */
object ReceiptFormatter {

    /** One printable line. `big` text is double width, so it wraps at width/2. */
    data class Line(
        val text: String,
        val bold: Boolean = false,
        val big: Boolean = false,
        val center: Boolean = false,
    )

    private val dateFormat: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm", Locale.forLanguageTag("bg"))

    fun format(order: PrintableOrder, settings: PrinterSettings): List<Line> {
        val w = settings.charsPerLine.coerceAtLeast(20)
        val out = mutableListOf<Line>()
        val divider = Line("-".repeat(w))

        // ── Header ──
        out += Line("PIZZA PAZZO", bold = true, center = true)
        out += wrap("ПОРЪЧКА #${order.orderNumber}", w / 2).map {
            Line(it, bold = true, big = true, center = true)
        }
        if (order.isReprint) {
            out += Line("*** ПОВТОРЕН ПЕЧАТ ***", bold = true, center = true)
        }
        formatTimestamp(order.createdAt)?.let { out += Line(it, center = true) }
        formatTimestamp(order.acceptedAt)?.let { out += Line("ПРИЕТА: $it", center = true) }
        order.estimatedMinutes?.let {
            out += Line("Готова за: $it минути", bold = true, center = true)
        }
        out += divider

        // ── Customer & delivery ──
        order.customer.name?.let { out += wrapLines(it, w) }
        order.customer.phone?.let { out += wrapLines("Тел: $it", w) }
        out += Line(deliveryLabel(order.delivery.type), bold = true)
        buildAddress(order.delivery)?.let { out += wrapLines(it, w) }
        out += divider

        // ── Items ──
        for (item in order.items) {
            val title = "${item.quantity} x ${item.name.uppercase()}"
            out += rowLines(title, formatMoney(item.totalPrice), w, bold = true)
            item.size?.let { out += wrapLines("  Размер: $it", w) }
            for (extra in item.extras) {
                val qty = if (extra.quantity > 1) "${extra.quantity}x " else ""
                val price = extra.price?.let { " (${money(it)})" } ?: ""
                out += wrapLines("  + $qty${extra.name}$price", w)
            }
            if (item.removedIngredients.isNotEmpty()) {
                out += wrapLines("  БЕЗ: ${item.removedIngredients.joinToString(", ")}", w, bold = true)
            }
            item.note?.let { out += wrapLines("  Бележка: $it", w, bold = true) }
        }
        out += divider

        // ── Totals ──
        out += wrapLines("Начин на плащане: ${paymentLabel(order.paymentMethod)}", w)
        order.subtotal?.let { out += rowLines("Междинна сума", money(it), w) }
        order.deliveryFee?.let { out += rowLines("Доставка", money(it), w) }
        order.discount?.takeIf { it > 0 }?.let { out += rowLines("Отстъпка", "-${money(it)}", w) }
        order.total?.let {
            out += wrap("ОБЩО: ${money(it)} ${order.currency}", w / 2).map { t ->
                Line(t, bold = true, big = true)
            }
        }

        // ── Customer note ──
        order.customerNote?.let {
            out += divider
            out += Line("Бележка от клиента:", bold = true)
            out += wrapLines(it, w)
        }

        return out
    }

    /** Exercises Cyrillic, Latin, digits, symbols and a tiny sample order. */
    fun formatTestPage(settings: PrinterSettings): List<Line> {
        val w = settings.charsPerLine.coerceAtLeast(20)
        val divider = Line("-".repeat(w))
        return listOf(
            Line("PIZZA PAZZO", bold = true, center = true),
            Line("ТЕСТОВА СТРАНИЦА", bold = true, big = true, center = true),
            divider,
            Line("АБВГДЕЖЗИЙКЛМНОПРСТУФХ"),
            Line("ЦЧШЩЪЬЮЯ"),
            Line("абвгдежзийклмнопрстуфх"),
            Line("цчшщъьюя"),
            Line("0123456789"),
            Line("!?%&()*+,-./:;<=>@#"),
            Line("Цена: 25.50 EUR"),
            divider,
            Line("2 x МАРГАРИТА", bold = true),
            Line("  Размер: Голяма"),
            Line("  + Двойна моцарела"),
            Line("  БЕЗ: Лук", bold = true),
            divider,
            Line("Ширина: ${settings.paperWidth.mm} mm / $w символа"),
            Line("Кодиране: ${settings.encoding.label}"),
            Line("Тестът е успешен, ако кирилицата се чете.", bold = true),
        )
    }

    /** Plain-text render (for tests, previews and diagnostics). */
    fun toPlainText(lines: List<Line>, settings: PrinterSettings): String {
        val w = settings.charsPerLine.coerceAtLeast(20)
        return lines.joinToString("\n") { line ->
            if (line.center) {
                val visual = if (line.big) line.text.length * 2 else line.text.length
                val pad = ((w - visual) / 2).coerceAtLeast(0)
                " ".repeat(if (line.big) pad / 2 else pad) + line.text
            } else {
                line.text
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun deliveryLabel(type: String): String = when (type.uppercase()) {
        "DELIVERY" -> "ДОСТАВКА"
        "PICKUP", "TAKEAWAY" -> "ВЗЕМАНЕ ОТ МЯСТО"
        else -> type
    }

    private fun paymentLabel(method: String?): String = when (method?.uppercase()) {
        null -> "—"
        "CASH", "CASH_ON_DELIVERY" -> "В брой (наложен платеж)"
        "CARD" -> "С карта"
        else -> method
    }

    private fun buildAddress(d: PrintableOrder.Delivery): String? {
        val parts = mutableListOf<String>()
        d.address?.let { parts += it }
        d.entrance?.let { parts += "вх. $it" }
        d.floor?.let { parts += "ет. $it" }
        d.apartment?.let { parts += "ап. $it" }
        d.city?.let { parts += "гр. $it" }
        return parts.joinToString(", ").ifBlank { null }
    }

    private fun formatTimestamp(iso: String?): String? {
        if (iso.isNullOrBlank()) return null
        return try {
            val instant = Instant.parse(iso)
            dateFormat.format(instant.atZone(ZoneId.systemDefault()))
        } catch (_: Exception) {
            iso // unparseable — print the raw value rather than dropping it
        }
    }

    private fun money(value: Double): String = String.format(Locale.US, "%.2f", value)

    private fun formatMoney(value: Double?): String = value?.let(::money) ?: ""

    private fun wrapLines(text: String, width: Int, bold: Boolean = false): List<Line> =
        wrap(text, width).map { Line(it, bold = bold) }

    /**
     * Label left, value right on the same line when they fit; otherwise the
     * label wraps and the value gets its own right-aligned line. Nothing is
     * ever truncated.
     */
    private fun rowLines(left: String, right: String, width: Int, bold: Boolean = false): List<Line> {
        if (right.isBlank()) return wrapLines(left, width, bold)
        val leftLines = wrap(left, width)
        val last = leftLines.last()
        return if (last.length + 1 + right.length <= width) {
            val pad = width - last.length - right.length
            leftLines.dropLast(1).map { Line(it, bold = bold) } +
                Line(last + " ".repeat(pad) + right, bold = bold)
        } else {
            leftLines.map { Line(it, bold = bold) } +
                Line(" ".repeat((width - right.length).coerceAtLeast(0)) + right, bold = bold)
        }
    }

    /** Word wrap that hard-breaks words longer than one line. Never truncates. */
    internal fun wrap(text: String, width: Int): List<String> {
        val w = width.coerceAtLeast(4)
        val words = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return listOf("")
        val lines = mutableListOf<String>()
        var current = StringBuilder()
        for (word in words) {
            var piece = word
            while (piece.length > w) {
                if (current.isNotEmpty()) {
                    lines += current.toString()
                    current = StringBuilder()
                }
                lines += piece.take(w)
                piece = piece.drop(w)
            }
            when {
                current.isEmpty() -> current.append(piece)
                current.length + 1 + piece.length <= w -> current.append(' ').append(piece)
                else -> {
                    lines += current.toString()
                    current = StringBuilder(piece)
                }
            }
        }
        if (current.isNotEmpty()) lines += current.toString()
        return lines
    }
}
