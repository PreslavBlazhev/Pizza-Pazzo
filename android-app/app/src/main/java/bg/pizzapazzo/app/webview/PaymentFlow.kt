package bg.pizzapazzo.app.webview

/**
 * Online card payment inside the app's WebView — pure Kotlin, JVM-testable.
 *
 * The WebView is normally allowlist-only (see [AllowedOrigins]). A card
 * payment has to leave that list: the customer goes to the bank's hosted page,
 * and 3-D Secure may take them further, to their card issuer's own domain,
 * which nobody can know in advance. Blocking those pages, or throwing them
 * out to the browser, breaks the payment — the browser has neither the
 * customer's cart nor a way back into the app.
 *
 * So a payment is a short, explicit SESSION:
 *
 *   starts  when a Pizza Pazzo payment page (the review screen
 *           /checkout/pay/{token}, the "back to the bank" button on
 *           /payment/pending, or /api/payments/start itself) leads to a page
 *           outside the allowlist;
 *   allows  any HTTPS page in the WebView while it lasts (bank, 3-D Secure,
 *           issuer), `intent:` links handed to the bank's own app, nothing
 *           over plain HTTP;
 *   ends    when the WebView is back on a Pizza Pazzo page, or after
 *           [MAX_SESSION_MS].
 *
 * The printer bridge is unaffected: it re-checks the page's origin AND the
 * staff area on every call, so a bank page can never reach it.
 *
 * If Android kills the app while the customer is at the bank, the session is
 * persisted (see MainActivity) and the next launch opens the site's
 * "checking your payment" page for that order instead of the home page. The
 * server settles the payment from the bank's callback either way.
 */
object PaymentFlow {

    /** A bank session longer than this is abandoned; the allowance lapses. */
    const val MAX_SESSION_MS: Long = 60L * 60L * 1000L

    private val TOKEN = Regex("^[A-Za-z0-9_-]{16,64}$")

    /** What the app remembers about a payment in progress. */
    data class Session(
        /** The order's access token (the key to its payment pages). */
        val token: String,
        /** Scheme + host (+ port) of the Pizza Pazzo site it started from. */
        val origin: String,
        /** "en" or "" (Bulgarian is served without a prefix). */
        val localePrefix: String,
        val startedAtMs: Long,
    ) {
        fun isExpired(nowMs: Long): Boolean = nowMs - startedAtMs > MAX_SESSION_MS

        /** The site's "checking your payment" screen for this order. */
        fun resumeUrl(): String {
            val prefix = if (localePrefix.isEmpty()) "" else "/$localePrefix"
            return "$origin$prefix/payment/return?t=$token"
        }
    }

    /**
     * If [url] is one of our pages from which the customer is sent to the
     * payment provider, returns the session that navigation starts; else null.
     */
    fun sessionStartedFrom(url: String?, nowMs: Long): Session? {
        val parts = UrlParts.parse(url) ?: return null
        if (!AllowedOrigins.isAllowed(parts)) return null

        val segments = parts.segments
        val localePrefix = if (segments.firstOrNull() == "en") "en" else ""
        val rest = if (localePrefix.isEmpty()) segments else segments.drop(1)

        val token = when {
            // /checkout/pay/{token}
            rest.size == 3 && rest[0] == "checkout" && rest[1] == "pay" -> rest[2]
            // /payment/pending?t={token} — "back to the bank's page"
            rest.size == 2 && rest[0] == "payment" && rest[1] == "pending" -> queryParam(url, "t")
            else -> null
        } ?: return null

        if (!TOKEN.matches(token)) return null
        val origin = originOf(url) ?: return null
        return Session(token, origin, localePrefix, nowMs)
    }

    enum class Decision {
        /** Load it in the WebView (a Pizza Pazzo page, or the payment in progress). */
        ALLOW,
        /** Hand it to another app (a bank's app via intent:, the dialer, …). */
        HAND_OFF,
        /** Refuse it. */
        BLOCK,
    }

    /**
     * The navigation decision while a payment session is active. Only called
     * for URLs the ordinary allowlist has already refused.
     */
    fun decideDuringPayment(url: String?): Decision {
        val parts = UrlParts.parse(url) ?: return Decision.BLOCK
        return when (parts.scheme) {
            // The bank, 3-D Secure, the card issuer: whatever it takes, but
            // encrypted. A real bank page never needs plain HTTP.
            "https" -> if (parts.host.isNotEmpty()) Decision.ALLOW else Decision.BLOCK
            // Some banks confirm the payment in their own app ("open the
            // bank app to approve"). MainActivity opens these as BROWSABLE
            // intents with no explicit component, so they cannot be abused to
            // start an arbitrary activity.
            "intent" -> Decision.HAND_OFF
            else -> Decision.BLOCK
        }
    }

    /** The review form's target — the hop between our page and the bank. */
    fun isPaymentStartEndpoint(url: String?): Boolean {
        val parts = UrlParts.parse(url) ?: return false
        return AllowedOrigins.isAllowed(parts) && parts.path.trimEnd('/') == "/api/payments/start"
    }

    /** True once the WebView is back on the Pizza Pazzo site. */
    fun isBackOnSite(url: String?): Boolean = AllowedOrigins.isAllowedUrl(url)

    /** "https://host[:port]" of an absolute URL, without user info. */
    internal fun originOf(url: String?): String? {
        val raw = url?.trim().orEmpty()
        val schemeEnd = raw.indexOf("://")
        if (schemeEnd <= 0) return null
        val scheme = raw.substring(0, schemeEnd).lowercase()
        if (scheme != "https" && scheme != "http") return null
        val afterSlashes = raw.substring(schemeEnd + 3)
        val end = afterSlashes.indexOfFirst { it == '/' || it == '?' || it == '#' }
        val authority = (if (end < 0) afterSlashes else afterSlashes.substring(0, end))
            .substringAfterLast('@')
        if (authority.isEmpty() || authority.any { it.isWhitespace() }) return null
        return "$scheme://${authority.lowercase()}"
    }

    /** One query parameter, percent-decoding not needed for our token alphabet. */
    internal fun queryParam(url: String?, name: String): String? {
        val query = url?.substringAfter('?', "")?.substringBefore('#').orEmpty()
        if (query.isEmpty()) return null
        return query.split('&')
            .map { it.split('=', limit = 2) }
            .firstOrNull { it.size == 2 && it[0] == name }
            ?.get(1)
    }
}
