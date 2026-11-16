package bg.pizzapazzo.app.analytics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [AnalyticsEventSanitizer] is what stands between the site and GA4. The two
 * things it must never do: let personal data through, and let a purchase
 * through without the order number that de-duplicates it.
 */
class AnalyticsEventSanitizerTest {

    private val item = """{"item_id":"p-margherita","item_name":"Маргарита","item_variant":"30 см","item_category":"standard-pizzas","price":9.5,"quantity":2}"""

    private fun purchase(extra: String = "", items: String = "[$item]") =
        """{"transaction_id":"1042","currency":"EUR","value":19,"items":$items$extra}"""

    @Test
    fun `a valid purchase keeps its GA4 fields`() {
        val e = AnalyticsEventSanitizer.sanitize("purchase", purchase(""","shipping":0"""))!!
        assertEquals("purchase", e.name)
        assertEquals("1042", e.transactionId)
        assertEquals("EUR", e.params["currency"])
        assertEquals(19.0, e.params["value"])
        assertEquals(0.0, e.params["shipping"])
        val i = e.items.single()
        assertEquals("p-margherita", i["item_id"])
        assertEquals("Маргарита", i["item_name"])
        assertEquals("30 см", i["item_variant"])
        assertEquals("standard-pizzas", i["item_category"])
        assertEquals(9.5, i["price"])
        assertEquals(2L, i["quantity"])
    }

    @Test
    fun `purchase without a valid transaction id is refused`() {
        assertNull(AnalyticsEventSanitizer.sanitize("purchase", """{"currency":"EUR","value":19,"items":[$item]}"""))
        assertNull(AnalyticsEventSanitizer.sanitize("purchase", """{"transaction_id":"abc","currency":"EUR","value":19,"items":[$item]}"""))
        assertNull(AnalyticsEventSanitizer.sanitize("purchase", """{"transaction_id":"1234567890","currency":"EUR","value":19,"items":[$item]}"""))
    }

    @Test
    fun `numeric transaction id is accepted as text`() {
        val e = AnalyticsEventSanitizer.sanitize("purchase", """{"transaction_id":77,"value":5,"items":[$item]}""")
        assertEquals("77", e?.transactionId)
    }

    @Test
    fun `currency other than EUR is refused`() {
        assertNull(AnalyticsEventSanitizer.sanitize("add_to_cart", """{"currency":"BGN","value":19,"items":[$item]}"""))
    }

    @Test
    fun `missing currency defaults to EUR`() {
        val e = AnalyticsEventSanitizer.sanitize("view_item", """{"value":9.5,"items":[$item]}""")
        assertEquals("EUR", e?.params?.get("currency"))
    }

    @Test
    fun `unknown parameters never pass`() {
        val json = """{"currency":"EUR","value":9.5,"items":[$item],"customer_email":"a@b.bg","phone":"0888123456","address":"ул. X 1","user_id":"u1"}"""
        val e = AnalyticsEventSanitizer.sanitize("add_to_cart", json)!!
        assertEquals(setOf("currency", "value"), e.params.keys)
    }

    @Test
    fun `unknown item fields never pass`() {
        val json = """{"value":9.5,"items":[{"item_id":"p1","item_name":"Пица","price":9.5,"quantity":1,"note":"звънец 3","customer":"Иван"}]}"""
        val e = AnalyticsEventSanitizer.sanitize("add_to_cart", json)!!
        assertEquals(setOf("item_id", "item_name", "price", "quantity"), e.items.single().keys)
    }

    @Test
    fun `text shaped like an email or a phone number is dropped`() {
        val email = """{"value":1,"items":[{"item_id":"p1","item_name":"me@example.com","price":1,"quantity":1}]}"""
        val phone = """{"value":1,"items":[{"item_id":"p1","item_name":"Пица 0888 123 456","price":1,"quantity":1}]}"""
        assertNull(AnalyticsEventSanitizer.sanitize("add_to_cart", email))
        assertNull(AnalyticsEventSanitizer.sanitize("add_to_cart", phone))

        val variant = """{"value":1,"items":[{"item_id":"p1","item_name":"Пица","item_variant":"+359 88 248 4777","price":1,"quantity":1}]}"""
        val e = AnalyticsEventSanitizer.sanitize("add_to_cart", variant)!!
        assertFalse(e.items.single().containsKey("item_variant"))
    }

    @Test
    fun `ordinary product names with small numbers pass`() {
        val json = """{"value":1,"items":[{"item_id":"p1","item_name":"Кока-Кола 0.5 л","item_variant":"40 см","price":1,"quantity":1}]}"""
        assertNotNull(AnalyticsEventSanitizer.sanitize("add_to_cart", json))
    }

    @Test
    fun `ecommerce events need items and a value`() {
        assertNull(AnalyticsEventSanitizer.sanitize("begin_checkout", """{"value":10,"items":[]}"""))
        assertNull(AnalyticsEventSanitizer.sanitize("begin_checkout", """{"value":10}"""))
        assertNull(AnalyticsEventSanitizer.sanitize("begin_checkout", """{"items":[$item]}"""))
    }

    @Test
    fun `bad numbers are refused`() {
        assertNull(AnalyticsEventSanitizer.sanitize("view_item", """{"value":-1,"items":[$item]}"""))
        assertNull(AnalyticsEventSanitizer.sanitize("view_item", """{"value":"9.5","items":[$item]}"""))
        val zeroQty = """{"value":1,"items":[{"item_id":"p1","item_name":"Пица","price":1,"quantity":0}]}"""
        val fractionQty = """{"value":1,"items":[{"item_id":"p1","item_name":"Пица","price":1,"quantity":1.5}]}"""
        assertNull(AnalyticsEventSanitizer.sanitize("view_item", zeroQty))
        assertNull(AnalyticsEventSanitizer.sanitize("view_item", fractionQty))
    }

    @Test
    fun `money is rounded to cents`() {
        val e = AnalyticsEventSanitizer.sanitize("view_item", """{"value":9.499999,"items":[$item]}""")
        assertEquals(9.5, e?.params?.get("value"))
    }

    @Test
    fun `too many items are refused`() {
        val items = (1..AnalyticsEventSanitizer.MAX_ITEMS + 1).joinToString(",", "[", "]") { item }
        assertNull(AnalyticsEventSanitizer.sanitize("begin_checkout", """{"value":1,"items":$items}"""))
    }

    @Test
    fun `login and sign_up carry only a simple method`() {
        val login = AnalyticsEventSanitizer.sanitize("login", """{"method":"password","email":"a@b.bg"}""")!!
        assertEquals(mapOf("method" to "password"), login.params)
        val signUp = AnalyticsEventSanitizer.sanitize("sign_up", """{"method":"a@b.bg"}""")!!
        assertTrue(signUp.params.isEmpty())
    }

    @Test
    fun `unknown events, null names and broken JSON are refused`() {
        assertNull(AnalyticsEventSanitizer.sanitize("screen_view", "{}"))
        assertNull(AnalyticsEventSanitizer.sanitize("refund", "{}"))
        assertNull(AnalyticsEventSanitizer.sanitize(null, "{}"))
        assertNull(AnalyticsEventSanitizer.sanitize("purchase", "{not json"))
        assertNull(AnalyticsEventSanitizer.sanitize("purchase", purchase(items = "[\"x\"]")))
    }
}
