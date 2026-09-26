package bg.pizzapazzo.app.webview

/**
 * What [SiteWebViewClient] needs from the activity to run a card payment:
 * the current session, and the few things only an Activity can do (persist
 * it, change cookie policy, start another app). See [PaymentFlow].
 */
interface PaymentSessionHost {
    val activePayment: PaymentFlow.Session?
    fun startPayment(session: PaymentFlow.Session)
    fun endPayment()
    /** Opens a bank-app `intent:` link safely. False if nothing could open it. */
    fun openPaymentIntent(url: String): Boolean
}
