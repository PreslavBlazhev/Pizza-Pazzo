package pizzapazzo.kitchen.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import pizzapazzo.kitchen.models.PrintLayout
import pizzapazzo.kitchen.models.PrintableOrder

class ReceiptFormatterTest {

    private val settings58 = PrinterSettings(paperWidth = PaperWidth.MM58, charsPerLine = 32)
    private val settings80 = PrinterSettings(paperWidth = PaperWidth.MM80, charsPerLine = 48)

    private fun order(
        deliveryType: String = "DELIVERY",
        payment: String = "CASH",
        isReprint: Boolean = false,
        layout: PrintLayout = PrintLayout.DEFAULT,
        items: List<PrintableOrder.Item> = listOf(
            PrintableOrder.Item(
                name = "Маргарита",
                quantity = 2,
                size = "Голяма",
                unitPrice = 10.50,
                totalPrice = 21.00,
                extras = listOf(PrintableOrder.Extra("Двойна моцарела", 1, 2.00)),
                removedIngredients = listOf("Лук"),
                note = "По-препечена",
            )
        ),
    ) = PrintableOrder(
        orderId = "152",
        orderNumber = "152",
        createdAt = "2026-07-20T12:25:00Z",
        acceptedAt = "2026-07-20T12:27:00Z",
        estimatedMinutes = 30,
        customer = PrintableOrder.Customer("Иван Петров", "0888123456", "ivan@example.com"),
        delivery = PrintableOrder.Delivery(deliveryType, "ул. Примерна 10", "Варна", "А", "3", "7"),
        items = items,
        paymentMethod = payment,
        customerNote = "Да се звънне при пристигане",
        subtotal = 23.00,
        deliveryFee = 2.50,
        discount = 0.0,
        total = 25.50,
        currency = "EUR",
        isReprint = isReprint,
        layout = layout,
    )

    private fun textOf(order: PrintableOrder, settings: PrinterSettings): String =
        ReceiptFormatter.toPlainText(ReceiptFormatter.format(order, settings), settings)

    @Test
    fun `receipt carries every important field`() {
        val text = textOf(order(), settings80)
        assertTrue(text.contains("PIZZA PAZZO"))
        assertTrue(text.contains("ПОРЪЧКА #152"))
        assertTrue(text.contains("Готова за: 30 минути"))
        assertTrue(text.contains("Иван Петров"))
        assertTrue(text.contains("0888123456"))
        assertTrue(text.contains("ДОСТАВКА"))
        assertTrue(text.contains("ул. Примерна 10"))
        assertTrue(text.contains("вх. А"))
        assertTrue(text.contains("ет. 3"))
        assertTrue(text.contains("ап. 7"))
        assertTrue(text.contains("2 x МАРГАРИТА"))
        assertTrue(text.contains("Размер: Голяма"))
        assertTrue(text.contains("+ Двойна моцарела (2.00)"))
        assertTrue(text.contains("БЕЗ: Лук"))
        assertTrue(text.contains("Бележка: По-препечена"))
        assertTrue(text.contains("В брой"))
        assertTrue(text.contains("Междинна сума"))
        assertTrue(text.contains("Доставка"))
        // The grand total is now a label/value row like the other money lines,
        // so the amount is pushed to the right edge instead of following a colon.
        assertTrue(text.contains("ОБЩО"))
        assertTrue(text.contains("25.50 EUR"))
        assertTrue(text.contains("Бележка от клиента:"))
        assertTrue(text.contains("Да се звънне при пристигане"))
    }

    @Test
    fun `zero discount is not printed`() {
        assertFalse(textOf(order(), settings80).contains("Отстъпка"))
    }

    @Test
    fun `positive discount is printed`() {
        val withDiscount = order().copy(discount = 3.0)
        assertTrue(textOf(withDiscount, settings80).contains("Отстъпка"))
    }

    @Test
    fun `pickup order prints pickup label`() {
        val text = textOf(order(deliveryType = "PICKUP"), settings80)
        assertTrue(text.contains("ВЗЕМАНЕ ОТ МЯСТО"))
        assertFalse(text.contains("ДОСТАВКА\n"))
    }

    @Test
    fun `card payment label`() {
        assertTrue(textOf(order(payment = "CARD"), settings80).contains("С карта"))
    }

    @Test
    fun `cash on delivery label`() {
        assertTrue(
            textOf(order(payment = "CASH_ON_DELIVERY"), settings80)
                .contains("В брой (наложен платеж)")
        )
    }

