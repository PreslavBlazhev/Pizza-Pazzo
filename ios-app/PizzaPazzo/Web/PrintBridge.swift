import UIKit
import WebKit

/// Makes the site's own "🖨 Принтирай" button (the ticket page,
/// `/admin/orders/{id}/print`, which calls `window.print()`) open the iOS
/// system print dialog — AirPrint.
///
/// A third-party `WKWebView` ignores `window.print()` on iOS, so without this
/// the button would silently do nothing. What it is NOT: the Android app's
/// `window.AndroidPrinter` Bluetooth bridge. That is never injected here, so
/// the site keeps showing its browser variant ("🖨 Бележка" link) and never
/// claims a print it cannot make. Whether a printer appears in the dialog is
/// up to iOS: only AirPrint printers do; a Bluetooth ESC/POS thermal printer
/// does not (see ios-app/README.md, "Печат").
///
/// Security: the message handler is visible to every page the web view
/// shows, so the native side re-checks every call — main frame only, HTTPS,
/// an allowlisted host, and the staff area of the site. A bank page, an
/// iframe or a customer page gets nothing.
@MainActor
final class PrintBridge: NSObject, WKScriptMessageHandler {

    static let handlerName = "pizzaPazzoPrint"

    /// Replaces window.print in the page's main frame with a message to the app.
    static let userScript = WKUserScript(
        source: """
        (function () {
          if (location.protocol !== 'https:') { return; }
          var handler = window.webkit && window.webkit.messageHandlers
            && window.webkit.messageHandlers.\(handlerName);
          if (!handler) { return; }
          window.print = function () { handler.postMessage('print'); };
        })();
        """,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
    )

    private let origins: AllowedOrigins

    init(origins: AllowedOrigins) {
        self.origins = origins
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.frameInfo.isMainFrame,
              let webView = message.webView,
              origins.isAllowed(
                  scheme: message.frameInfo.securityOrigin.protocol,
                  host: message.frameInfo.securityOrigin.host
              ),
              origins.isAllowed(webView.url),
              StaffRoutes.isStaffArea(webView.url?.absoluteString, origins: origins)
        else { return }

        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.outputType = .general
        printInfo.jobName = webView.title ?? "Pizza Pazzo"

        let controller = UIPrintInteractionController.shared
        controller.printInfo = printInfo
        controller.printFormatter = webView.viewPrintFormatter()
        _ = controller.present(animated: true)
    }
}

/// `WKUserContentController` retains its handlers strongly; this breaks the
/// cycle web view → configuration → handler → (owner) → web view.
@MainActor
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// One place that builds every web view's configuration, so the main view
/// and popup sheets cannot drift apart.
@MainActor
enum WebViewFactory {

    static func makeWebView(printBridge: PrintBridge) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // The persistent, on-disk store: the login cookie (pp_session, 30 days)
        // and the cart in localStorage ("pp-cart") survive app restarts.
        configuration.websiteDataStore = .default()

        // The live orders board rings with Web Audio after "Начало на смяната";
        // that tap is the user gesture, but nothing else should need one.
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.allowsInlineMediaPlayback = true

        // Pop-ups only ever from a tap (target=_blank links), never by script.
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.preferences.isFraudulentWebsiteWarningEnabled = true

        // Keeps "Mobile/…" so the site still sees an iPhone, plus an app marker.
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        configuration.applicationNameForUserAgent = "Mobile/15E148 PizzaPazzoiOS/\(version)"

        let contentController = WKUserContentController()
        contentController.addUserScript(PrintBridge.userScript)
        contentController.add(WeakScriptMessageHandler(printBridge), name: PrintBridge.handlerName)
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "BrandCream")
        webView.scrollView.backgroundColor = UIColor(named: "BrandCream")
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) {
            // Safari ▸ Develop ▸ [iPhone] — debug builds only.
            webView.isInspectable = true
        }
        #endif
        return webView
    }
}
