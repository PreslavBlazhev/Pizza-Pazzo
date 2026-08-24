package bg.pizzapazzo.app.webview

import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Navigation policy + load/error callbacks for the kitchen WebView.
 *
 * Navigation inside the WebView is allowlist-only: the tablet must never wander
 * off to an arbitrary site (this is also what protects the JS bridge — see
 * [JavascriptBridge], which re-checks the current origin on every call via
 * [lastCommittedUrl]).
 *
 * "Not allowed in the WebView" is not the same as "must do nothing", though.
 * The site is full of `tel:` links (the live board shows the customer's phone
 * number for exactly this reason), `mailto:` links in the footer, and a Google
 * Maps link on the contacts page. Those are handed to the system through
 * [onExternalUri] so the dialer, the mail app or the browser opens — leaving
 * the kitchen app untouched behind them. Everything else is still swallowed.
 */
class SiteWebViewClient(
    private val onBlockedNavigation: (String) -> Unit,
    /** Hand a URL to another app. Returns false if nothing could open it. */
    private val onExternalUri: (Uri) -> Boolean,
    private val onPageStarted: () -> Unit,
    private val onPageFinished: (url: String?) -> Unit,
    private val onLoadError: (description: String) -> Unit,
    /** The WebView's renderer died. Return true once it has been dealt with. */
    private val onRendererGone: () -> Boolean,
    /**
     * Fired whenever the committed URL changes — including the pushState
     * navigations a Next.js app does without a page load. The shell uses it to
     * decide whether this is a customer page or the staff terminal, and whether
     * back should still be handled here.
     */
    private val onNavigated: (url: String?) -> Unit,
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
        val uri = request.url
        val url = uri.toString()

        if (AllowedOrigins.isAllowedUrl(url)) return false // let the WebView load it

        // Only a real navigation may leave the app. A background subframe that
        // was never touched by anyone does not get to launch the browser.
        val mayLeaveTheApp = request.isForMainFrame || request.hasGesture()
        if (mayLeaveTheApp && AllowedOrigins.isHandOffScheme(uri.scheme)) {
            if (onExternalUri(uri)) return true
        }

        onBlockedNavigation(url)
        return true // swallow anything else
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        lastCommittedUrl = url
        onNavigated(url)
        onPageStarted()
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
        lastCommittedUrl = url
        // The only hook that fires for a client-side route change, which is how
        // the site moves between /menu and /admin most of the time.
        onNavigated(url)
    }

    override fun onPageFinished(view: WebView, url: String?) {
        lastCommittedUrl = url
        onNavigated(url)
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

    /**
     * A bad certificate is always fatal. This override exists so that the
     * refusal is explicit and reviewable: `handler.proceed()` on a kitchen
     * terminal that carries a live admin session would hand that session to
     * whoever is running the man-in-the-middle.
     */
    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        onLoadError("SSL: ${error.primaryError}")
    }

    /**
     * The WebView renders in its own process, and that process can be killed —
     * out of memory, or a genuine renderer crash. Returning false here means
     * "I did not handle it", and the system kills the whole app: on a kitchen
     * tablet that is the board disappearing mid-service. So we always claim it
     * and let the activity rebuild the WebView instead.
     */
    override fun onRenderProcessGone(
        view: WebView,
        detail: android.webkit.RenderProcessGoneDetail,
    ): Boolean = onRendererGone()
}
