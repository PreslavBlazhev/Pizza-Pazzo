package bg.pizzapazzo.app.webview

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [StaffRoutes] decides whether the app behaves like a phone app or like a
 * kitchen terminal, and it gates the printer bridge as a second line of defence.
 *
 * Both halves matter here. A false negative means a cook's tablet dims mid
 * service and the print button stops answering. A false positive means a
 * customer's phone is held awake, and a customer-facing page can reach the
 * printer bridge — which is exactly what the check exists to prevent.
 *
 * These run on the plain JVM: the URL parsing behind them is [UrlParts], not
 * `android.net.Uri`, precisely so that this check can be tested at all.
 *
 * BuildConfig.ALLOW_DEV_ORIGINS is false in the release variant these run
 * against, so the dev hosts are correctly absent from the allowlist here.
 */
class StaffRoutesTest {

    // ── Not the staff area ───────────────────────────────────────────────────

    @Test
    fun `null and blank are not staff`() {
        assertFalse(StaffRoutes.isStaffArea(null))
        assertFalse(StaffRoutes.isStaffArea(""))
        assertFalse(StaffRoutes.isStaffArea("   "))
    }

    @Test
    fun `an off-site url is never staff even when its path says admin`() {
        // The whole point: an attacker-controlled host must not be able to put
        // the app into terminal mode or reach the printer by choosing a path.
        assertFalse(StaffRoutes.isStaffArea("https://evil.example.com/admin"))
        assertFalse(StaffRoutes.isStaffArea("https://evil.example.com/admin/orders/live"))
        assertFalse(StaffRoutes.isStaffArea("https://pizzapazzo.bg.evil.example.com/admin"))
    }

    @Test
    fun `plain http is never staff`() {
        assertFalse(StaffRoutes.isStaffArea("http://pizza-pazzo.onrender.com/admin"))
    }

    @Test
    fun `a path that merely starts with the word admin is not staff`() {
        // /administrators would otherwise slip through a naive startsWith check.
        assertFalse(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/administrators"))
        assertFalse(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin-guide"))
    }

    @Test
    fun `a customer page nested under a product named admin is not staff`() {
        assertFalse(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/product/admin"))
        assertFalse(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/menu/admin"))
    }

    // ── The staff area ───────────────────────────────────────────────────────

    @Test
    fun `the admin root and everything under it is staff`() {
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin"))
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin/"))
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin/orders"))
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin/orders/live"))
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin/settings"))
    }

    @Test
    fun `the english locale prefix still resolves to staff`() {
        // The site serves Bulgarian on the bare path and English behind /en,
        // so /en/admin is the same board in another language.
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/en/admin"))
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/en/admin/orders/live"))
    }

    @Test
    fun `a query string or fragment does not hide the staff path`() {
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin/orders?status=new"))
        assertTrue(StaffRoutes.isStaffArea("https://pizza-pazzo.onrender.com/admin/orders#top"))
    }

    @Test
    fun `every production host is treated alike`() {
        assertTrue(StaffRoutes.isStaffArea("https://pizzapazzo.bg/admin/orders/live"))
        assertTrue(StaffRoutes.isStaffArea("https://www.pizzapazzo.bg/admin/orders/live"))
    }

    // ── Customer pages ───────────────────────────────────────────────────────

    @Test
    fun `the pages a customer actually visits are not staff`() {
        val customerPages = listOf(
            "https://pizza-pazzo.onrender.com/",
            "https://pizza-pazzo.onrender.com/menu",
            "https://pizza-pazzo.onrender.com/menu/pizzi",
            "https://pizza-pazzo.onrender.com/product/margarita",
            "https://pizza-pazzo.onrender.com/cart",
            "https://pizza-pazzo.onrender.com/checkout",
            "https://pizza-pazzo.onrender.com/order-success",
            "https://pizza-pazzo.onrender.com/profile",
            "https://pizza-pazzo.onrender.com/profile/orders",
            "https://pizza-pazzo.onrender.com/auth/login",
            "https://pizza-pazzo.onrender.com/auth/register",
            "https://pizza-pazzo.onrender.com/contacts",
            "https://pizza-pazzo.onrender.com/account-deletion",
            "https://pizza-pazzo.onrender.com/en/menu",
            "https://pizza-pazzo.onrender.com/en/checkout",
        )
        for (page in customerPages) {
            assertFalse("expected customer page: $page", StaffRoutes.isStaffArea(page))
        }
    }
}
