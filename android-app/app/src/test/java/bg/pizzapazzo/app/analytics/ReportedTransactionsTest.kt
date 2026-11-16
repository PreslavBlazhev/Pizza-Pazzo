package bg.pizzapazzo.app.analytics

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** One order is one purchase in GA4, however often its page is shown. */
class ReportedTransactionsTest {

    private var stored: String? = null
    private fun ledger(capacity: Int = 200) =
        ReportedTransactions(load = { stored }, save = { stored = it }, capacity = capacity)

    @Test
    fun `first report passes, repeats do not`() {
        val l = ledger()
        assertTrue(l.recordIfNew("1042"))
        assertFalse(l.recordIfNew("1042"))
        assertTrue(l.recordIfNew("1043"))
    }

    @Test
    fun `survives a restart through storage`() {
        ledger().recordIfNew("1042")
        assertFalse(ledger().recordIfNew("1042"))
    }

    @Test
    fun `ids are matched exactly, not as substrings`() {
        val l = ledger()
        l.recordIfNew("10421")
        assertTrue(l.recordIfNew("1042"))
    }

    @Test
    fun `only the most recent ids are kept`() {
        val l = ledger(capacity = 3)
        listOf("1", "2", "3", "4").forEach { l.recordIfNew(it) }
        assertTrue(l.recordIfNew("1")) // fell out of the window
        assertFalse(l.recordIfNew("4"))
    }
}
