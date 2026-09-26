package bg.pizzapazzo.app.webview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PaymentFlowTest {

    private val token = "AbCdEfGhIjKlMnOpQrStUvWx0123456789_-ab"
    private val now = 1_000_000_000L

    @Test
    fun `the review screen starts a payment session for its order`() {
        val s = PaymentFlow.sessionStartedFrom("https://pizza-pazzo.onrender.com/checkout/pay/$token", now)
        assertNotNull(s)
        assertEquals(token, s!!.token)
        assertEquals("https://pizza-pazzo.onrender.com", s.origin)
        assertEquals("", s.localePrefix)
        assertEquals("https://pizza-pazzo.onrender.com/payment/return?t=$token", s.resumeUrl())
    }

    @Test
    fun `the English review screen resumes in English`() {
        val s = PaymentFlow.sessionStartedFrom("https://www.pizzapazzo.bg/en/checkout/pay/$token?error=BUSY", now)
        assertEquals("https://www.pizzapazzo.bg/en/payment/return?t=$token", s!!.resumeUrl())
    }

    @Test
    fun `back to the bank from the pending screen also starts a session`() {
        val s = PaymentFlow.sessionStartedFrom("https://pizza-pazzo.onrender.com/payment/pending?t=$token", now)
        assertEquals(token, s!!.token)
    }

    @Test
    fun `ordinary pages, foreign hosts and bad tokens start nothing`() {
        assertNull(PaymentFlow.sessionStartedFrom("https://pizza-pazzo.onrender.com/menu", now))
        assertNull(PaymentFlow.sessionStartedFrom("https://pizza-pazzo.onrender.com/checkout", now))
        assertNull(PaymentFlow.sessionStartedFrom("https://evil.example.com/checkout/pay/$token", now))
        assertNull(PaymentFlow.sessionStartedFrom("https://pizzapazzo.bg@evil.example.com/checkout/pay/$token", now))
        assertNull(PaymentFlow.sessionStartedFrom("http://pizza-pazzo.onrender.com/checkout/pay/$token", now))
        assertNull(PaymentFlow.sessionStartedFrom("https://pizza-pazzo.onrender.com/checkout/pay/short", now))
        assertNull(PaymentFlow.sessionStartedFrom("https://pizza-pazzo.onrender.com/checkout/pay/bad%20token%20with%20spaces", now))
        assertNull(PaymentFlow.sessionStartedFrom(null, now))
    }

    @Test
    fun `during a payment the bank and 3-D Secure load in the app, plain http never`() {
        assertEquals(PaymentFlow.Decision.ALLOW, PaymentFlow.decideDuringPayment("https://gateway.bank.example/pay?id=1"))
        assertEquals(PaymentFlow.Decision.ALLOW, PaymentFlow.decideDuringPayment("https://acs.issuer.example/3ds/challenge"))
        assertEquals(PaymentFlow.Decision.BLOCK, PaymentFlow.decideDuringPayment("http://gateway.bank.example/pay"))
        assertEquals(PaymentFlow.Decision.BLOCK, PaymentFlow.decideDuringPayment("javascript:alert(1)"))
        assertEquals(PaymentFlow.Decision.BLOCK, PaymentFlow.decideDuringPayment("file:///sdcard/x"))
        assertEquals(
            PaymentFlow.Decision.HAND_OFF,
            PaymentFlow.decideDuringPayment("intent://approve#Intent;scheme=bankapp;package=bg.bank.app;end")
        )
    }

    @Test
    fun `the session ends back on the site and lapses after an hour`() {
        assertTrue(PaymentFlow.isBackOnSite("https://pizza-pazzo.onrender.com/api/payments/return?t=$token"))
        assertFalse(PaymentFlow.isBackOnSite("https://gateway.bank.example/done"))
        val s = PaymentFlow.sessionStartedFrom("https://pizza-pazzo.onrender.com/checkout/pay/$token", now)!!
        assertFalse(s.isExpired(now + 59 * 60 * 1000))
        assertTrue(s.isExpired(now + PaymentFlow.MAX_SESSION_MS + 1))
    }

    @Test
    fun `the start endpoint is recognised as the hop to the bank`() {
        assertTrue(PaymentFlow.isPaymentStartEndpoint("https://pizza-pazzo.onrender.com/api/payments/start"))
        assertFalse(PaymentFlow.isPaymentStartEndpoint("https://evil.example.com/api/payments/start"))
        assertFalse(PaymentFlow.isPaymentStartEndpoint("https://pizza-pazzo.onrender.com/api/payments/status"))
    }

    @Test
    fun `origin keeps the port and drops user info`() {
        assertEquals("http://10.0.2.2:3000", PaymentFlow.originOf("http://10.0.2.2:3000/checkout/pay/x"))
        assertEquals("https://pizzapazzo.bg", PaymentFlow.originOf("https://user@PizzaPazzo.bg/x"))
        assertNull(PaymentFlow.originOf("mailto:x@y.z"))
    }

    @Test
    fun `query parameters are read exactly`() {
        assertEquals("abc", PaymentFlow.queryParam("https://h/p?x=1&t=abc#frag", "t"))
        assertNull(PaymentFlow.queryParam("https://h/p?tt=abc", "t"))
        assertNull(PaymentFlow.queryParam("https://h/p", "t"))
    }
}
