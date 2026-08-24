package bg.pizzapazzo.app.webview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * [UrlParts] is what the navigation allowlist and the printer bridge both
 * decide from, so its failure mode has to be "refuse", never "throw" and never
 * "guess generously".
 */
class UrlPartsTest {

    @Test
    fun `an ordinary https url splits into scheme host and path`() {
        val parts = UrlParts.parse("https://pizza-pazzo.onrender.com/menu/pizzi")!!
        assertEquals("https", parts.scheme)
        assertEquals("pizza-pazzo.onrender.com", parts.host)
        assertEquals("/menu/pizzi", parts.path)
        assertEquals(listOf("menu", "pizzi"), parts.segments)
    }

    @Test
    fun `scheme and host are lowercased`() {
        val parts = UrlParts.parse("HTTPS://PizzaPazzo.BG/Menu")!!
        assertEquals("https", parts.scheme)
        assertEquals("pizzapazzo.bg", parts.host)
        // The path keeps its case — the site's routes are case-sensitive.
        assertEquals("/Menu", parts.path)
    }

    @Test
    fun `a url with no path reports the root`() {
        assertEquals("/", UrlParts.parse("https://pizzapazzo.bg")!!.path)
        assertEquals("/", UrlParts.parse("https://pizzapazzo.bg/")!!.path)
    }

    @Test
    fun `query and fragment are cut off the path`() {
        assertEquals("/admin/orders", UrlParts.parse("https://pizzapazzo.bg/admin/orders?a=1")!!.path)
        assertEquals("/admin/orders", UrlParts.parse("https://pizzapazzo.bg/admin/orders#top")!!.path)
    }

    @Test
    fun `a port is not part of the host`() {
        assertEquals("localhost", UrlParts.parse("http://localhost:3000/menu")!!.host)
    }

    @Test
    fun `userinfo is stripped so it cannot impersonate a host`() {
        // The classic one: reads as our domain, resolves to the attacker's.
        assertEquals("evil.example.com", UrlParts.parse("https://pizzapazzo.bg@evil.example.com/")!!.host)
        assertEquals("evil.example.com", UrlParts.parse("https://user:pass@evil.example.com/")!!.host)
        // Two @ signs: everything before the LAST one is userinfo.
        assertEquals("evil.example.com", UrlParts.parse("https://a@b@evil.example.com/")!!.host)
    }

    @Test
    fun `schemes without an authority keep an empty host`() {
        val tel = UrlParts.parse("tel:+35988248477")!!
        assertEquals("tel", tel.scheme)
        assertEquals("", tel.host)

        val mail = UrlParts.parse("mailto:orderspp@gmail.com")!!
        assertEquals("mailto", mail.scheme)
        assertEquals("", mail.host)
    }

    @Test
    fun `an ipv6 literal survives intact`() {
        assertEquals("[::1]", UrlParts.parse("http://[::1]:8080/menu")!!.host)
    }

    @Test
    fun `nonsense returns null instead of throwing`() {
        assertNull(UrlParts.parse(null))
        assertNull(UrlParts.parse(""))
        assertNull(UrlParts.parse("   "))
        assertNull(UrlParts.parse("no-scheme-here"))
        assertNull(UrlParts.parse("://missing-scheme"))
        assertNull(UrlParts.parse("1http://starts-with-a-digit"))
        assertNull(UrlParts.parse("https://"))
    }

    @Test
    fun `a cyrillic query string does not break parsing`() {
        // java.net.URI throws on this; the WebView does not, so neither do we.
        val parts = UrlParts.parse("https://pizzapazzo.bg/menu?q=пица")!!
        assertEquals("pizzapazzo.bg", parts.host)
        assertEquals("/menu", parts.path)
    }
}
