import Foundation

/// The three pieces of a URL the app makes security decisions from: scheme,
/// host and path.
///
/// A port of `android-app/.../webview/UrlParts.kt`, kept deliberately the same
/// so both apps read a URL the same way. Written by hand rather than through
/// `URLComponents` because a parser that throws or returns nil on a Cyrillic
/// query string would turn a legitimate page into a blocked navigation. This one
/// never traps: it returns nil for anything it cannot make sense of, and every
/// caller treats nil as "not allowed".
///
/// Deliberately narrow: no query, no fragment, no port.
struct UrlParts: Equatable {
    /// Lowercased, without the colon.
    let scheme: String
    /// Lowercased, without userinfo or port. Empty for schemes like `tel:`.
    let host: String
    /// Starts with `/` for hierarchical URLs; the raw rest for `tel:` and co.
    let path: String

    /// Path segments with empty ones dropped: `/en/admin/` → ["en", "admin"].
    var segments: [String] {
        path.split(separator: "/").map(String.init)
    }

    /// Parses `url`, or returns nil if it cannot be understood.
    static func parse(_ url: String?) -> UrlParts? {
        guard let raw = url?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        guard let colon = raw.firstIndex(of: ":"), colon > raw.startIndex else { return nil }

        let scheme = raw[..<colon].lowercased()
        guard let first = scheme.first, first.isASCII, first.isLetter else { return nil }
        let schemeIsValid = scheme.allSatisfy { char in
            (char.isASCII && (char.isLetter || char.isNumber)) || char == "+" || char == "-" || char == "."
        }
        guard schemeIsValid else { return nil }

        let rest = String(raw[raw.index(after: colon)...])

        // Schemes without an authority — tel:, mailto:, sms: — have no host to
        // check; callers decide about them by scheme alone.
        guard rest.hasPrefix("//") else {
            return UrlParts(scheme: scheme, host: "", path: rest)
        }

        let afterSlashes = rest.dropFirst(2)
        let authorityEnd = afterSlashes.firstIndex { $0 == "/" || $0 == "?" || $0 == "#" }
        let authority = authorityEnd.map { String(afterSlashes[..<$0]) } ?? String(afterSlashes)
        let tail = authorityEnd.map { String(afterSlashes[$0...]) } ?? ""

        guard let host = hostOf(authority) else { return nil }

        var path = tail
        if let query = path.firstIndex(of: "?") { path = String(path[..<query]) }
        if let fragment = path.firstIndex(of: "#") { path = String(path[..<fragment]) }
        if path.isEmpty { path = "/" }

        return UrlParts(scheme: scheme, host: host, path: path)
    }

    /// Strips userinfo and port off an authority.
    ///
    /// The userinfo part is the one that matters:
    /// `https://pizzapazzo.bg@evil.example.com/` reads as our domain to a human
    /// and resolves to the attacker's. Everything before the LAST `@` is dropped.
    private static func hostOf(_ authority: String) -> String? {
        guard !authority.isEmpty else { return nil }

        let afterUserInfo: Substring
        if let at = authority.lastIndex(of: "@") {
            afterUserInfo = authority[authority.index(after: at)...]
        } else {
            afterUserInfo = Substring(authority)
        }
        guard !afterUserInfo.isEmpty else { return nil }

        let host: Substring
        if afterUserInfo.hasPrefix("[") {
            // IPv6 literals are bracketed and may contain colons of their own.
            guard let close = afterUserInfo.firstIndex(of: "]") else { return nil }
            host = afterUserInfo[...close]
        } else if let colon = afterUserInfo.firstIndex(of: ":") {
            host = afterUserInfo[..<colon]
        } else {
            host = afterUserInfo
        }

        guard !host.isEmpty else { return nil }
        // A host with a slash or whitespace in it is not a host.
        if host.contains(where: { $0.isWhitespace || $0 == "/" || $0 == "\\" }) { return nil }

        return host.lowercased()
    }
}
