import Combine
import Network
import os
import UIKit
import WebKit

/// Navigation trace — debug builds only (URLs can carry an order token).
func debugTrace(_ message: @autoclosure () -> String) {
    #if DEBUG
    Logger(subsystem: "bg.pizzapazzo.app", category: "web").notice("\(message(), privacy: .public)")
    #endif
}

/// The whole app behind one screen: a web view onto the Pizza Pazzo site.
///
/// The iOS counterpart of the Android app's `MainActivity` +
/// `SiteWebViewClient`. It serves two people out of the same screen — a
/// customer ordering, and staff on `/admin` — and the difference is decided by
/// the server from the login cookie, not here. Constant either way: no address
/// bar, and nothing off the allowlist loads as "the app".
@MainActor
final class WebViewModel: NSObject, ObservableObject {

    enum LoadError: Equatable {
        /// The device has no usable connection.
        case offline
        /// The device is online but the site did not load.
        case failed
    }

    @Published private(set) var isLoading = false
    @Published private(set) var progress: Double = 0
    @Published private(set) var loadError: LoadError?
    /// False until the first page has rendered — the launch overlay shows until then.
    @Published private(set) var hasLoadedOnce = false

    let webView: WKWebView
    private let config: AppConfig
    private let policy: NavigationPolicy
    private let printBridge: PrintBridge
    private let paymentStore = PaymentSessionStore()

    /// A card payment in progress at the bank (see `PaymentFlow`).
    private var payment: PaymentFlow.Session?
    /// The payment the current page would start (review screen with "pay").
    private var paymentCandidate: PaymentFlow.Session?

    /// What "Опитай отново" loads: the page that failed, or the one requested.
    private var lastRequestedURL: URL?
    private var staffMode = false
    private var isOnline = true
    private let pathMonitor = NWPathMonitor()
    private let refreshControl = UIRefreshControl()
    private var subscriptions = Set<AnyCancellable>()

    private var origins: AllowedOrigins { config.origins }

    var activePayment: PaymentFlow.Session? {
        guard let payment, !payment.isExpired(now: Date()) else { return nil }
        return payment
    }

    init(config: AppConfig) {
        self.config = config
        self.policy = NavigationPolicy(origins: config.origins)
        self.printBridge = PrintBridge(origins: config.origins)
        self.webView = WebViewFactory.makeWebView(printBridge: printBridge)
        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.accessibilityIdentifier = "siteWebView"

        refreshControl.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl

        observeWebView()
        watchConnectivity()
    }

    // MARK: - Loading

    /// Opens the first page: an interrupted payment's status page, or the site.
    func start(debugStartPath: String?) {
        if let interrupted = paymentStore.load(), !interrupted.isExpired(now: Date()),
           let url = URL(string: interrupted.resumeURL), origins.isAllowed(url) {
            // iOS ended the app while the customer was at the bank. The bank
            // page cannot be restored, but the payment settles on the server
            // anyway — show the site's "checking your payment" screen.
            paymentStore.clear()
            load(url)
            return
        }
        paymentStore.clear()
        load(config.initialURL(debugStartPath: debugStartPath))
    }

    func retry() {
        loadError = nil
        if let url = lastRequestedURL, origins.isAllowed(url) || activePayment != nil {
            load(url)
        } else if webView.url != nil {
            webView.reload()
        } else {
            load(config.startURL)
        }
    }

    private func load(_ url: URL) {
        loadError = nil
        lastRequestedURL = url
        webView.load(URLRequest(url: url))
    }

    @objc private func pullToRefresh() {
        if loadError != nil || webView.url == nil {
            retry()
        } else {
            webView.reload()
        }
    }

    // MARK: - Observation

    private func observeWebView() {
        webView.publisher(for: \.estimatedProgress)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in self?.progress = value }
            .store(in: &subscriptions)

