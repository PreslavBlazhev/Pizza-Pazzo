import SafariServices
import UIKit

/// UIKit presentation from anywhere: alerts, the in-app Safari sheet, and the
/// system handlers for `tel:` / `mailto:`. Everything is presented on top of
/// whatever is showing, so it also works from inside a popup sheet.
@MainActor
enum Presenter {

    static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes
            .first { $0.activationState == .foregroundActive }?
            .windows.first { $0.isKeyWindow }
            ?? scenes.first?.windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }

    /// An off-site page in an in-app Safari view: its own cookie jar, its own
    /// address bar, and a "Done" button back to Pizza Pazzo.
    static func openInSafari(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else { return }
        let safari = SFSafariViewController(url: url)
        safari.dismissButtonStyle = .done
        safari.preferredControlTintColor = UIColor(named: "AccentColor")
        topViewController()?.present(safari, animated: true)
    }

    /// Phone, Mail, Messages or a bank's app.
    static func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:]) { opened in
            if !opened { showToast(Strings.cannotOpenExternal) }
        }
    }

    static func alert(title: String?, message: String?, completion: @escaping () -> Void) {
        guard let top = topViewController() else { completion(); return }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: Strings.ok, style: .default) { _ in completion() })
        top.present(alert, animated: true)
    }

    static func confirm(title: String?, message: String?, completion: @escaping (Bool) -> Void) {
        guard let top = topViewController() else { completion(false); return }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: Strings.cancel, style: .cancel) { _ in completion(false) })
        alert.addAction(UIAlertAction(title: Strings.ok, style: .default) { _ in completion(true) })
        top.present(alert, animated: true)
    }

    static func prompt(
        title: String?,
        message: String?,
        defaultText: String?,
        completion: @escaping (String?) -> Void
    ) {
        guard let top = topViewController() else { completion(nil); return }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: Strings.cancel, style: .cancel) { _ in completion(nil) })
        alert.addAction(UIAlertAction(title: Strings.ok, style: .default) { [weak alert] _ in
            completion(alert?.textFields?.first?.text)
        })
        top.present(alert, animated: true)
    }

    /// The staging copy of the site is behind HTTP Basic auth. The password is
    /// asked for and kept for this session only — never stored by the app.
    static func askForSitePassword(host: String, completion: @escaping (URLCredential?) -> Void) {
        guard let top = topViewController() else { completion(nil); return }
        let alert = UIAlertController(title: Strings.authTitle, message: host, preferredStyle: .alert)
        alert.addTextField {
            $0.placeholder = Strings.authUser
            $0.autocapitalizationType = .none
            $0.autocorrectionType = .no
        }
        alert.addTextField {
            $0.placeholder = Strings.authPassword
            $0.isSecureTextEntry = true
        }
        alert.addAction(UIAlertAction(title: Strings.cancel, style: .cancel) { _ in completion(nil) })
        alert.addAction(UIAlertAction(title: Strings.authLogin, style: .default) { [weak alert] _ in
            let user = alert?.textFields?[0].text ?? ""
            let password = alert?.textFields?[1].text ?? ""
            completion(URLCredential(user: user, password: password, persistence: .forSession))
        })
        top.present(alert, animated: true)
    }

    /// A short message that fades by itself (Android's Toast).
    static func showToast(_ text: String) {
        guard let window = topViewController()?.view.window else { return }
        let label = PaddedLabel()
        label.text = text
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = .preferredFont(forTextStyle: .footnote)
        label.adjustsFontForContentSizeCategory = true
        label.textColor = .white
        label.backgroundColor = UIColor.black.withAlphaComponent(0.8)
        label.layer.cornerRadius = 12
        label.clipsToBounds = true
        label.alpha = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        label.accessibilityIdentifier = "toast"
        window.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: window.centerXAnchor),
            label.bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            label.widthAnchor.constraint(lessThanOrEqualTo: window.widthAnchor, constant: -48),
        ])
        UIView.animate(withDuration: 0.2) { label.alpha = 1 }
        UIView.animate(withDuration: 0.3, delay: 2.5, options: []) { label.alpha = 0 } completion: { _ in
            label.removeFromSuperview()
        }
    }
}

private final class PaddedLabel: UILabel {
    private let insets = UIEdgeInsets(top: 10, left: 16, bottom: 10, right: 16)

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: insets))
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + insets.left + insets.right, height: size.height + insets.top + insets.bottom)
    }

    override func textRect(forBounds bounds: CGRect, limitedToNumberOfLines numberOfLines: Int) -> CGRect {
        let inner = super.textRect(forBounds: bounds.inset(by: insets), limitedToNumberOfLines: numberOfLines)
        return inner.inset(by: UIEdgeInsets(top: -insets.top, left: -insets.left, bottom: -insets.bottom, right: -insets.right))
    }
}
