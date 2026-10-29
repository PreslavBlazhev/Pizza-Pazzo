import SwiftUI
import WebKit

/// The one screen: the site, a thin progress line while a page loads, the
/// logo until the first page is ready, and the offline/error screen.
///
/// The web view stays inside the safe area — under the notch and above the
/// home indicator there is only the site's cream colour — so no native bar
/// ever covers a button or a form field of the site.
struct ContentView: View {
    @ObservedObject var model: WebViewModel

    var body: some View {
        ZStack(alignment: .top) {
            Color("BrandCream").ignoresSafeArea()

            WebViewContainer(webView: model.webView)
                // WebKit moves the focused field above the keyboard itself;
                // letting SwiftUI shrink the view as well makes the page jump.
                .ignoresSafeArea(.keyboard)

            if model.isLoading && model.hasLoadedOnce && model.loadError == nil {
                ProgressView(value: model.progress)
                    .progressViewStyle(.linear)
                    .tint(Color("AccentColor"))
                    .accessibilityHidden(true)
            }

            if !model.hasLoadedOnce && model.loadError == nil {
                LaunchOverlay()
            }

            if let error = model.loadError {
                ErrorView(kind: error, retry: model.retry)
            }
        }
    }
}

/// Continues the launch screen (same logo, same colour) until the first page
/// has rendered, so the start is one smooth picture instead of a blank flash.
private struct LaunchOverlay: View {
    var body: some View {
        VStack(spacing: 24) {
            Image("LaunchLogo")
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 240)
                .accessibilityLabel("Pizza Pazzo")
            ProgressView()
                .accessibilityLabel(Strings.loading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("BrandCream").ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("launchOverlay")
    }
}

struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
