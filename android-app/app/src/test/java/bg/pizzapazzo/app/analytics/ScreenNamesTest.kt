package bg.pizzapazzo.app.analytics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Screen names are sent to Google, so they must be route names — never a
 * token, a receipt, an order number or anything typed into the address.
 */
class ScreenNamesTest {

    private fun name(url: String?) = ScreenNames.forUrl(url)?.name

    @Test
    fun `customer routes get stable names in both languages`() {
        assertEquals("home", name("https://pizzapazzo.bg/"))
        assertEquals("home", name("https://pizzapazzo.bg/en"))
        assertEquals("menu", name("https://pizzapazzo.bg/menu"))
        assertEquals("menu", name("https://pizzapazzo.bg/en/menu"))
        assertEquals("menu/standard-pizzas", name("https://pizzapazzo.bg/menu/standard-pizzas"))
        assertEquals("cart", name("https://www.pizzapazzo.bg/cart"))
        assertEquals("checkout", name("https://pizzapazzo.bg/checkout"))
        assertEquals("login", name("https://pizzapazzo.bg/auth/login"))
        assertEquals("register", name("https://pizzapazzo.bg/en/auth/register"))
        assertEquals("app_privacy", name("https://pizzapazzo.bg/app-privacy"))
    }

    @Test
    fun `dynamic segments are collapsed`() {
        assertEquals("product", name("https://pizzapazzo.bg/product/cm1abc123"))
        assertEquals("checkout_payment", name("https://pizzapazzo.bg/checkout/pay/SECRETtoken_1234567890"))
        assertEquals("profile_orders", name("https://pizzapazzo.bg/profile/orders/123"))
    }

    @Test
    fun `query strings never reach the name`() {
        assertEquals("order_success", name("https://pizzapazzo.bg/order-success?n=1042&r=signedreceipt"))
        assertEquals("payment_success", name("https://pizzapazzo.bg/payment/success?t=SECRETtoken_1234567890"))
    }

    @Test
    fun `unknown paths are reported as other`() {
        assertEquals("other", name("https://pizzapazzo.bg/ivan.petrov@example.com"))
        assertEquals("other", name("https://pizzapazzo.bg/menu/a/b"))
        assertEquals("menu_category", name("https://pizzapazzo.bg/menu/Some%20Thing"))
    }

    @Test
    fun `staff area, foreign hosts and junk are not reported`() {
        assertNull(name("https://pizzapazzo.bg/admin"))
        assertNull(name("https://pizzapazzo.bg/en/admin/orders/live"))
        assertNull(name("https://bank.example.com/pay"))
        assertNull(name("https://pizzapazzo.bg@evil.com/menu"))
        assertNull(name(null))
        assertNull(name("tel:+359882484777"))
    }

    @Test
    fun `two products share a name but not a de-duplication key`() {
        val a = ScreenNames.forUrl("https://pizzapazzo.bg/product/a")!!
        val b = ScreenNames.forUrl("https://pizzapazzo.bg/product/b")!!
        assertEquals(a.name, b.name)
        assertNotEquals(a.key, b.key)
        assertEquals(
            ScreenNames.forUrl("https://pizzapazzo.bg/menu?x=1")!!.key,
            ScreenNames.forUrl("https://pizzapazzo.bg/menu#top")!!.key,
        )
    }
}
