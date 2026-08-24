package bg.pizzapazzo.app.webview

/**
 * Tells the staff area of the site apart from the customer area, by URL.
 *
 * One app serves two very different people. A customer browsing the menu on
 * their phone wants an ordinary Android app: status bar visible, screen free to
 * time out, back button that eventually leaves. A cook watching the live orders
 * board on the counter tablet wants the opposite: full screen, screen awake,
 * nothing in the way.
 *
 * The site already knows which of the two is looking — it is the difference
 * between `/menu` and `/admin`. So the shell reads it off the URL instead of
 * inventing a mode switch of its own.
 *
 * **This is not a security boundary.** It decides whether to dim the screen, and
 * nothing else. Who may actually see the orders board is decided by the server,
 * from the session cookie — see [AllowedOrigins] and the site's middleware. A
 * customer who types `/admin` into the address bar gets a redirect to the login
 * page from the server; all this class would have done meanwhile is keep their
 * screen on for a second.
 */
object StaffRoutes {

    /** Locale prefixes the site puts in front of a path (`/en/admin`). */
    private val LOCALE_PREFIXES = setOf("en", "bg")

    /** The first path segment that marks the staff area. */
    private const val STAFF_SEGMENT = "admin"

    /**
     * True when [url] points at the site's staff area — the pages that turn the
     * device into a kitchen terminal.
     */
    fun isStaffArea(url: String?): Boolean {
        val parts = UrlParts.parse(url) ?: return false
        if (!AllowedOrigins.isAllowed(parts)) return false

        val segments = parts.segments
        if (segments.isEmpty()) return false

        // "/admin/..." or "/en/admin/..." — the locale prefix is optional
        // because Bulgarian is served on the bare paths.
        val first = segments[0].lowercase()
        if (first == STAFF_SEGMENT) return true
        return first in LOCALE_PREFIXES &&
            segments.size > 1 &&
            segments[1].lowercase() == STAFF_SEGMENT
    }
}
