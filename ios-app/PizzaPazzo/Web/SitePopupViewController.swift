import Combine
import UIKit
import WebKit

/// A Pizza Pazzo page the site opens with target="_blank" — the terms next to
/// the registration form, the kitchen ticket from the orders board — shown in
/// a sheet with "Готово", so the page underneath (and a half-filled form on
/// it) is still there when the sheet closes. Same cookie store as the main
/// view, so the login applies; same allowlist, so it cannot wander off either.
@MainActor
final class SitePopupViewController: UIViewController {

    private let initialURL: URL
    private let policy: NavigationPolicy
    private let webView: WKWebView
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private var subscriptions = Set<AnyCancellable>()

    static func present(url: URL, origins: AllowedOrigins, printBridge: PrintBridge) {
        let popup = SitePopupViewController(url: url, origins: origins, printBridge: printBridge)
        let navigation = UINavigationController(rootViewController: popup)
        navigation.modalPresentationStyle = .pageSheet
        Presenter.topViewController()?.present(navigation, animated: true)
    }

    private init(url: URL, origins: AllowedOrigins, printBridge: PrintBridge) {
        initialURL = url
        policy = NavigationPolicy(origins: origins)
        webView = WebViewFactory.makeWebView(printBridge: printBridge)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(named: "BrandCream")

        let done = UIBarButtonItem(title: Strings.done, style: .done, target: self, action: #selector(close))
        done.accessibilityIdentifier = "popupDone"
        navigationItem.rightBarButtonItem = done

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.accessibilityIdentifier = "popupWebView"
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = UIColor(named: "AccentColor")
        view.addSubview(progressView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        webView.publisher(for: \.title)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] title in self?.title = title }
            .store(in: &subscriptions)
        webView.publisher(for: \.estimatedProgress)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in
                self?.progressView.setProgress(Float(value), animated: true)
                self?.progressView.isHidden = value >= 1
            }
            .store(in: &subscriptions)

        webView.load(URLRequest(url: initialURL))
    }

    @objc private func close() {
        dismiss(animated: true)
    }
}

extension SitePopupViewController: WKNavigationDelegate {

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        guard let targetFrame = navigationAction.targetFrame else {
            decisionHandler(.allow) // routed by createWebViewWith below
            return
        }
        let request = NavigationPolicy.Request(
            url: url.absoluteString,
            isMainFrame: targetFrame.isMainFrame,
            isUserInitiated: navigationAction.navigationType == .linkActivated
        )
        // No payments start from a sheet: the checkout lives in the main view.
        switch policy.decide(request, activePayment: nil, paymentCandidate: nil) {
        case .allow:
            let foundationAgrees = !targetFrame.isMainFrame || policy.origins.isAllowed(url)
            decisionHandler(foundationAgrees ? .allow : .cancel)
        case .openInSafari:
            decisionHandler(.cancel)
            Presenter.openInSafari(url)
        case .openExternally:
            decisionHandler(.cancel)
            Presenter.openExternally(url)
        case .startPayment, .block:
            decisionHandler(.cancel)
            if targetFrame.isMainFrame { Presenter.showToast(Strings.blockedNavigation) }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        if nsError.domain == "WebKitErrorDomain" && (nsError.code == 101 || nsError.code == 102) { return }
        Presenter.showToast(Strings.loadErrorTitle)
    }
}

extension SitePopupViewController: WKUIDelegate {

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if policy.origins.isAllowed(url) {
            webView.load(URLRequest(url: url)) // one sheet is enough
        } else {
            let request = NavigationPolicy.Request(url: url.absoluteString, isMainFrame: true, isUserInitiated: true)
            switch policy.decide(request, activePayment: nil, paymentCandidate: nil) {
            case .openInSafari: Presenter.openInSafari(url)
            case .openExternally: Presenter.openExternally(url)
            default: Presenter.showToast(Strings.blockedNavigation)
            }
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        Presenter.alert(title: nil, message: message, completion: completionHandler)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        Presenter.confirm(title: nil, message: message, completion: completionHandler)
    }
}
