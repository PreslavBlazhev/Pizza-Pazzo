import Foundation

/// Tells the staff area of the site (`/admin…`) apart from the customer area.
///
/// Port of `android-app/.../webview/StaffRoutes.kt`. **Not a security
/// boundary**: who may see `/admin` is decided by the server from the session
/// cookie. Here it only decides whether to keep the screen awake (the live
/// orders board) and whether the print bridge answers.
enum StaffRoutes {

    /// Locale prefixes the site may put in front of a path (`/en/admin`).
    private static let localePrefixes: Set<String> = ["en", "bg"]
    private static let staffSegment = "admin"

    static func isStaffArea(_ url: String?, origins: AllowedOrigins) -> Bool {
        guard let parts = UrlParts.parse(url), origins.isAllowed(parts) else { return false }
        let segments = parts.segments.map { $0.lowercased() }
        guard let first = segments.first else { return false }
        if first == staffSegment { return true }
        return localePrefixes.contains(first) && segments.count > 1 && segments[1] == staffSegment
    }
}
