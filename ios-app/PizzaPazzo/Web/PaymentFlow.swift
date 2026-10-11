import Foundation

/// Online card payment inside the app's web view — pure logic, unit-tested.
///
/// Port of `android-app/.../webview/PaymentFlow.kt`. The web view is normally
/// allowlist-only. A card payment has to leave that list: the customer goes to
/// the bank's hosted page, and 3-D Secure may take them on to the card
/// issuer's own domain, which nobody can know in advance. So a payment is a
/// short, explicit SESSION:
///
///   starts  when a Pizza Pazzo payment page (the review screen
///           `/checkout/pay/{token}`, or "back to the bank" on
///           `/payment/pending?t=…`) leads to a page outside the allowlist;
///   allows  any HTTPS page in the web view while it lasts (bank, 3-D Secure,
///           issuer); a bank's own app scheme is handed to iOS; never HTTP;
///   ends    when the web view is back on a Pizza Pazzo page, or after
///           `maxSessionDuration`.
///
/// Card payments are switched off on the live site (`CARD_PAYMENTS_ENABLED`),
/// so in practice no session ever starts today. The logic is here so that the
/// day they are switched on the app does not throw the customer out to Safari
/// in the middle of 3-D Secure.
enum PaymentFlow {

    /// A bank session longer than this is abandoned; the allowance lapses.
    static let maxSessionDuration: TimeInterval = 60 * 60

    struct Session: Codable, Equatable {
        /// The order's access token (the key to its payment pages).
        let token: String
        /// Scheme + host (+ port) of the Pizza Pazzo site it started from.
        let origin: String
        /// "en" or "" (Bulgarian is served without a prefix).
        let localePrefix: String
        var startedAt: Date

        func isExpired(now: Date) -> Bool {
            now.timeIntervalSince(startedAt) > PaymentFlow.maxSessionDuration
        }

        /// The site's "checking your payment" screen for this order.
        var resumeURL: String {
            let prefix = localePrefix.isEmpty ? "" : "/\(localePrefix)"
            return "\(origin)\(prefix)/payment/return?t=\(token)"
        }
    }

    enum Decision: Equatable {
        /// Load it in the web view (the payment in progress).
        case allow
        /// Hand it to iOS (a bank's app via its own URL scheme).
        case handOff
        /// Refuse it.
        case block
    }

    /// If `url` is one of our pages from which the customer is sent to the
    /// payment provider, the session that navigation would start; else nil.
    static func sessionStartedFrom(_ url: String?, now: Date, origins: AllowedOrigins) -> Session? {
        guard let parts = UrlParts.parse(url), origins.isAllowed(parts) else { return nil }

        let segments = parts.segments
        let localePrefix = segments.first == "en" ? "en" : ""
        let rest = localePrefix.isEmpty ? segments : Array(segments.dropFirst())

        let token: String?
        if rest.count == 3, rest[0] == "checkout", rest[1] == "pay" {
            token = rest[2]
        } else if rest.count == 2, rest[0] == "payment", rest[1] == "pending" {
            token = queryParam(url, name: "t")
        } else {
            token = nil
        }

        guard let token, isValidToken(token), let origin = originOf(url) else { return nil }
        return Session(token: token, origin: origin, localePrefix: localePrefix, startedAt: now)
    }

    /// The decision while a payment session is active, for URLs the ordinary
    /// allowlist has already refused.
    static func decideDuringPayment(_ url: String?) -> Decision {
        guard let parts = UrlParts.parse(url) else { return .block }
        switch parts.scheme {
        case "https":
            return parts.host.isEmpty ? .block : .allow
        case "http", "javascript", "data", "file", "blob", "about", "intent":
            // Plain HTTP is never needed by a real bank page; the rest are the
            // schemes an embedded browser must never act on. (`intent:` is
            // Android-only and means nothing on iOS.)
            return .block
        default:
            // "Approve in your banking app": the bank's own URL scheme. iOS
            // opens the app registered for it, or nothing.
            return .handOff
        }
    }

    /// The review form's target — the hop between our page and the bank.
    static func isPaymentStartEndpoint(_ url: String?, origins: AllowedOrigins) -> Bool {
        guard let parts = UrlParts.parse(url), origins.isAllowed(parts) else { return false }
        var path = parts.path
        while path.hasSuffix("/") { path.removeLast() }
        return path == "/api/payments/start"
    }

    /// "https://host[:port]" of an absolute URL, without user info.
    static func originOf(_ url: String?) -> String? {
        guard let raw = url?.trimmingCharacters(in: .whitespacesAndNewlines),
              let schemeEnd = raw.range(of: "://"),
              schemeEnd.lowerBound > raw.startIndex
        else { return nil }
        let scheme = raw[..<schemeEnd.lowerBound].lowercased()
        guard scheme == "https" || scheme == "http" else { return nil }

        let afterSlashes = raw[schemeEnd.upperBound...]
        let end = afterSlashes.firstIndex { $0 == "/" || $0 == "?" || $0 == "#" }
        var authority = end.map { afterSlashes[..<$0] } ?? afterSlashes
        if let at = authority.lastIndex(of: "@") {
            authority = authority[authority.index(after: at)...]
        }
        guard !authority.isEmpty, !authority.contains(where: { $0.isWhitespace }) else { return nil }
        return "\(scheme)://\(authority.lowercased())"
    }

    /// One query parameter; no percent-decoding needed for the token alphabet.
    static func queryParam(_ url: String?, name: String) -> String? {
        guard let url, let questionMark = url.firstIndex(of: "?") else { return nil }
        var query = url[url.index(after: questionMark)...]
        if let hash = query.firstIndex(of: "#") { query = query[..<hash] }
        for pair in query.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            if parts.count == 2, parts[0] == Substring(name) { return String(parts[1]) }
        }
        return nil
    }

    /// `^[A-Za-z0-9_-]{16,64}$`, as on Android.
    static func isValidToken(_ token: String) -> Bool {
        guard (16...64).contains(token.count) else { return false }
        return token.allSatisfy { char in
            char.isASCII && (char.isLetter || char.isNumber || char == "_" || char == "-")
        }
    }
}