        webView.publisher(for: \.isLoading)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in
                self?.isLoading = value
                if !value { self?.refreshControl.endRefreshing() }
            }
            .store(in: &subscriptions)

        // Fires for every committed URL, including the client-side route
        // changes (history.pushState) the Next.js site makes without a load.
        webView.publisher(for: \.url)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] url in self?.urlChanged(url) }
            .store(in: &subscriptions)
    }

    private func urlChanged(_ url: URL?) {
        guard let url else { return }
        noteCommitted(url.absoluteString)
        applyScreenMode(for: url)
    }

    /// Reload by itself when the connection returns while the error is up.
    private func watchConnectivity() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor [weak self] in
                self?.connectivityChanged(online: online)
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "bg.pizzapazzo.app.path-monitor"))
    }

    private func connectivityChanged(online: Bool) {
        let cameBack = online && !isOnline
        isOnline = online
        if cameBack, loadError != nil { retry() }
    }

    /// The live orders board (`/admin…`) keeps the screen awake; customer
    /// pages never do. Cosmetic — the server decides who reaches `/admin`.
    private func applyScreenMode(for url: URL) {
        let staff = StaffRoutes.isStaffArea(url.absoluteString, origins: origins)
        guard staff != staffMode else { return }
        staffMode = staff
        UIApplication.shared.isIdleTimerDisabled = staff
    }

    // MARK: - Card payment session (see PaymentFlow)

    private func noteCommitted(_ url: String) {
        if let candidate = PaymentFlow.sessionStartedFrom(url, now: Date(), origins: origins) {
            paymentCandidate = candidate
        } else if PaymentFlow.isPaymentStartEndpoint(url, origins: origins) {
            // The hop between the review screen and the bank — keep the candidate.
        } else if origins.isAllowed(url) {
            paymentCandidate = nil
        }
    }

    /// The candidate, re-stamped: the session's clock starts at the bank.
    private func freshCandidate() -> PaymentFlow.Session? {
        guard var candidate = paymentCandidate else { return nil }
        candidate.startedAt = Date()
        return candidate
    }

    private func startPayment(_ session: PaymentFlow.Session) {
        payment = session
        paymentStore.save(session)
    }

    private func endPayment() {
        payment = nil
        paymentStore.clear()
    }

    /// Also recognises a payment from the page that actually started loading —
    /// the redirect after the review screen's POST — and ends the session as
    /// soon as the web view is back on the site.
    private func trackPayment(_ next: URL?) {
        let nextString = next?.absoluteString
        if activePayment != nil {
            if origins.isAllowed(nextString) { endPayment() }
            return
        }
        if let nextString, !origins.isAllowed(nextString),
           PaymentFlow.decideDuringPayment(nextString) == .allow,
           let candidate = freshCandidate() {
            startPayment(candidate)
        }
    }

    // MARK: - Errors

    private func handleLoadError(_ error: Error) {
        refreshControl.endRefreshing()
        let nsError = error as NSError
        debugTrace("load error \(nsError.domain) \(nsError.code)")

        // A navigation this class cancelled itself (an external link handed to
        // Safari, a blocked URL, a new load replacing an old one) is not an error.
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        if nsError.domain == "WebKitErrorDomain" && (nsError.code == 101 || nsError.code == 102) { return }

        if let failing = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL {
            lastRequestedURL = failing
        }
        let offlineCodes: Set<Int> = [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorDataNotAllowed,
            NSURLErrorInternationalRoamingOff,
        ]
        let offline = !isOnline || (nsError.domain == NSURLErrorDomain && offlineCodes.contains(nsError.code))
        loadError = offline ? .offline : .failed
    }
}

// MARK: - WKNavigationDelegate

extension WebViewModel: WKNavigationDelegate {

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        // target="_blank": nothing loads here; createWebViewWith routes it.
        guard let targetFrame = navigationAction.targetFrame else {
            decisionHandler(.allow)
            return
        }

        let request = NavigationPolicy.Request(
            url: url.absoluteString,
            isMainFrame: targetFrame.isMainFrame,
            isUserInitiated: navigationAction.navigationType == .linkActivated
        )
        var decision = policy.decide(request, activePayment: activePayment, paymentCandidate: freshCandidate())

        // Our own site must look like our site to Foundation's parser too.
        if decision == .allow, origins.isAllowed(url.absoluteString), !origins.isAllowed(url) {
            decision = .block
        }
        debugTrace("policy \(decision) main=\(targetFrame.isMainFrame) type=\(navigationAction.navigationType.rawValue) \(url.absoluteString)")

