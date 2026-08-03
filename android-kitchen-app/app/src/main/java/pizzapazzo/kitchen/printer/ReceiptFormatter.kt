package pizzapazzo.kitchen.printer

import pizzapazzo.kitchen.models.PrintLayout
import pizzapazzo.kitchen.models.PrintableOrder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Turns a [PrintableOrder] into a list of styled receipt lines. Pure Kotlin —
 * no Android, no ESC/POS bytes — so it is fully unit-testable; the byte
 * encoding happens afterwards in [EscPosPrinterService] via [EscPos].
 *
 * WHAT prints and HOW BIG is not decided here: every block asks the order's
 * [PrintLayout] (configured by the owner in /admin/settings/print) whether its
 * section is visible and what scale, alignment and weight it carries. A job
 * that arrives without a layout gets [PrintLayout.DEFAULT], which reproduces
 * the layout this app shipped with.
 */
object ReceiptFormatter {

    /** One printable line. `scale` is the ESC/POS size multiplier, 1–4. */
    data class Line(
        val text: String,
        val bold: Boolean = false,
        val scale: Int = 1,
        val center: Boolean = false,
        val right: Boolean = false,
    ) {
        /** Kept so existing callers/tests that think in "double size" still work. */
        val big: Boolean get() = scale >= 2
    }

    private val dateFormat: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm", Locale.forLanguageTag("bg"))

    fun format(order: PrintableOrder, settings: PrinterSettings): List<Line> {
        val layout = order.layout
        val w = (layout.charsPerLine ?: settings.charsPerLine).coerceAtLeast(20)
        val out = mutableListOf<Line>()

        /** Emits a section's lines, wrapped at its own scaled column count. */
        fun push(
            section: String,
            text: String?,
            right: String? = null,
            indent: String = "",
            fallback: PrintLayout.SectionStyle = PrintLayout.SectionStyle(),
        ) {
            if (text.isNullOrBlank()) return
            val style = layout.style(section, fallback)
            if (!style.visible) return

            // A glyph at scale N occupies N columns, so the usable width shrinks.
            // Continuation lines repeat the same indent (no hanging indent) so
            // that `avail` is exact and NO emitted line can exceed the paper.
            val columns = (w / style.scale).coerceAtLeast(8)
            val avail = (columns - indent.length).coerceAtLeast(4)

            fun emit(body: String) {
                out += Line(
                    text = body,
                    bold = style.bold,
                    scale = style.scale,
                    center = style.align == "center",
                    right = style.align == "right",
                )
            }

            val wrapped = wrap(text, avail)

            if (right == null) {
                wrapped.forEach { emit(indent + it) }
                return
            }

            // The value joins the LAST label line when it fits there; otherwise
            // it gets a line of its own, right-aligned. Never inserted in the
            // middle of a wrapped name, and never pushed past the paper edge.
            val last = wrapped.last()
            wrapped.dropLast(1).forEach { emit(indent + it) }
            if (indent.length + last.length + 1 + right.length <= columns) {
                val pad = columns - indent.length - last.length - right.length
                emit(indent + last + " ".repeat(pad) + right)
            } else {
                emit(indent + last)
                emit(" ".repeat((columns - right.length).coerceAtLeast(0)) + right)
            }
        }

        fun divider() {
            if (!layout.showDividers) return
            // Never two in a row and never a leading one — hiding the sections
            // between two dividers must not leave a stray rule behind.
            if (out.isEmpty() || out.last().text.startsWith("-".repeat(4))) return
            out += Line("-".repeat(w))
        }

        // ── Header ──
        push("header", layout.headerText.ifBlank { "PIZZA PAZZO" },
            fallback = PrintLayout.SectionStyle(bold = true, align = "center"))
        push("ticketType", layout.name.ifBlank { null },
            fallback = PrintLayout.SectionStyle(bold = true, scale = 2, align = "center"))
        push("orderNumber", "ПОРЪЧКА #${order.orderNumber}",
            fallback = PrintLayout.SectionStyle(bold = true, scale = 2, align = "center"))
        if (order.isReprint) {
            push("reprint", "*** ПОВТОРЕН ПЕЧАТ ***",
                fallback = PrintLayout.SectionStyle(bold = true, align = "center"))
        }
        push("createdAt", formatTimestamp(order.createdAt),
            fallback = PrintLayout.SectionStyle(align = "center"))
        formatTimestamp(order.acceptedAt)?.let {
            push("acceptedAt", "ПРИЕТА: $it", fallback = PrintLayout.SectionStyle(align = "center"))
        }
        order.estimatedMinutes?.let {
            push("eta", "Готова за: $it минути",
                fallback = PrintLayout.SectionStyle(bold = true, align = "center"))
        }
        divider()

        // ── Customer & delivery ──
        push("customerName", order.customer.name)
        push("customerPhone", order.customer.phone?.let { "Тел: $it" })
        push("deliveryType", deliveryLabel(order.delivery.type),
            fallback = PrintLayout.SectionStyle(bold = true))
        push("address", buildAddress(order.delivery))
        divider()

        // ── Items ──
        val showPrice = layout.visible("itemPrice")
        for (item in order.items) {
            push(
                "items",
                "${item.quantity} x ${item.name.uppercase()}",
                right = if (showPrice) formatMoney(item.totalPrice).ifBlank { null } else null,
                fallback = PrintLayout.SectionStyle(bold = true),
            )
            push("itemSize", item.size?.let { "Размер: $it" }, indent = "  ")
            for (extra in item.extras) {
                val qty = if (extra.quantity > 1) "${extra.quantity}x " else ""
                val price = if (showPrice) extra.price?.let { " (${money(it)})" } ?: "" else ""
                push("itemExtras", "+ $qty${extra.name}$price", indent = "  ")
            }
            if (item.removedIngredients.isNotEmpty()) {
                push(
                    "itemNote",
                    "БЕЗ: ${item.removedIngredients.joinToString(", ")}",
                    indent = "  ",
                    fallback = PrintLayout.SectionStyle(bold = true),
                )
            }
            push(
                "itemNote",
                item.note?.let { "Бележка: $it" },
                indent = "  ",
                fallback = PrintLayout.SectionStyle(bold = true),
            )
        }
        divider()

        // ── Totals ──
        push("payment", "Начин на плащане: ${paymentLabel(order.paymentMethod)}")
        order.subtotal?.let { push("totals", "Междинна сума", right = money(it)) }
        order.deliveryFee?.let { push("totals", "Доставка", right = money(it)) }
        order.discount?.takeIf { it > 0 }?.let {
            push("totals", "Отстъпка", right = "-${money(it)}")
        }
        order.total?.let {
            push(
                "grandTotal",
                "ОБЩО",
                right = "${money(it)} ${order.currency}",
                fallback = PrintLayout.SectionStyle(bold = true, scale = 2),
            )
        }

        // ── Customer note ──
        order.customerNote?.let {
            divider()
            push("customerNote", "Бележка от клиента: $it",
                fallback = PrintLayout.SectionStyle(bold = true))
        }

        // ── Footer ──
        if (layout.footerText.isNotBlank()) {
            divider()
            push("footer", layout.footerText,
                fallback = PrintLayout.SectionStyle(align = "center"))
        }

        return out
    }

