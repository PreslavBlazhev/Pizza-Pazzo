package bg.pizzapazzo.app.webview

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import bg.pizzapazzo.app.analytics.AppAnalytics

/**
 * The `window.AndroidAnalytics` object injected into the site's pages — how
 * the site's shop events (product viewed, added to the basket, checkout,
 * purchase, login, sign-up) reach Google Analytics when it runs inside the app.
 *
 * WHY THE SITE REPORTS AND THE APP ONLY FORWARDS: the app is a WebView, so it
 * never sees a basket or an order — only URLs. The site knows the product, the
 * price and whether the server really accepted the order, and it calls
 * [logEvent]. In an ordinary browser this object does not exist and the site
 * reports nothing (it has no web analytics of its own), so one action can
 * never be counted twice — see lib/app-analytics.ts on the site.
 *
 * Page views are NOT taken from here: the app derives them from navigation
 * itself (see [bg.pizzapazzo.app.analytics.ScreenNames]).
 *
 * SECURITY: answers only on a customer page of an allowlisted origin (the
 * staff area is never reported), and every event is rebuilt from an allowlist
 * in [bg.pizzapazzo.app.analytics.AnalyticsEventSanitizer]. Runs on the
 * WebView's JS-bridge thread.
 */
class AnalyticsBridge(
    private val webView: WebView,
    private val webViewClient: SiteWebViewClient,
    private val analytics: AppAnalytics,
    private val openConsentDialog: () -> Unit,
) {

    companion object {
        const val JS_NAME = "AndroidAnalytics"
        const val CONSENT_EVENT = "pizza-pazzo-analytics-consent"

        /** Far above any real basket; a cap so a runaway page cannot flood us. */
        private const val MAX_JSON_CHARS = 20_000
    }

    private fun customerPage(): Boolean {
        val url = webViewClient.lastCommittedUrl
        return AllowedOrigins.isAllowedUrl(url) && !StaffRoutes.isStaffArea(url)
    }

    /** True only when an event sent now would actually be reported. */
    @JavascriptInterface
    fun isEnabled(): Boolean = customerPage() && analytics.isCollecting

    /** "granted" | "denied" | "unknown" | "unavailable". */
    @JavascriptInterface
    fun getConsentState(): String {
        if (!AllowedOrigins.isAllowedUrl(webViewClient.lastCommittedUrl)) return "unavailable"
        if (!analytics.isSupported) return "unavailable"
        return analytics.consent.name.lowercase()
    }

    /**
     * Reports one GA4 event. [paramsJson] is the GA4 parameter object, e.g.
     * `{"currency":"EUR","value":12.5,"items":[…]}`. Returns true if it was
     * logged.
     */
    @JavascriptInterface
    fun logEvent(name: String?, paramsJson: String?): Boolean {
        if (!customerPage()) return false
        if ((paramsJson?.length ?: 0) > MAX_JSON_CHARS) return false
        return analytics.logWebEvent(name, paramsJson)
    }

    /** Opens the native "usage statistics" dialog, where consent is changed. */
    @JavascriptInterface
    fun openConsentSettings() {
        if (!AllowedOrigins.isAllowedUrl(webViewClient.lastCommittedUrl)) return
        if (!analytics.isSupported) return
        webView.post { openConsentDialog() }
    }

    /** Tells the open page the decision changed, so its button can update. */
    fun dispatchConsentChanged() {
        val detail = JSONObject().put("state", analytics.consent.name.lowercase())
        val js = "window.dispatchEvent(new CustomEvent('$CONSENT_EVENT',{detail:$detail}));"
        webView.post {
            if (AllowedOrigins.isAllowedUrl(webViewClient.lastCommittedUrl)) {
                webView.evaluateJavascript(js, null)
            }
        }
    }
}
