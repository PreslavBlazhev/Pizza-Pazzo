import XCTest
@testable import PizzaPazzo

/// Same cases as android-app/.../PaymentFlowTest.kt, plus the iOS differences.
final class PaymentFlowTests: XCTestCase {

    private let token = "AbCdEf0123456789_-xyz"
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func session(_ url: String?) -> PaymentFlow.Session? {
        PaymentFlow.sessionStartedFrom(url, now: now, origins: siteOrigins)
    }

    func testReviewScreenStartsAPaymentSessionForItsOrder() throws {
        let s = try XCTUnwrap(session("https://pizza-pazzo.onrender.com/checkout/pay/\(token)"))
        XCTAssertEqual(s.token, token)
        XCTAssertEqual(s.origin, "https://pizza-pazzo.onrender.com")
        XCTAssertEqual(s.localePrefix, "")
        XCTAssertEqual(s.resumeURL, "https://pizza-pazzo.onrender.com/payment/return?t=\(token)")
    }

    func testEnglishReviewScreenResumesInEnglish() {
        XCTAssertEqual(
            session("https://www.pizzapazzo.bg/en/checkout/pay/\(token)?error=BUSY")?.resumeURL,
            "https://www.pizzapazzo.bg/en/payment/return?t=\(token)"
        )
    }

    func testBackToTheBankFromThePendingScreenAlsoStartsASession() {
        XCTAssertEqual(session("https://pizzapazzo.bg/payment/pending?t=\(token)")?.token, token)
    }

    func testOrdinaryPagesForeignHostsAndBadTokensStartNothing() {
        XCTAssertNil(session("https://pizzapazzo.bg/menu"))
        XCTAssertNil(session("https://pizzapazzo.bg/checkout"))
        XCTAssertNil(session("https://evil.example.com/checkout/pay/\(token)"))
        XCTAssertNil(session("https://pizzapazzo.bg@evil.example.com/checkout/pay/\(token)"))
        XCTAssertNil(session("http://pizzapazzo.bg/checkout/pay/\(token)"))
        XCTAssertNil(session("https://pizzapazzo.bg/checkout/pay/short"))
        XCTAssertNil(session("https://pizzapazzo.bg/checkout/pay/bad%20token%20with%20spaces"))
        XCTAssertNil(session(nil))
    }

    func testDuringAPaymentBankAnd3DSLoadInTheAppPlainHTTPNever() {
        XCTAssertEqual(PaymentFlow.decideDuringPayment("https://gateway.bank.example/pay?id=1"), .allow)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("https://acs.issuer.example/3ds/challenge"), .allow)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("http://gateway.bank.example/pay"), .block)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("javascript:alert(1)"), .block)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("file:///private/var/x"), .block)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("data:text/html,x"), .block)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("intent://pay#Intent;scheme=bank;end"), .block)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("mybank://approve?id=1"), .handOff)
        XCTAssertEqual(PaymentFlow.decideDuringPayment("not a url"), .block)
    }

    func testSessionLapsesAfterAnHour() throws {
        let s = try XCTUnwrap(session("https://pizzapazzo.bg/checkout/pay/\(token)"))
        XCTAssertFalse(s.isExpired(now: now.addingTimeInterval(59 * 60)))
        XCTAssertTrue(s.isExpired(now: now.addingTimeInterval(PaymentFlow.maxSessionDuration + 1)))
    }

    func testStartEndpointIsRecognisedAsTheHopToTheBank() {
        XCTAssertTrue(PaymentFlow.isPaymentStartEndpoint("https://pizzapazzo.bg/api/payments/start", origins: siteOrigins))
        XCTAssertTrue(PaymentFlow.isPaymentStartEndpoint("https://pizzapazzo.bg/api/payments/start/", origins: siteOrigins))
        XCTAssertFalse(PaymentFlow.isPaymentStartEndpoint("https://evil.example.com/api/payments/start", origins: siteOrigins))
        XCTAssertFalse(PaymentFlow.isPaymentStartEndpoint("https://pizzapazzo.bg/api/payments/status", origins: siteOrigins))
    }

    func testOriginKeepsThePortAndDropsUserInfo() {
        XCTAssertEqual(PaymentFlow.originOf("https://pizzapazzo.bg:8443/checkout/pay/x"), "https://pizzapazzo.bg:8443")
        XCTAssertEqual(PaymentFlow.originOf("https://user@PizzaPazzo.bg/x"), "https://pizzapazzo.bg")
        XCTAssertNil(PaymentFlow.originOf("mailto:x@y.z"))
    }

    func testQueryParametersAreReadExactly() {
        XCTAssertEqual(PaymentFlow.queryParam("https://h/p?x=1&t=abc#frag", name: "t"), "abc")
        XCTAssertNil(PaymentFlow.queryParam("https://h/p?tt=abc", name: "t"))
        XCTAssertNil(PaymentFlow.queryParam("https://h/p", name: "t"))
    }

    func testSessionSurvivesARoundTripThroughTheStore() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "PaymentFlowTests"))
        defaults.removePersistentDomain(forName: "PaymentFlowTests")
        let store = PaymentSessionStore(defaults: defaults)
        let s = try XCTUnwrap(session("https://pizzapazzo.bg/checkout/pay/\(token)"))
        XCTAssertNil(store.load())
        store.save(s)
        XCTAssertEqual(store.load(), s)
        store.clear()
        XCTAssertNil(store.load())
    }
}

