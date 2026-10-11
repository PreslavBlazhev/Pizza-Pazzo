import XCTest

/// Drives the real app against the live site, read-only: pages are opened and
/// a pizza goes into the cart (which lives only on the device), but no order,
/// login or account is ever submitted.
///
/// Every step saves a screenshot (kept in the .xcresult) — those are the
/// screenshots in ios-app/docs/screenshots.
final class PizzaPazzoUITests: XCTestCase {

    private let pageTimeout: TimeInterval = 45

    override func setUp() {
        continueAfterFailure = false
    }

    // MARK: - Helpers

    @discardableResult
    private func launch(path: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        if let path { app.launchArguments += ["-PPStartPath", path] }
        app.launch()
        return app
    }

    /// Any element inside the site whose label contains `text`.
    private func siteText(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.webViews.firstMatch
            .descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", text))
            .firstMatch
    }

    @discardableResult
    private func waitForSiteText(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        let element = siteText(app, text)
        XCTAssertTrue(element.waitForExistence(timeout: pageTimeout), "«\(text)» did not appear")
        return element
    }

    private func waitForFirstPage(_ app: XCUIApplication) {
        let overlay = app.descendants(matching: .any)["launchOverlay"]
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: overlay)
        wait(for: [gone], timeout: pageTimeout)
        XCTAssertFalse(app.staticTexts["errorTitle"].exists, "the error screen is showing")
    }

    private func snapshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // MARK: - Customer

    func test01HomeMenuAndSwipeBack() {
        let app = launch()
        waitForSiteText(app, "Различно")
        snapshot("01-home")

        app.webViews.links["Разгледай менюто"].firstMatch.tap()
        waitForSiteText(app, "Дигитално меню")
        sleep(1)
        snapshot("02-menu")

        // iOS back: swipe from the left edge of the screen.
        let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.5))
        edge.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
        waitForSiteText(app, "Различно")
        sleep(1)
        snapshot("03-back-to-home")
    }

    func test02ProductCartSurvivesRelaunchAndCheckoutOpens() throws {
        var app = launch(path: "/product/margarita")
        waitForSiteText(app, "Маргарита")
        sleep(1)
        snapshot("04-product")

        let add = app.webViews.buttons["Добави в количката"].firstMatch
        XCTAssertTrue(add.waitForExistence(timeout: pageTimeout))
        guard add.isEnabled else {
            snapshot("04b-store-closed")
            throw XCTSkip("The restaurant is closed right now, so the site disables add-to-cart.")
        }
        add.tap()
        sleep(2)

        // The cart lives in the web view's localStorage: it must survive the
        // app being closed and opened again.
        app.terminate()
        app = launch(path: "/cart")
        waitForSiteText(app, "Маргарита")
        XCTAssertFalse(siteText(app, "Количката е празна").exists)
        sleep(1)
        snapshot("05-cart-after-relaunch")

        // The checkout form opens; nothing is submitted.
        app.terminate()
        app = launch(path: "/checkout")
        waitForFirstPage(app)
        sleep(3)
        snapshot("06-checkout-form-not-submitted")
    }

    func test03LoginAndProtectedPages() {
        var app = launch(path: "/auth/login")
        waitForSiteText(app, "Вход в профила")
        sleep(1)
        snapshot("07-login")

        // Not logged in: the server sends both the profile and the staff panel
        // to the login page.
        app.terminate()
        app = launch(path: "/profile")
        waitForSiteText(app, "Вход в профила")
        snapshot("08-profile-asks-to-log-in")

        app.terminate()
        app = launch(path: "/admin")
        waitForSiteText(app, "Вход в профила")
        snapshot("09-admin-asks-to-log-in")

        app.terminate()
        app = launch(path: "/account-deletion")
        waitForSiteText(app, "Изтриване на профил")
        sleep(1)
        snapshot("10-account-deletion")
    }

    func test04ExternalLinkOpensInSafariSheet() {
        let app = launch(path: "/contacts")
        let maps = app.webViews.links.matching(NSPredicate(format: "label CONTAINS %@", "Google Maps")).firstMatch
        XCTAssertTrue(maps.waitForExistence(timeout: pageTimeout))
        maps.tap()

        let done = app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Готово", "Close", "Затваряне"])).firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 20), "the in-app Safari sheet did not open")
        sleep(3)
        snapshot("11-external-link-in-safari-sheet")

        done.tap()
        XCTAssertTrue(app.webViews["siteWebView"].waitForExistence(timeout: 10))
        XCTAssertTrue(maps.waitForExistence(timeout: 10), "back on the contacts page")
    }

    func test05SiteLinkWithTargetBlankOpensInASheet() {
        let app = launch(path: "/auth/register")
        let terms = app.webViews.links.matching(NSPredicate(format: "label CONTAINS %@", "Общите условия")).firstMatch
        XCTAssertTrue(terms.waitForExistence(timeout: pageTimeout))
        terms.tap()

        let done = app.buttons["popupDone"]
        XCTAssertTrue(done.waitForExistence(timeout: 20), "the terms did not open in a sheet")
        sleep(4)
        snapshot("12-terms-in-sheet-over-registration")
        done.tap()
        XCTAssertTrue(terms.waitForExistence(timeout: 10), "the registration form is still there")
    }

    // MARK: - No connection

    /// Runs only in CI (`PP_SIGNAL_DIR` set): the workflow makes the site
    /// unreachable (pizzapazzo.bg → 127.0.0.1 in /etc/hosts), waits for this
    /// test to see the error screen, restores the network, and the test then
    /// presses "Опитай отново".
    func test06ErrorScreenAndRetry() throws {
        guard let signalDir = ProcessInfo.processInfo.environment["PP_SIGNAL_DIR"], !signalDir.isEmpty else {
            throw XCTSkip("needs the CI network switch (PP_SIGNAL_DIR)")
        }
        let shown = URL(fileURLWithPath: signalDir).appendingPathComponent("error-shown")
        let restored = URL(fileURLWithPath: signalDir).appendingPathComponent("network-restored")

        let app = launch()
        let title = app.staticTexts["errorTitle"]
        XCTAssertTrue(title.waitForExistence(timeout: 90), "no error screen while the site is unreachable")
        let retry = app.buttons["retryButton"]
        XCTAssertTrue(retry.exists)
        snapshot("13-site-unreachable")

        // Pressing retry while still unreachable must bring the error back.
        retry.tap()
        XCTAssertTrue(title.waitForExistence(timeout: 90))

        FileManager.default.createFile(atPath: shown.path, contents: Data())
        let deadline = Date().addingTimeInterval(120)
        while !FileManager.default.fileExists(atPath: restored.path) && Date() < deadline {
            sleep(1)
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: restored.path), "the workflow never restored the network")

        retry.tap()
        waitForSiteText(app, "Различно")
        XCTAssertFalse(title.exists)
        sleep(1)
        snapshot("14-after-retry")
    }
}
