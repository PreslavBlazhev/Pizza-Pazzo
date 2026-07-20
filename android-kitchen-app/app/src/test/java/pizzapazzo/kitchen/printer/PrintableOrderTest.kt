package pizzapazzo.kitchen.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pizzapazzo.kitchen.models.PrintableOrder

class PrintableOrderTest {

    private val fullJson = """
        {
          "orderId": "152",
          "orderNumber": "152",
          "createdAt": "2026-07-20T12:25:00Z",
          "acceptedAt": "2026-07-20T12:27:00Z",
          "estimatedMinutes": 30,
          "customer": { "name": "Иван Петров", "phone": "0888123456", "email": "ivan@example.com" },
          "delivery": {
            "type": "DELIVERY", "address": "ул. Примерна 10",
            "entrance": "А", "floor": "3", "apartment": "7"
          },
          "items": [
            {
              "name": "Маргарита", "quantity": 2, "size": "Голяма",
              "unitPrice": 10.50, "totalPrice": 21.00,
              "extras": [ { "name": "Двойна моцарела", "quantity": 1, "price": 2.00 } ],
              "removedIngredients": ["Лук"],
              "note": "По-препечена"
            }
          ],
          "paymentMethod": "CASH",
          "customerNote": "Да се звънне при пристигане",
          "subtotal": 23.00, "deliveryFee": 2.50, "discount": 0, "total": 25.50,
          "currency": "EUR"
        }
    """.trimIndent()

    @Test
    fun `parses the full sample order`() {
        val order = PrintableOrder.fromJson(fullJson).getOrThrow()
        assertEquals("152", order.orderNumber)
        assertEquals(30, order.estimatedMinutes)
        assertEquals("Иван Петров", order.customer.name)
        assertEquals(1, order.items.size)
        val item = order.items[0]
        assertEquals(2, item.quantity)
        assertEquals("Голяма", item.size)
        assertEquals(1, item.extras.size)
        assertEquals("Двойна моцарела", item.extras[0].name)
        assertEquals(listOf("Лук"), item.removedIngredients)
        assertEquals(25.50, order.total!!, 0.001)
        assertFalse(order.isReprint)
    }

    @Test
    fun `invalid json fails without throwing`() {
        val result = PrintableOrder.fromJson("{not json")
        assertTrue(result.isFailure)
    }

    @Test
    fun `empty string fails`() {
        assertTrue(PrintableOrder.fromJson("").isFailure)
    }

    @Test
    fun `order without items is rejected`() {
        val result = PrintableOrder.fromJson("""{"orderId":"1","items":[]}""")
        assertTrue(result.isFailure)
    }

    @Test
    fun `order without number or id is rejected`() {
        val result =
            PrintableOrder.fromJson("""{"items":[{"name":"Пица","quantity":1}]}""")
        assertTrue(result.isFailure)
    }

    @Test
    fun `oversized payload is rejected`() {
        val big = """{"orderId":"1","note":"${"x".repeat(PrintableOrder.MAX_JSON_BYTES)}"}"""
        assertTrue(PrintableOrder.fromJson(big).isFailure)
    }

    @Test
    fun `null and missing fields become kotlin nulls`() {
        val order = PrintableOrder.fromJson(
            """
            {
              "orderId": "9",
              "customer": { "name": null },
              "items": [ { "name": "Пица Пацо", "quantity": 1 } ]
            }
            """.trimIndent()
        ).getOrThrow()
        assertNull(order.customer.name)
        assertNull(order.customer.phone)
        assertNull(order.total)
        assertNull(order.customerNote)
        assertNull(order.items[0].size)
        assertTrue(order.items[0].extras.isEmpty())
        assertTrue(order.items[0].removedIngredients.isEmpty())
        assertEquals("EUR", order.currency) // default
        assertEquals("DELIVERY", order.delivery.type) // default
    }

    @Test
    fun `orderNumber falls back to orderId and vice versa`() {
        val a = PrintableOrder.fromJson(
            """{"orderId":"77","items":[{"name":"X","quantity":1}]}"""
        ).getOrThrow()
        assertEquals("77", a.orderNumber)

        val b = PrintableOrder.fromJson(
            """{"orderNumber":"88","items":[{"name":"X","quantity":1}]}"""
        ).getOrThrow()
        assertEquals("88", b.orderId)
    }

    @Test
    fun `zero or negative quantity is clamped to one`() {
        val order = PrintableOrder.fromJson(
            """{"orderId":"1","items":[{"name":"Пица","quantity":0}]}"""
        ).getOrThrow()
        assertEquals(1, order.items[0].quantity)
    }

    @Test
    fun `reprint flag and secondary currency are parsed`() {
        val order = PrintableOrder.fromJson(
            """
            {
              "orderId":"5","isReprint":true,
              "total": 25.50, "currency":"EUR",
              "totalSecondary": 49.89, "secondaryCurrency":"лв",
              "items":[{"name":"Пица","quantity":1}]
            }
            """.trimIndent()
        ).getOrThrow()
        assertTrue(order.isReprint)
        assertEquals(49.89, order.totalSecondary!!, 0.001)
        assertEquals("лв", order.secondaryCurrency)
    }
}
