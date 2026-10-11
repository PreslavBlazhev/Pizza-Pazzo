import Foundation

/// The site this app is a window onto. Read from Info.plist, where
/// Config/App.xcconfig puts it at build time (`PP_START_URL`, `PP_SITE_HOSTS`),
/// so moving to another address is a configuration change, not a code change.
struct AppConfig {

    let startURL: URL
    let origins: AllowedOrigins

    enum ConfigError: Error, Equatable {
        case missing(String)
        case notHTTPS(String)
        case startURLNotAllowed(String)
    }

    /// Validates the raw values. A start URL that is not HTTPS, or not on the
    /// allowlist, is a build mistake and must fail loudly, not load quietly.
    static func make(startURL rawStartURL: String?, siteHosts rawHosts: String?) throws -> AppConfig {
        guard let rawStartURL, !rawStartURL.isEmpty else { throw ConfigError.missing("PPStartURL") }
        guard let rawHosts, !rawHosts.isEmpty else { throw ConfigError.missing("PPSiteHosts") }
        guard let url = URL(string: rawStartURL), url.scheme?.lowercased() == "https" else {
            throw ConfigError.notHTTPS(rawStartURL)
        }
        let origins = AllowedOrigins(commaSeparated: rawHosts)
        guard origins.isAllowed(url) else { throw ConfigError.startURLNotAllowed(rawStartURL) }
        return AppConfig(startURL: url, origins: origins)
    }

    static func fromInfoPlist(_ bundle: Bundle = .main) throws -> AppConfig {
        try make(
            startURL: bundle.object(forInfoDictionaryKey: "PPStartURL") as? String,
            siteHosts: bundle.object(forInfoDictionaryKey: "PPSiteHosts") as? String
        )
    }

    /// The first page to open. In DEBUG builds the UI tests may ask for a
    /// specific page of the same site (`-PPStartPath /menu`); the result must
    /// still pass the allowlist, and release builds ignore the argument.
    func initialURL(debugStartPath: String?) -> URL {
        #if DEBUG
        if let path = debugStartPath, path.hasPrefix("/"), !path.hasPrefix("//"),
           let url = URL(string: path, relativeTo: startURL)?.absoluteURL,
           origins.isAllowed(url) {
            return url
        }
        #endif
        return startURL
    }

    var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }
}