final class NavigationPolicyTests: XCTestCase {

    private let policy = NavigationPolicy(origins: siteOrigins)
    private let token = "AbCdEf0123456789_-xyz"

    private func decide(
        _ url: String,
        mainFrame: Bool = true,
        tapped: Bool = true,
        payment: PaymentFlow.Session? = nil,
        candidate: PaymentFlow.Session? = nil
    ) -> NavigationPolicy.Decision {
        policy.decide(
            .init(url: url, isMainFrame: mainFrame, isUserInitiated: tapped),
            activePayment: payment,
            paymentCandidate: candidate
        )
    }

    private var aSession: PaymentFlow.Session {
        PaymentFlow.Session(token: token, origin: "https://pizzapazzo.bg", localePrefix: "", startedAt: Date())
    }

    func testEveryCustomerAndStaffRouteOfTheSiteLoadsInTheApp() {
        let paths = [
            "/", "/menu", "/menu/pizzi", "/product/margarita", "/popular", "/cart", "/checkout",
            "/order-success", "/auth/login", "/auth/register", "/profile", "/profile/orders",
            "/account-deletion", "/account-deleted", "/contacts", "/terms", "/privacy",
            "/app-privacy", "/admin", "/admin/orders/live", "/admin/orders/12/print?t=kitchen",
            "/en/menu", "/payment/return?t=\(token)",
        ]
        for path in paths {
            XCTAssertEqual(decide("https://pizzapazzo.bg\(path)", tapped: false), .allow, path)
        }
        XCTAssertEqual(decide("https://www.pizzapazzo.bg/"), .allow)
        XCTAssertEqual(decide("https://pizza-pazzo.onrender.com/"), .allow)
    }

    func testOffSiteLinksOpenInSafariNotInTheApp() {
        XCTAssertEqual(decide("https://www.google.com/maps/search/?api=1&query=Pizza"), .openInSafari)
        XCTAssertEqual(decide("https://kzp.bg"), .openInSafari)
        XCTAssertEqual(decide("http://example.com/"), .openInSafari)
        XCTAssertEqual(decide("https://pizzapazzo.bg@evil.example.com/"), .openInSafari)
    }

    func testPhoneMailAndSMSGoToTheirApps() {
        XCTAssertEqual(decide("tel:+359888123456"), .openExternally)
        XCTAssertEqual(decide("mailto:info@example.com"), .openExternally)
        XCTAssertEqual(decide("sms:+359888123456"), .openExternally)
    }

    func testDangerousSchemesAreBlocked() {
        XCTAssertEqual(decide("javascript:alert(1)"), .block)
        XCTAssertEqual(decide("file:///etc/passwd"), .block)
        XCTAssertEqual(decide("data:text/html,hi"), .block)
        XCTAssertEqual(decide("intent://x#Intent;end"), .block)
        XCTAssertEqual(decide("someapp://do-something"), .block)
    }

