package bg.pizzapazzo.app.webview

import bg.pizzapazzo.app.BuildConfig

/**
 * Single source of truth for which origins the app's WebView may navigate to
 * and — more importantly — which pages are allowed to call the AndroidPrinter
 * bridge. Everything else opens nowhere: external links are blocked, and
 * bridge calls from an unexpected origin are rejected.
 */
object AllowedOrigins {

    /** Production hosts of the Pizza Pazzo site. */
    private val PRODUCTION_HOSTS = setOf(
        "pizza-pazzo.onrender.com",
        "pizzapazzo.bg",
        "www.pizzapazzo.bg",
    )

    /** Development-only hosts (next dev on the same LAN / emulator loopback). */
    private val DEV_HOSTS = setOf(
        "localhost",
        "10.0.2.2",
        "192.168.68.129",
    )

    /**
     * Schemes that may be handed to another app when the WebView itself is not
     * allowed to load them.
     *
     * `http`/`https` are here so an off-site link (the Google Maps link on the
     * contacts page) opens the browser instead of dying in a toast. `intent:`,
     * `javascript:`, `data:`, `file:` and `content:` are deliberately absent:
     * they are the schemes used to talk an embedded WebView into launching
     * something it was never meant to launch, or into reading local files.
     */
    private val HAND_OFF_SCHEMES = setOf(
        "tel", "mailto", "sms", "smsto", "geo", "http", "https",
    )

    fun isHandOffScheme(scheme: String?): Boolean =
        scheme?.lowercase() in HAND_OFF_SCHEMES

    fun isAllowedUrl(url: String?): Boolean = isAllowed(UrlParts.parse(url))

    /**
     * The decision itself, taken on already-parsed parts so that callers which
     * need the path too — [StaffRoutes] — do not parse the same URL twice and
     * cannot end up deciding from a different reading of it.
     */
    internal fun isAllowed(parts: UrlParts?): Boolean {
        if (parts == null || parts.host.isEmpty()) return false
        return when (parts.scheme) {
            "https" ->
                parts.host in PRODUCTION_HOSTS ||
                    (BuildConfig.ALLOW_DEV_ORIGINS && parts.host in DEV_HOSTS)
            // Plain HTTP only ever for the dev server, and only in debug builds.
            "http" -> BuildConfig.ALLOW_DEV_ORIGINS && parts.host in DEV_HOSTS
            else -> false
        }
    }
}
