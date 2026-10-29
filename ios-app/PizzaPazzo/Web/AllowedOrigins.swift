import Foundation

/// Which sites the app's web view may show as "the app", and which pages may
/// reach the app's one native function (printing, see `PrintBridge`).
///
/// The iOS counterpart of `android-app/.../webview/AllowedOrigins.kt`, with one
/// deliberate difference: there are no development hosts. Android lets debug
/// builds reach a plain-HTTP `next dev` server on the LAN; on iOS that would
/// need an App Transport Security exception, and this app keeps ATS fully on.
/// Only HTTPS hosts listed in `PP_SITE_HOSTS` (Config/App.xcconfig) are ours.
struct AllowedOrigins: Equatable {

    let hosts: Set<String>

    init(hosts: [String]) {
        self.hosts = Set(
            hosts
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
        )
    }

    /// Parses the comma-separated `PPSiteHosts` value from Info.plist.
    init(commaSeparated: String) {
        self.init(hosts: commaSeparated.split(separator: ",").map(String.init))
    }

    /// Schemes handed to another app (Phone, Mail, Messages) instead of loaded.
    ///
    /// `javascript:`, `data:`, `file:` and `blob:` are deliberately absent: they
    /// are how an embedded browser gets talked into running or reading
    /// something it was never meant to.
    static let systemHandOffSchemes: Set<String> = ["tel", "mailto", "sms"]

    func isAllowed(_ parts: UrlParts?) -> Bool {
        guard let parts, !parts.host.isEmpty else { return false }
        return parts.scheme == "https" && hosts.contains(parts.host)
    }

    func isAllowed(_ url: String?) -> Bool {
        isAllowed(UrlParts.parse(url))
    }

    /// The same decision for a `URL`, cross-checked against Foundation's own
    /// reading of the host so that the two parsers can never disagree in an
    /// attacker's favour.
    func isAllowed(_ url: URL?) -> Bool {
        guard let url, isAllowed(url.absoluteString) else { return false }
        guard let foundationHost = url.host?.lowercased() else { return false }
        return hosts.contains(foundationHost)
    }

    /// For a `WKSecurityOrigin`-style triple (used by the print bridge).
    func isAllowed(scheme: String, host: String) -> Bool {
        scheme.lowercased() == "https" && hosts.contains(host.lowercased())
    }
}
