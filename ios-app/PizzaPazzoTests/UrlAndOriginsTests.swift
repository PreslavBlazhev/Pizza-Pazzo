import XCTest
@testable import PizzaPazzo

/// The hosts the app is built with (Config/App.xcconfig).
let siteOrigins = AllowedOrigins(commaSeparated: "pizzapazzo.bg,www.pizzapazzo.bg,pizza-pazzo.onrender.com")

/// Same cases as android-app/.../UrlPartsTest.kt — both apps must read a URL alike.
final class UrlPartsTests: XCTestCase {

    func testOrdinaryHttpsURLSplitsIntoSchemeHostAndPath() throws {
        let parts = try XCTUnwrap(UrlParts.parse("https://pizza-pazzo.onrender.com/menu/pizzi"))
        XCTAssertEqual(parts.scheme, "https")
        XCTAssertEqual(parts.host, "pizza-pazzo.onrender.com")
        XCTAssertEqual(parts.path, "/menu/pizzi")
        XCTAssertEqual(parts.segments, ["menu", "pizzi"])
    }

    func testSchemeAndHostAreLowercased() throws {
        let parts = try XCTUnwrap(UrlParts.parse("HTTPS://PizzaPazzo.BG/Menu"))
        XCTAssertEqual(parts.scheme, "https")
        XCTAssertEqual(parts.host, "pizzapazzo.bg")
        XCTAssertEqual(parts.path, "/Menu")
    }

    func testURLWithNoPathReportsTheRoot() {
        XCTAssertEqual(UrlParts.parse("https://pizzapazzo.bg")?.path, "/")
        XCTAssertEqual(UrlParts.parse("https://pizzapazzo.bg/")?.path, "/")
    }

    func testQueryAndFragmentAreCutOffThePath() {
        XCTAssertEqual(UrlParts.parse("https://pizzapazzo.bg/admin/orders?a=1")?.path, "/admin/orders")
        XCTAssertEqual(UrlParts.parse("https://pizzapazzo.bg/admin/orders#top")?.path, "/admin/orders")
    }

    func testPortIsNotPartOfTheHost() {
        XCTAssertEqual(UrlParts.parse("https://pizzapazzo.bg:8443/menu")?.host, "pizzapazzo.bg")
    }

    func testUserInfoIsStrippedSoItCannotImpersonateAHost() {
        XCTAssertEqual(UrlParts.parse("https://pizzapazzo.bg@evil.example.com/")?.host, "evil.example.com")
        XCTAssertEqual(UrlParts.parse("https://user:pass@evil.example.com/")?.host, "evil.example.com")
        XCTAssertEqual(UrlParts.parse("https://a@b@evil.example.com/")?.host, "evil.example.com")
    }

    func testSchemesWithoutAuthorityKeepAnEmptyHost() {
        XCTAssertEqual(UrlParts.parse("tel:+35988248477")?.scheme, "tel")
        XCTAssertEqual(UrlParts.parse("tel:+35988248477")?.host, "")
        XCTAssertEqual(UrlParts.parse("mailto:info@example.com")?.scheme, "mailto")
    }

    func testIPv6LiteralSurvivesIntact() {
        XCTAssertEqual(UrlParts.parse("http://[::1]:8080/menu")?.host, "[::1]")
    }

    func testNonsenseReturnsNilInsteadOfCrashing() {
        XCTAssertNil(UrlParts.parse(nil))
        XCTAssertNil(UrlParts.parse(""))
        XCTAssertNil(UrlParts.parse("   "))
        XCTAssertNil(UrlParts.parse("no-scheme-here"))
        XCTAssertNil(UrlParts.parse("://missing-scheme"))
        XCTAssertNil(UrlParts.parse("1http://starts-with-a-digit"))
        XCTAssertNil(UrlParts.parse("https://"))
        XCTAssertNil(UrlParts.parse("https://pizza zzo.bg/"))
    }

    func testCyrillicQueryDoesNotBreakParsing() {
        let parts = UrlParts.parse("https://pizzapazzo.bg/menu?q=пица")
        XCTAssertEqual(parts?.host, "pizzapazzo.bg")
        XCTAssertEqual(parts?.path, "/menu")
    }
}

final class AllowedOriginsTests: XCTestCase {

    func testTheThreeSiteHostsAreAllowedOverHTTPS() {
        XCTAssertTrue(siteOrigins.isAllowed("https://pizzapazzo.bg/"))
        XCTAssertTrue(siteOrigins.isAllowed("https://www.pizzapazzo.bg/menu"))
        XCTAssertTrue(siteOrigins.isAllowed("https://pizza-pazzo.onrender.com/admin/orders/live"))
        XCTAssertTrue(siteOrigins.isAllowed("https://PIZZAPAZZO.BG/Menu"))
    }

