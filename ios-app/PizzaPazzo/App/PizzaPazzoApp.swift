import SwiftUI

@main
struct PizzaPazzoApp: App {
    @StateObject private var model: WebViewModel

    init() {
        let config: AppConfig
        do {
            config = try AppConfig.fromInfoPlist()
        } catch {
            // A wrong PP_START_URL / PP_SITE_HOSTS is a build mistake: stop at
            // once rather than open something that is not the site.
            fatalError("Pizza Pazzo: invalid site configuration in Config/App.xcconfig: \(error)")
        }
        _model = StateObject(wrappedValue: WebViewModel(config: config))
    }

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
                // The site has no dark theme; keep alerts and the status bar
                // readable on its cream background.
                .preferredColorScheme(.light)
                .onAppear {
                    // Only now, with the window on screen, is the web view
                    // created and the site loaded (see WebViewModel.webView).
                    guard !Self.isRunningUnitTests else { return }
                    model.startIfNeeded(debugStartPath: UserDefaults.standard.string(forKey: "PPStartPath"))
                }
        }
    }

    /// Unit tests run inside the app; they must not load the live site.
    private static var isRunningUnitTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
}
