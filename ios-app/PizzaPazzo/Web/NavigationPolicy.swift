import Foundation

/// Where one navigation may go — the pure decision behind
/// `WKNavigationDelegate.decidePolicyFor`, kept free of WebKit so it can be
/// unit-tested. Mirrors `shouldOverrideUrlLoading` in the Android app's
/// `SiteWebViewClient.kt`.
struct NavigationPolicy {

    enum Decision: Equatable {
        /// Load it here (a Pizza Pazzo page, a payment in progress, page content).
        case allow
        /// Load it here AND start the payment session `PaymentFlow` describes.
        case startPayment(PaymentFlow.Session)
        /// An off-site web page: show it in an in-app Safari sheet, which has
        /// its own cookies and never sees the Pizza Pazzo session.
        case openInSafari
        /// Hand it to iOS: Phone (`tel:`), Mail (`mailto:`), a bank's app.
        case openExternally
        /// Refuse it.
        case block
    }

    struct Request {
        let url: String
        /// False for iframes. The main frame is what the user calls "the page".
        let isMainFrame: Bool
        /// The user tapped a link (WKNavigationType.linkActivated).
        let isUserInitiated: Bool
    }

    let origins: AllowedOrigins

    /// - Parameters:
    ///   - activePayment: the payment session in progress, if any.
    ///   - paymentCandidate: the session the current page would start (the
    ///     customer is on the review screen with a "pay" button).
    func decide(
        _ request: Request,
        activePayment: PaymentFlow.Session?,
        paymentCandidate: PaymentFlow.Session?
    ) -> Decision {
        let url = request.url
        let parts = UrlParts.parse(url)

        // Our own site loads here, always.
        if origins.isAllowed(parts) { return .allow }

        // Blank documents WebKit creates for frames carry no content of their own.
        if url == "about:blank" || url == "about:srcdoc" { return .allow }

        // ── Card payment: the bank page and 3-D Secure must load HERE, or the
        //    customer never finds their way back.
        if activePayment == nil, request.isMainFrame, let candidate = paymentCandidate,
           PaymentFlow.decideDuringPayment(url) == .allow {
            return .startPayment(candidate)
        }
        if activePayment != nil {
            switch PaymentFlow.decideDuringPayment(url) {
            case .allow:
                return .allow
            case .handOff:
                return (request.isMainFrame || request.isUserInitiated) ? .openExternally : .block
            case .block:
                return .block
            }
        }

        guard let parts else { return .block }

        // Page content in an iframe — the click-to-load Google map on the
        // contacts page. It is content, not navigation: it cannot reach the
        // app's native side (the print bridge accepts the main frame only), so
        // HTTPS iframes load as they would in Safari. Nothing else does.
        if !request.isMainFrame && !request.isUserInitiated {
            return parts.scheme == "https" ? .allow : .block
        }

        // A real navigation off the site: hand it to the right place.
        if parts.scheme == "https" || parts.scheme == "http" {
            return parts.host.isEmpty ? .block : .openInSafari
        }
        if AllowedOrigins.systemHandOffSchemes.contains(parts.scheme) {
            return .openExternally
        }
        return .block
    }
}
