package pizzapazzo.kitchen.webview

import android.graphics.Bitmap
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Navigation policy + load/error callbacks for the kitchen WebView.
 *
 * Navigation is allowlist-only: the kitchen tablet must never wander off to an
 * arbitrary site (also protects the JS bridge — see [JavascriptBridge], which
 * re-checks the current origin on every call via [lastCommittedUrl]).
 */
class KitchenWebViewClient(
    private val onBlockedNavigation: (String) -> Unit,
    private val onPageStarted: () -> Unit,
    private val onPageFinished: (url: String?) -> Unit,
    private val onLoadError: (description: String) -> Unit,
) : WebViewClient() {

    /**
     * The last URL the WebView actually committed to. @Volatile because the
     * JS bridge reads it from the WebView's JS-bridge thread while it is
     * written from the main thread.
     */
    @Volatile
    var lastCommittedUrl: String? = null
        private set

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()
        if (AllowedOrigins.isAllowedUrl(url)) return false // let the WebView load it
        onBlockedNavigation(url)
        return true // swallow anything outside the allowlist
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        lastCommittedUrl = url
        onPageStarted()
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
        lastCommittedUrl = url
    }

    override fun onPageFinished(view: WebView, url: String?) {
        lastCommittedUrl = url
        onPageFinished(url)
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
    ) {
        // Only a failed main-frame load should flip to the error screen —
        // a broken image or a failed poll request should not.
        if (request.isForMainFrame) {
            onLoadError(error.description?.toString() ?: "load error")
        }
    }
}
