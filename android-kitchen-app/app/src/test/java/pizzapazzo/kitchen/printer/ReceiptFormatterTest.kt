package pizzapazzo.kitchen.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import pizzapazzo.kitchen.models.PrintableOrder

class ReceiptFormatterTest {

    private val settings58 = PrinterSettings(paperWidth = PaperWidth.MM58, charsPerLine = 32)
    private val settings80 = PrinterSettings(paperWidth = PaperWidth.MM80, charsPerLine = 48)

    private fun order(
        deliveryType: String = "DELIVERY",
        payment: String = "CASH",
        isReprint: Boolean = false,
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
        totalSecondary = 49.89,
        secondaryCurrency = "лв",
        isReprint = isReprint,
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
        assertTrue(text.contains("ОБЩО: 25.50 EUR"))
        assertTrue(text.contains("(49.89 лв)"))
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
            totalSecondary = null,
            secondaryCurrency = null,
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
}
