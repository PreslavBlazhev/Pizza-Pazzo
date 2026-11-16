package bg.pizzapazzo.app.analytics

import bg.pizzapazzo.app.webview.AllowedOrigins
import bg.pizzapazzo.app.webview.StaffRoutes
import bg.pizzapazzo.app.webview.UrlParts

/**
 * Turns a page of the site into the `screen_name` reported to GA4.
 *
 * The app is one WebView, so Firebase's automatic screen reporting would only
 * ever see "MainActivity" (it is switched off in the manifest). Instead every
 * committed page becomes a screen, named after its ROUTE, never its raw URL:
 *
 *  - query strings and fragments are never read — `/order-success?n=…&r=…`
 *    carries a signed receipt, `/payment/success?t=…` an access token;
 *  - dynamic segments are collapsed — `/checkout/pay/{token}` is
 *    "checkout_payment", every `/product/{id}` is "product";
 *  - only known routes are named; anything else is "other", so a path typed by
 *    hand can never smuggle text into the report;
 *  - the staff area, the bank's pages and anything off the allowlist return
 *    null and are not reported at all.
 */
object ScreenNames {

    private val LOCALES = setOf("bg", "en")

    /** First path segment → screen name, for routes without a dynamic part. */
    private val STATIC = mapOf(
        "menu" to "menu",
        "popular" to "popular",
        "gallery" to "gallery",
        "reviews" to "reviews",
        "contacts" to "contacts",
        "cart" to "cart",
        "checkout" to "checkout",
        "order-success" to "order_success",
        "profile" to "profile",
        "delivery" to "delivery",
        "payment-methods" to "payment_methods",
        "terms" to "terms",
        "privacy" to "privacy",
        "cookies" to "cookies",
        "refunds" to "refunds",
        "app-privacy" to "app_privacy",
        "account-deletion" to "account_deletion",
        "account-deleted" to "account_deleted",
        "unauthorized" to "unauthorized",
    )

    private val AUTH = mapOf(
        "login" to "login",
        "register" to "register",
        "check-email" to "check_email",
    )

    private val PAYMENT = setOf("success", "failed", "pending", "return")

    private val CATEGORY_SLUG = Regex("^[a-z0-9-]{1,40}$")

    data class Screen(
        /** Reported as `screen_name`. */
        val name: String,
        /**
         * Identifies the page for de-duplication only — never sent. Two
         * different products share a [name] but not a key.
         */
        val key: String,
    )

    fun forUrl(url: String?): Screen? {
        val parts = UrlParts.parse(url) ?: return null
        if (!AllowedOrigins.isAllowed(parts)) return null
        if (StaffRoutes.isStaffArea(url)) return null

        var segments = parts.segments
        if (segments.isNotEmpty() && segments[0].lowercase() in LOCALES) {
            segments = segments.drop(1)
        }
        val key = parts.host + "/" + segments.joinToString("/")
        val s = segments.map { it.lowercase() }

        val name = when {
            s.isEmpty() -> "home"
            s[0] == "menu" && s.size == 2 ->
                if (CATEGORY_SLUG.matches(s[1])) "menu/${s[1]}" else "menu_category"
            s[0] == "product" && s.size == 2 -> "product"
            s[0] == "checkout" && s.size >= 2 && s[1] == "pay" -> "checkout_payment"
            s[0] == "payment" && s.size == 2 && s[1] in PAYMENT -> "payment_${s[1]}"
            s[0] == "auth" && s.size == 2 && s[1] in AUTH -> AUTH.getValue(s[1])
            s[0] == "profile" -> if (s.size == 1) "profile" else "profile_orders"
            s[0] == "payment-simulator" -> "payment_simulator"
            s.size == 1 && s[0] in STATIC -> STATIC.getValue(s[0])
            else -> "other"
        }
        return Screen(name, key)
    }
}