    @Test
    fun `reprint banner appears only when flagged`() {
        assertTrue(textOf(order(isReprint = true), settings80).contains("ПОВТОРЕН ПЕЧАТ"))
        assertFalse(textOf(order(), settings80).contains("ПОВТОРЕН ПЕЧАТ"))
    }

    @Test
    fun `58mm lines never exceed the width`() {
        val lines = ReceiptFormatter.format(order(), settings58)
        for (line in lines) {
            val visual = if (line.big) line.text.length * 2 else line.text.length
            assertTrue("Too long: '${line.text}'", visual <= settings58.charsPerLine)
        }
    }

    @Test
    fun `80mm lines never exceed the width`() {
        val lines = ReceiptFormatter.format(order(), settings80)
        for (line in lines) {
            val visual = if (line.big) line.text.length * 2 else line.text.length
            assertTrue("Too long: '${line.text}'", visual <= settings80.charsPerLine)
        }
    }

    @Test
    fun `very long product names wrap without losing text`() {
        val longName = "Свръхдългоименувана пица със сирене качотта и още много неща"
        val o = order(
            items = listOf(
                PrintableOrder.Item(longName, 1, null, null, 15.0, emptyList(), emptyList(), null)
            )
        )
        val text = textOf(o, settings58)
        // Wrapped over lines, but no characters are lost.
        val squashed = text.replace(Regex("\\s+"), "")
        assertTrue(squashed.contains(longName.uppercase().replace(Regex("\\s+"), "")))
    }

    @Test
    fun `multiple items all appear`() {
        val o = order(
            items = listOf(
                PrintableOrder.Item("Маргарита", 1, "30 см", 8.0, 8.0, emptyList(), emptyList(), null),
                PrintableOrder.Item("Капричоза", 3, "40 см", 10.0, 30.0, emptyList(), emptyList(), null),
                PrintableOrder.Item("Кока-Кола", 2, null, 1.5, 3.0, emptyList(), emptyList(), null),
            )
        )
        val text = textOf(o, settings80)
        assertTrue(text.contains("1 x МАРГАРИТА"))
        assertTrue(text.contains("3 x КАПРИЧОЗА"))
        assertTrue(text.contains("2 x КОКА-КОЛА"))
    }

    @Test
    fun `order with nothing optional still formats`() {
        val minimal = PrintableOrder(
            orderId = "1",
            orderNumber = "1",
            createdAt = null,
            acceptedAt = null,
            estimatedMinutes = null,
            customer = PrintableOrder.Customer(null, null, null),
            delivery = PrintableOrder.Delivery("DELIVERY", null, null, null, null, null),
            items = listOf(
                PrintableOrder.Item("Пица", 1, null, null, null, emptyList(), emptyList(), null)
            ),
            paymentMethod = null,
            customerNote = null,
            subtotal = null,
            deliveryFee = null,
            discount = null,
            total = null,
            currency = "EUR",
            isReprint = false,
        )
        val text = textOf(minimal, settings58)
        assertTrue(text.contains("ПОРЪЧКА #1"))
        assertTrue(text.contains("1 x ПИЦА"))
    }

    @Test
    fun `test page contains cyrillic alphabet digits symbols and eur`() {
        val text = ReceiptFormatter.toPlainText(
            ReceiptFormatter.formatTestPage(settings80),
            settings80,
        )
        assertTrue(text.contains("АБВГДЕЖЗ"))
        assertTrue(text.contains("абвгдежз"))
        assertTrue(text.contains("0123456789"))
        assertTrue(text.contains("EUR"))
        assertTrue(text.contains("МАРГАРИТА"))
    }

    @Test
    fun `wrap hard-breaks single words longer than a line`() {
        val lines = ReceiptFormatter.wrap("абвгдежзийклмнопрст", 8)
        assertTrue(lines.all { it.length <= 8 })
        assertEquals("абвгдежзийклмнопрст", lines.joinToString(""))
    }

    // ── Extras (добавки/сосове) ─────────────────────────────────────────────
    // The web adapter (lib/android-printer.ts) sends one Extra per chosen
    // add-on: `quantity` stays its own field, `price` is that extra's total for
    // ONE unit of the dish, and multi-quantity lines carry a "/ всяка" hint in
    // the name. These tests pin that rendering contract.

