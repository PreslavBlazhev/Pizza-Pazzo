package bg.pizzapazzo.app.webview

/**
 * The three pieces of a URL the app makes security decisions from: scheme, host
 * and path.
 *
 * Written by hand rather than delegating to `android.net.Uri` or `java.net.URI`,
 * for two reasons.
 *
 * The first is that these decisions have to be testable. `android.net.Uri` is a
 * stub on the JVM, so anything that used it could only be checked on a device —
 * which is to say, never. The allowlist that decides where the WebView may go
 * is not something to leave unverified.
 *
 * The second is leniency. `java.net.URI` throws on input Android accepts
 * happily — a Cyrillic query string, an unescaped brace — and a parser that
 * throws turns a legitimate page into a blocked navigation. This one never
 * throws: it returns null for anything it cannot make sense of, and every
 * caller treats null as "not allowed".
 *
 * Deliberately narrow: no query, no fragment, no port. Nothing above needs them,
 * and the parts a decision does not use are parts that cannot mislead it.
 */
internal data class UrlParts(
    /** Lowercased, without the colon. Null when the URL had no scheme. */
    val scheme: String,
    /** Lowercased, without userinfo or port. Empty for schemes like `tel:`. */
    val host: String,
    /** Always starts with `/`. Empty when the URL had no path. */
    val path: String,
) {

    companion object {

        /** Parses [url], or returns null if it cannot be understood. */
        fun parse(url: String?): UrlParts? {
            val raw = url?.trim().orEmpty()
            if (raw.isEmpty()) return null

            val schemeEnd = raw.indexOf(':')
            if (schemeEnd <= 0) return null
            val scheme = raw.substring(0, schemeEnd).lowercase()
            if (!scheme.all { it.isLetterOrDigit() || it == '+' || it == '-' || it == '.' }) {
                return null
            }
            if (!scheme[0].isLetter()) return null

            val rest = raw.substring(schemeEnd + 1)

            // Schemes without an authority — tel:, mailto:, geo: — have no host
            // to check, and callers decide about them by scheme alone.
            if (!rest.startsWith("//")) {
                return UrlParts(scheme = scheme, host = "", path = rest)
            }

            val afterSlashes = rest.substring(2)
            val authorityEnd = afterSlashes.indexOfFirst { it == '/' || it == '?' || it == '#' }
            val authority =
                if (authorityEnd < 0) afterSlashes else afterSlashes.substring(0, authorityEnd)
            val tail = if (authorityEnd < 0) "" else afterSlashes.substring(authorityEnd)

            val host = hostOf(authority) ?: return null

            val path = tail
                .substringBefore('?')
                .substringBefore('#')
                .ifEmpty { "/" }

            return UrlParts(scheme = scheme, host = host, path = path)
        }

        /**
         * Strips userinfo and port off an authority.
         *
         * The userinfo part is the one that matters: `https://pizzapazzo.bg@evil.example.com/`
         * reads as our domain to a human and resolves to the attacker's to a
         * browser. Everything before the LAST `@` is userinfo and is discarded.
         */
        private fun hostOf(authority: String): String? {
            if (authority.isEmpty()) return null

            val afterUserInfo = authority.substringAfterLast('@')
            if (afterUserInfo.isEmpty()) return null

            // IPv6 literals are bracketed and may contain colons of their own.
            val host = if (afterUserInfo.startsWith("[")) {
                val close = afterUserInfo.indexOf(']')
                if (close < 0) return null
                afterUserInfo.substring(0, close + 1)
            } else {
                afterUserInfo.substringBefore(':')
            }

            if (host.isEmpty()) return null
            // A host with a slash or whitespace in it is not a host.
            if (host.any { it.isWhitespace() || it == '/' || it == '\\' }) return null

            return host.lowercase()
        }
    }

    /** Path segments with empty ones dropped: `/en/admin/` → ["en", "admin"]. */
    val segments: List<String>
        get() = path.split('/').filter { it.isNotEmpty() }
}