    /** Exercises Cyrillic, Latin, digits, symbols and a tiny sample order. */
    fun formatTestPage(settings: PrinterSettings): List<Line> {
        val w = settings.charsPerLine.coerceAtLeast(20)
        val divider = Line("-".repeat(w))
        return listOf(
            Line("PIZZA PAZZO", bold = true, center = true),
            Line("ТЕСТОВА СТРАНИЦА", bold = true, scale = 2, center = true),
            divider,
            Line("АБВГДЕЖЗИЙКЛМНОПРСТУФХ"),
            Line("ЦЧШЩЪЬЮЯ"),
            Line("абвгдежзийклмнопрстуфх"),
            Line("цчшщъьюя"),
            Line("0123456789"),
            Line("!?%&()*+,-./:;<=>@#"),
            Line("Цена: 25.50 EUR"),
            divider,
            Line("Размер 1x — нормален"),
            Line("Размер 2x", scale = 2),
            Line("Размер 3x", scale = 3),
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
            val columns = (w / line.scale).coerceAtLeast(4)
            when {
                line.center -> {
                    val pad = ((columns - line.text.length) / 2).coerceAtLeast(0)
                    " ".repeat(pad) + line.text
                }
                line.right -> {
                    val pad = (columns - line.text.length).coerceAtLeast(0)
                    " ".repeat(pad) + line.text
                }
                else -> line.text
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