        switch decision {
        case .allow:
            decisionHandler(.allow)
        case .startPayment(let session):
            startPayment(session)
            decisionHandler(.allow)
        case .openInSafari:
            decisionHandler(.cancel)
            Presenter.openInSafari(url)
        case .openExternally:
            decisionHandler(.cancel)
            Presenter.openExternally(url)
        case .block:
            decisionHandler(.cancel)
            if targetFrame.isMainFrame { Presenter.showToast(Strings.blockedNavigation) }
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        loadError = nil
        trackPayment(webView.url)
    }

    func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
        trackPayment(webView.url)
        // A server redirect off the site, outside a payment, does not get to
        // turn the app into somebody else's site.
        if let url = webView.url, activePayment == nil, !origins.isAllowed(url) {
            webView.stopLoading()
            if url.scheme?.lowercased() == "https" { Presenter.openInSafari(url) }
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // Defence in depth: whatever got this far, a foreign page is never
        // shown as the app unless a payment is in progress.
        if let url = webView.url, ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
           activePayment == nil, !origins.isAllowed(url) {
            webView.stopLoading()
            if webView.canGoBack {
                webView.goBack()
            } else {
                load(config.startURL)
            }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasLoadedOnce = true
        loadError = nil
        refreshControl.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    /// The web content process died (memory pressure, crash). The login lives
    /// in the cookie store, not the process, so a reload brings everything back.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView.url != nil {
            webView.reload()
        } else {
            load(config.startURL)
        }
    }

    /// TLS is always the system's call — a bad certificate stays fatal. The one
    /// challenge answered here is the HTTP password of the protected staging
    /// copy of the site, and only for our own hosts: a foreign page can never
    /// raise a password dialog under the app's name.
    func webView(
        _ webView: WKWebView,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        let space = challenge.protectionSpace
        let method = space.authenticationMethod
        guard method == NSURLAuthenticationMethodHTTPBasic || method == NSURLAuthenticationMethodHTTPDigest else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        guard space.protocol?.lowercased() == "https",
              origins.isAllowed(scheme: "https", host: space.host),
              challenge.previousFailureCount < 3
        else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        Presenter.askForSitePassword(host: space.host) { credential in
            if let credential {
                completionHandler(.useCredential, credential)
            } else {
                completionHandler(.cancelAuthenticationChallenge, nil)
            }
        }
    }
}

// MARK: - WKUIDelegate

extension WebViewModel: WKUIDelegate {

    /// target="_blank" links. Our own pages (the policy links next to the
    /// registration form, the kitchen ticket) open in a sheet over the app, so
    /// a half-filled form underneath survives; anything else goes to Safari.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        debugTrace("new window \(url.absoluteString)")
        if origins.isAllowed(url) {
            SitePopupViewController.present(url: url, origins: origins, printBridge: printBridge)
            return nil
        }
        let request = NavigationPolicy.Request(url: url.absoluteString, isMainFrame: true, isUserInitiated: true)
        switch policy.decide(request, activePayment: activePayment, paymentCandidate: nil) {
        case .openInSafari:
            Presenter.openInSafari(url)
        case .openExternally:
            Presenter.openExternally(url)
        case .allow, .startPayment:
            // A payment page asked for a new window: keep it in this one.
            webView.load(URLRequest(url: url))
        case .block:
            Presenter.showToast(Strings.blockedNavigation)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        Presenter.alert(title: dialogTitle(for: frame), message: message, completion: completionHandler)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        Presenter.confirm(title: dialogTitle(for: frame), message: message, completion: completionHandler)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        Presenter.prompt(title: dialogTitle(for: frame), message: prompt, defaultText: defaultText, completion: completionHandler)
    }

    /// Dialogs from our own site carry no title; any other page's dialog
    /// (a bank page) says whose it is, so it cannot pose as Pizza Pazzo.
    private func dialogTitle(for frame: WKFrameInfo) -> String? {
        let origin = frame.securityOrigin
        return origins.isAllowed(scheme: origin.protocol, host: origin.host) ? nil : origin.host
    }
}
