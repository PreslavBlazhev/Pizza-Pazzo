import Foundation

/// Remembers a card payment in progress across an app restart.
///
/// If iOS terminates the app while the customer is on the bank's page, the
/// bank page cannot be restored — but the payment still settles on the server
/// from the bank's callback. So the next launch opens the site's "checking your
/// payment" screen for that order instead of the home page (as on Android).
///
/// Holds only the order's payment token and the site origin — no card data,
/// no personal data.
struct PaymentSessionStore {

    private let defaults: UserDefaults
    private let key = "pp.paymentSession"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func save(_ session: PaymentFlow.Session) {
        if let data = try? JSONEncoder().encode(session) {
            defaults.set(data, forKey: key)
        }
    }

    func load() -> PaymentFlow.Session? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(PaymentFlow.Session.self, from: data)
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}
