import SwiftUI

/// "No connection" / "the site did not load", with a retry button that really
/// reloads (WebViewModel.retry). Uses Dynamic Type, so it follows the size of
/// text chosen in iOS Settings, and scrolls when that size is very large.
struct ErrorView: View {
    let kind: WebViewModel.LoadError
    let retry: () -> Void

    private var title: String {
        kind == .offline ? Strings.offlineTitle : Strings.loadErrorTitle
    }

    private var message: String {
        kind == .offline ? Strings.offlineMessage : Strings.loadErrorMessage
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image("LaunchLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 200)
                    .accessibilityHidden(true)

                Image(systemName: kind == .offline ? "wifi.slash" : "exclamationmark.triangle")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(Color("AccentColor"))
                    .accessibilityHidden(true)

                Text(title)
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("errorTitle")

                Text(message)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button(action: retry) {
                    Text(Strings.retry)
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color("AccentColor"))
                .accessibilityIdentifier("retryButton")
            }
            .padding(32)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("BrandCream").ignoresSafeArea())
    }
}