    private fun itemWith(
        extras: List<PrintableOrder.Extra>,
        name: String = "Маргарита",
        quantity: Int = 1,
        size: String? = "30 см",
    ) = PrintableOrder.Item(
        name = name,
        quantity = quantity,
        size = size,
        unitPrice = 6.65,
        totalPrice = 6.65 * quantity,
        extras = extras,
        removedIngredients = emptyList(),
        note = null,
    )

    @Test
    fun `item without extras prints no plus lines`() {
        val text = textOf(order(items = listOf(itemWith(emptyList()))), settings80)
        assertTrue(text.contains("1 x МАРГАРИТА"))
        assertTrue(text.contains("Размер: 30 см"))
        assertFalse(text.lines().any { it.trimStart().startsWith("+ ") })
    }

    @Test
    fun `empty extras array formats like a plain item`() {
        val withEmpty = textOf(order(items = listOf(itemWith(emptyList()))), settings58)
        assertTrue(withEmpty.contains("1 x МАРГАРИТА"))
    }

    @Test
    fun `single crust prints without a quantity prefix`() {
        val text = textOf(
            order(items = listOf(itemWith(listOf(PrintableOrder.Extra("Кашкавален борд", 1, 3.58))))),
            settings80,
        )
        assertTrue(text.contains("+ Кашкавален борд (3.58)"))
        assertFalse(text.contains("1x Кашкавален борд"))
    }

    @Test
    fun `sauce quantity two prints the quantity prefix and its total price`() {
        val text = textOf(
            order(items = listOf(itemWith(listOf(PrintableOrder.Extra("Чеснов сос", 2, 2.04))))),
            settings80,
        )
        assertTrue(text.contains("+ 2x Чеснов сос (2.04)"))
    }

    @Test
    fun `burger addon prints with its price`() {
        val text = textOf(
            order(
                items = listOf(
                    itemWith(
                        extras = listOf(PrintableOrder.Extra("Чедър", 1, 0.77)),
                        name = "Пилешки",
                        size = null,
                    )
                )
            ),
            settings80,
        )
        assertTrue(text.contains("1 x ПИЛЕШКИ"))
        assertTrue(text.contains("+ Чедър (0.77)"))
        assertFalse(text.contains("Размер:"))
    }

    @Test
    fun `main quantity two keeps the per-unit hint from the adapter`() {
        val text = textOf(
            order(
                items = listOf(
                    itemWith(
                        extras = listOf(
                            PrintableOrder.Extra("Кашкавален борд / всяка", 1, 3.58),
                            PrintableOrder.Extra("Чеснов сос / всяка", 2, 2.04),
                        ),
                        quantity = 2,
                    )
                )
            ),
            settings80,
        )
        assertTrue(text.contains("2 x МАРГАРИТА"))
        assertTrue(text.contains("+ Кашкавален борд / всяка (3.58)"))
        assertTrue(text.contains("+ 2x Чеснов сос / всяка (2.04)"))
    }

    @Test
    fun `long bulgarian extra name wraps without losing text`() {
        val longBg = "Кашкавален борд с допълнително синьо сирене и печени чушки"
        val lines = ReceiptFormatter.format(
            order(items = listOf(itemWith(listOf(PrintableOrder.Extra(longBg, 1, 4.60))))),
            settings58,
        )
        for (line in lines) {
            val visual = if (line.big) line.text.length * 2 else line.text.length
            assertTrue("Too long: '${line.text}'", visual <= settings58.charsPerLine)
        }
        val squashed = ReceiptFormatter.toPlainText(lines, settings58).replace(Regex("\\s+"), "")
        assertTrue(squashed.contains(longBg.replace(Regex("\\s+"), "")))
    }

    @Test
    fun `long english extra name wraps without losing text`() {
        val longEn = "Philadelphia crust with extra blue cheese and roasted peppers"
        val lines = ReceiptFormatter.format(
            order(items = listOf(itemWith(listOf(PrintableOrder.Extra(longEn, 1, 4.60))))),
            settings58,
        )
        for (line in lines) {
            assertTrue("Too long: '${line.text}'", line.text.length <= settings58.charsPerLine)
        }
        val squashed = ReceiptFormatter.toPlainText(lines, settings58).replace(Regex("\\s+"), "")
        assertTrue(squashed.contains(longEn.replace(Regex("\\s+"), "")))
    }

    @Test
    fun `extra without a price prints just the name`() {
        val text = textOf(
            order(items = listOf(itemWith(listOf(PrintableOrder.Extra("Месна добавка", 1, null))))),
            settings80,
        )
        assertTrue(text.contains("+ Месна добавка"))
        assertFalse(text.contains("+ Месна добавка ("))
    }

