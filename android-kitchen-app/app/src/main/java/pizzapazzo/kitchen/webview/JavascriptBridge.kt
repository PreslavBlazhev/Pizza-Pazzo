package pizzapazzo.kitchen.webview

import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import pizzapazzo.kitchen.models.PrintableOrder
import pizzapazzo.kitchen.printer.EscPosPrinterService
import pizzapazzo.kitchen.printer.PrintResult
import pizzapazzo.kitchen.settings.PrinterPreferences

/**
 * The `window.AndroidPrinter` object injected into the kitchen page.
 *
 * SECURITY:
 *  - Navigation is already restricted to Pizza Pazzo origins (see
 *    [KitchenWebViewClient]), and every sensitive method here *re-checks* the
 *    currently committed URL against the same allowlist — defence in depth in
 *    case a rogue page ever ends up in the WebView (redirect chain, XSS on an
 *    allowed page loading a subframe, etc.).
 *  - @JavascriptInterface methods run on a dedicated JS-bridge thread, never
 *    the main thread; anything touching the WebView goes through [post].
 *  - Order JSON is size-capped and fully validated in [PrintableOrder].
 *  - Nothing sensitive is logged — order payloads contain personal data.
 */
class JavascriptBridge(
    private val webView: WebView,
    private val webViewClient: KitchenWebViewClient,
    private val printerService: EscPosPrinterService,
    private val preferences: PrinterPreferences,
    private val scope: CoroutineScope,
    private val openSettings: () -> Unit,
) {

    companion object {
        const val JS_NAME = "AndroidPrinter"
        const val PRINT_RESULT_EVENT = "pizza-pazzo-print-result"
    }

    private fun originAllowed(): Boolean =
        AllowedOrigins.isAllowedUrl(webViewClient.lastCommittedUrl)

    // ── Exposed to JavaScript ────────────────────────────────────────────────

    @JavascriptInterface
    fun isAvailable(): Boolean = originAllowed()

    /** JSON: { state, printerName, hasPrinter, lastError } */
    @JavascriptInterface
    fun getPrinterStatus(): String {
        if (!originAllowed()) return """{"state":"UNAVAILABLE"}"""
        return JSONObject()
            .put("state", printerService.state.name)
            .put("printerName", preferences.printerName ?: JSONObject.NULL)
            .put("hasPrinter", !preferences.printerMac.isNullOrBlank())
            .put("lastError", printerService.lastError ?: JSONObject.NULL)
            .toString()
    }

    @JavascriptInterface
    fun openPrinterSettings() {
        if (!originAllowed()) return
        post { openSettings() }
    }

    /**
     * Prints one order. Asynchronous: returns immediately, the outcome comes
     * back as a `pizza-pazzo-print-result` CustomEvent on `window`.
     */
    @JavascriptInterface
    fun printOrder(orderJson: String?) {
        if (!originAllowed()) return
        // orderId is extracted defensively before full validation so even an
        // "invalid JSON" result can be routed to the right button in the UI.
        val orderId = try {
            JSONObject(orderJson ?: "").optString("orderId", "")
        } catch (_: Exception) {
            ""
        }
        scope.launch {
            val result = printerService.printOrder(orderJson ?: "")
            rememberError(result)
            dispatchPrintResult(orderId, result)
        }
    }

    @JavascriptInterface
    fun printTestPage() {
        if (!originAllowed()) return
        scope.launch {
            val result = printerService.printTestPage()
            rememberError(result)
            dispatchPrintResult("test-page", result)
        }
    }

    @JavascriptInterface
    fun disconnectPrinter() {
        if (!originAllowed()) return
        scope.launch { printerService.disconnect() }
    }

    // ── Android → JavaScript ─────────────────────────────────────────────────

    private fun rememberError(result: PrintResult) {
        if (result is PrintResult.Failure) preferences.lastPrintError = result.message
    }

    private fun dispatchPrintResult(orderId: String, result: PrintResult) {
        val detail = JSONObject()
            .put("orderId", orderId)
            .put("success", result.isSuccess)
            .put(
                "message",
                when (result) {
                    is PrintResult.Success -> result.message
                    is PrintResult.Failure -> result.message
                },
            )
            .put("reason", (result as? PrintResult.Failure)?.reason?.name ?: JSONObject.NULL)
        // JSONObject.toString() escapes quotes/backslashes, so embedding it as
        // an argument of JSON-parse-free object literal is injection-safe.
        val js = "window.dispatchEvent(new CustomEvent('$PRINT_RESULT_EVENT',{detail:$detail}));"
        post {
            if (originAllowed()) webView.evaluateJavascript(js, null)
        }
    }

    private fun post(block: () -> Unit) {
        webView.post { block() }
    }
}