    func testPlainHTTPIsNeverAllowed() {
        XCTAssertFalse(siteOrigins.isAllowed("http://pizzapazzo.bg/"))
    }

    func testLookalikeAndForeignHostsAreRefused() {
        XCTAssertFalse(siteOrigins.isAllowed("https://pizzapazzo.bg.evil.example.com/"))
        XCTAssertFalse(siteOrigins.isAllowed("https://evilpizzapazzo.bg/"))
        XCTAssertFalse(siteOrigins.isAllowed("https://pizzapazzo.bg@evil.example.com/"))
        XCTAssertFalse(siteOrigins.isAllowed("https://www.google.com/maps/search/?api=1&query=x"))
        XCTAssertFalse(siteOrigins.isAllowed("https://pizza-pazzo-staging.onrender.com/"))
    }

    func testNonWebSchemesAreRefused() {
        XCTAssertFalse(siteOrigins.isAllowed("tel:+359888"))
        XCTAssertFalse(siteOrigins.isAllowed("javascript:alert(1)"))
        XCTAssertFalse(siteOrigins.isAllowed("data:text/html,hi"))
        XCTAssertFalse(siteOrigins.isAllowed("file:///etc/passwd"))
        XCTAssertFalse(siteOrigins.isAllowed(nil as String?))
    }

    func testFoundationURLIsCrossChecked() {
        XCTAssertTrue(siteOrigins.isAllowed(URL(string: "https://pizzapazzo.bg/cart")))
        XCTAssertFalse(siteOrigins.isAllowed(URL(string: "https://pizzapazzo.bg@evil.example.com/")))
        XCTAssertFalse(siteOrigins.isAllowed(nil as URL?))
    }

    func testSecurityOriginTriple() {
        XCTAssertTrue(siteOrigins.isAllowed(scheme: "https", host: "pizzapazzo.bg"))
        XCTAssertFalse(siteOrigins.isAllowed(scheme: "http", host: "pizzapazzo.bg"))
        XCTAssertFalse(siteOrigins.isAllowed(scheme: "https", host: "acs.issuer.example"))
    }

    func testEmptyEntriesInTheHostListAreIgnored() {
        let origins = AllowedOrigins(commaSeparated: " pizzapazzo.bg , ,")
        XCTAssertEqual(origins.hosts, ["pizzapazzo.bg"])
    }
}

/// Same cases as android-app/.../StaffRoutesTest.kt.
final class StaffRoutesTests: XCTestCase {

    private func isStaff(_ url: String?) -> Bool {
        StaffRoutes.isStaffArea(url, origins: siteOrigins)
    }

    func testNilAndBlankAreNotStaff() {
        XCTAssertFalse(isStaff(nil))
        XCTAssertFalse(isStaff(""))
        XCTAssertFalse(isStaff("   "))
    }

    func testOffSiteURLIsNeverStaffEvenWhenItsPathSaysAdmin() {
        XCTAssertFalse(isStaff("https://evil.example.com/admin"))
        XCTAssertFalse(isStaff("https://pizzapazzo.bg.evil.example.com/admin"))
    }

    func testPlainHTTPIsNeverStaff() {
        XCTAssertFalse(isStaff("http://pizza-pazzo.onrender.com/admin"))
    }

    func testPathThatMerelyStartsWithAdminIsNotStaff() {
        XCTAssertFalse(isStaff("https://pizzapazzo.bg/administrators"))
        XCTAssertFalse(isStaff("https://pizzapazzo.bg/admin-guide"))
        XCTAssertFalse(isStaff("https://pizzapazzo.bg/product/admin"))
    }

    func testAdminAndEverythingUnderItIsStaffWithOrWithoutLocale() {
        XCTAssertTrue(isStaff("https://pizzapazzo.bg/admin"))
        XCTAssertTrue(isStaff("https://pizzapazzo.bg/admin/"))
        XCTAssertTrue(isStaff("https://pizzapazzo.bg/admin/orders/live"))
        XCTAssertTrue(isStaff("https://pizzapazzo.bg/en/admin/orders/1/print?t=kitchen"))
        XCTAssertTrue(isStaff("https://www.pizzapazzo.bg/bg/ADMIN"))
    }

    func testCustomerPagesAreNotStaff() {
        XCTAssertFalse(isStaff("https://pizzapazzo.bg/"))
        XCTAssertFalse(isStaff("https://pizzapazzo.bg/menu"))
        XCTAssertFalse(isStaff("https://pizzapazzo.bg/en/cart"))
    }
}