    // ── Website-driven layout (PrintLayout) ────────────────────────────────

    private fun layoutWith(vararg sections: Pair<String, PrintLayout.SectionStyle>) =
        PrintLayout(sections = sections.toMap())

    @Test
    fun `a hidden section is not printed at all`() {
        val hidden = layoutWith("customerPhone" to PrintLayout.SectionStyle(visible = false))
        val text = textOf(order(layout = hidden), settings80)
        assertFalse(text.contains("0888123456"))
        // Everything else survives.
        assertTrue(text.contains("Иван Петров"))
    }

    @Test
    fun `hiding prices removes the money column but keeps the dish`() {
        val noPrices = layoutWith(
            "itemPrice" to PrintLayout.SectionStyle(visible = false),
            "totals" to PrintLayout.SectionStyle(visible = false),
            "grandTotal" to PrintLayout.SectionStyle(visible = false),
        )
        val text = textOf(order(layout = noPrices), settings80)
        assertTrue(text.contains("2 x МАРГАРИТА"))
        assertFalse(text.contains("21.00"))
        assertFalse(text.contains("25.50"))
    }

    @Test
    fun `section scale reaches the line and shrinks its wrap width`() {
        val big = layoutWith("items" to PrintLayout.SectionStyle(scale = 3))
        val lines = ReceiptFormatter.format(order(layout = big), settings80)
        val itemLine = lines.first { it.text.contains("МАРГАРИТА") }
        assertEquals(3, itemLine.scale)
        // At 3x each glyph is 3 columns wide, so the text must fit 48/3 = 16.
        assertTrue("Too long: '${itemLine.text}'", itemLine.text.length <= 16)
    }

    @Test
    fun `alignment from the layout reaches the line`() {
        val aligned = layoutWith(
            "customerName" to PrintLayout.SectionStyle(align = "right"),
            "customerPhone" to PrintLayout.SectionStyle(align = "center"),
        )
        val lines = ReceiptFormatter.format(order(layout = aligned), settings80)
        assertTrue(lines.first { it.text.contains("Иван Петров") }.right)
        assertTrue(lines.first { it.text.contains("0888123456") }.center)
    }

    @Test
    fun `header and footer text come from the layout`() {
        val custom = PrintLayout(headerText = "КУХНЯ ПАЦО", footerText = "Благодарим!")
        val text = textOf(order(layout = custom), settings80)
        assertTrue(text.contains("КУХНЯ ПАЦО"))
        assertTrue(text.contains("Благодарим!"))
    }

    @Test
    fun `an empty footer prints nothing`() {
        assertFalse(textOf(order(), settings80).trimEnd().endsWith("-"))
    }

    @Test
    fun `dividers can be switched off`() {
        val text = textOf(order(layout = PrintLayout(showDividers = false)), settings80)
        assertFalse(text.contains("----"))
    }

    @Test
    fun `charsPerLine from the layout overrides the tablet setting`() {
        val narrow = PrintLayout(charsPerLine = 24)
        val lines = ReceiptFormatter.format(order(layout = narrow), settings80)
        val divider = lines.first { it.text.startsWith("----") }
        assertEquals(24, divider.text.length)
    }

    @Test
    fun `every line fits the paper at every scale`() {
        val big = PrintLayout(
            sections = mapOf(
                "items" to PrintLayout.SectionStyle(scale = 4),
                "itemExtras" to PrintLayout.SectionStyle(scale = 2),
                "orderNumber" to PrintLayout.SectionStyle(scale = 3),
            )
        )
        val lines = ReceiptFormatter.format(order(layout = big), settings58)
        for (line in lines) {
            val visual = line.text.length * line.scale
            assertTrue("Too long: '${line.text}' at ${line.scale}x", visual <= settings58.charsPerLine)
        }
    }

    @Test
    fun `ten sauces still fit the 58mm width`() {
        val lines = ReceiptFormatter.format(
            order(items = listOf(itemWith(listOf(PrintableOrder.Extra("Млечно-чеснов сос", 10, 10.20))))),
            settings58,
        )
        for (line in lines) {
            val visual = if (line.big) line.text.length * 2 else line.text.length
            assertTrue("Too long: '${line.text}'", visual <= settings58.charsPerLine)
        }
        assertTrue(
            ReceiptFormatter.toPlainText(lines, settings58).contains("10x Млечно-чеснов сос")
        )
    }
}
