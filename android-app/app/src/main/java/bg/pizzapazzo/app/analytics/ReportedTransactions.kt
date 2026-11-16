package bg.pizzapazzo.app.analytics

/**
 * Remembers which orders were already reported as `purchase`, so one order is
 * one purchase in GA4 no matter how often its thank-you page is shown — a
 * reload, back-and-forward, the app restoring the page after it was killed.
 *
 * The site keeps a guard of its own in localStorage; this one is the
 * authoritative one, because it survives the site's storage being cleared
 * (the printer settings screen has a button for exactly that).
 *
 * Storage is injected as a plain string so the logic is testable on the JVM.
 */
class ReportedTransactions(
    private val load: () -> String?,
    private val save: (String) -> Unit,
    private val capacity: Int = 200,
) {

    /**
     * Records [transactionId] and returns true if it was not reported before;
     * returns false (and changes nothing) for a repeat.
     */
    @Synchronized
    fun recordIfNew(transactionId: String): Boolean {
        val ids = load().orEmpty().split(',').filter { it.isNotEmpty() }
        if (transactionId in ids) return false
        save((ids + transactionId).takeLast(capacity).joinToString(","))
        return true
    }
}