    func testIframesMayShowHTTPSContentButNothingElse() {
        // The contacts page's click-to-load Google map.
        XCTAssertEqual(decide("https://www.google.com/maps/embed?pb=x", mainFrame: false, tapped: false), .allow)
        XCTAssertEqual(decide("http://ads.example.com/", mainFrame: false, tapped: false), .block)
        XCTAssertEqual(decide("tel:+359888", mainFrame: false, tapped: false), .block)
        XCTAssertEqual(decide("about:blank", mainFrame: false, tapped: false), .allow)
    }

    func testThePaymentStartsOnlyFromTheReviewScreen() {
        let candidate = aSession
        XCTAssertEqual(decide("https://gateway.bank.example/pay", tapped: false, candidate: candidate), .startPayment(candidate))
        // No review screen → an ordinary off-site link.
        XCTAssertEqual(decide("https://gateway.bank.example/pay"), .openInSafari)
        // Plain HTTP never starts a payment.
        XCTAssertEqual(decide("http://gateway.bank.example/pay", candidate: candidate), .openInSafari)
    }

    func testDuringAPaymentTheBankAnd3DSStayInTheApp() {
        let payment = aSession
        XCTAssertEqual(decide("https://acs.issuer.example/3ds", tapped: false, payment: payment), .allow)
        XCTAssertEqual(decide("https://acs.issuer.example/frame", mainFrame: false, tapped: false, payment: payment), .allow)
        XCTAssertEqual(decide("mybank://approve", payment: payment), .openExternally)
        XCTAssertEqual(decide("mybank://approve", mainFrame: false, tapped: false, payment: payment), .block)
        XCTAssertEqual(decide("http://gateway.bank.example/", payment: payment), .block)
        XCTAssertEqual(decide("https://pizzapazzo.bg/payment/return?t=\(token)", payment: payment), .allow)
    }
}

final class AppConfigTests: XCTestCase {

    /// Guards the `https:/$()/` trick in Config/App.xcconfig: the value that
    /// really reaches the app must be the live site.
    func testBuiltInfoPlistPointsAtTheLiveSite() throws {
        let config = try AppConfig.fromInfoPlist()
        XCTAssertEqual(config.startURL.absoluteString, "https://pizzapazzo.bg/")
        XCTAssertEqual(config.origins.hosts, ["pizzapazzo.bg", "www.pizzapazzo.bg", "pizza-pazzo.onrender.com"])
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String, "Pizza Pazzo")
    }

    func testStartURLMustBeHTTPSAndOnTheAllowlist() {
        XCTAssertThrowsError(try AppConfig.make(startURL: "http://pizzapazzo.bg/", siteHosts: "pizzapazzo.bg"))
        XCTAssertThrowsError(try AppConfig.make(startURL: "https://other.example/", siteHosts: "pizzapazzo.bg"))
        XCTAssertThrowsError(try AppConfig.make(startURL: "https:", siteHosts: "pizzapazzo.bg"))
        XCTAssertThrowsError(try AppConfig.make(startURL: nil, siteHosts: "pizzapazzo.bg"))
        XCTAssertNoThrow(try AppConfig.make(startURL: "https://pizzapazzo.bg/", siteHosts: "pizzapazzo.bg"))
    }

    func testDebugStartPathStaysOnTheSite() throws {
        let config = try AppConfig.make(startURL: "https://pizzapazzo.bg/", siteHosts: "pizzapazzo.bg")
        XCTAssertEqual(config.initialURL(debugStartPath: nil).absoluteString, "https://pizzapazzo.bg/")
        XCTAssertEqual(config.initialURL(debugStartPath: "/menu").absoluteString, "https://pizzapazzo.bg/menu")
        // Scheme-relative or absolute "paths" can never lead elsewhere.
        XCTAssertEqual(config.initialURL(debugStartPath: "//evil.example.com/").absoluteString, "https://pizzapazzo.bg/")
        XCTAssertEqual(config.initialURL(debugStartPath: "https://evil.example.com/").absoluteString, "https://pizzapazzo.bg/")
    }
}
