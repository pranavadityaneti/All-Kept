import UIKit
import UniformTypeIdentifiers

/// Saves the shared link to Allkept and says so, without opening the app. Online this is well under a
/// second; offline the link waits in the app group and the app delivers it when it next opens.
final class ShareViewController: UIViewController {
  private let banner = PaddedLabel()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor.black.withAlphaComponent(0.001) // keeps the sheet's own dimming
    banner.text = "Saving…"
    banner.textColor = .white
    banner.font = .systemFont(ofSize: 16, weight: .semibold)
    banner.textAlignment = .center
    banner.numberOfLines = 2
    banner.backgroundColor = UIColor(red: 0.08, green: 0.08, blue: 0.11, alpha: 0.94)
    banner.layer.cornerRadius = 16
    banner.layer.masksToBounds = true
    banner.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(banner)
    NSLayoutConstraint.activate([
      banner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      banner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      banner.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48),
    ])
    readSharedText { [weak self] text in self?.save(text) }
  }

  /// The first URL item wins; failing that, the first text item. Anything else is not a link.
  private func readSharedText(_ done: @escaping (String?) -> Void) {
    let attachments = (extensionContext?.inputItems as? [NSExtensionItem])?.flatMap { $0.attachments ?? [] } ?? []
    if let urlItem = attachments.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
      urlItem.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
        DispatchQueue.main.async { done((item as? URL)?.absoluteString ?? (item as? String)) }
      }
      return
    }
    if let textItem = attachments.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
      textItem.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
        DispatchQueue.main.async { done(item as? String) }
      }
      return
    }
    done(nil)
  }

  private func save(_ shared: String?) {
    guard let text = shared?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return finish("That wasn't a link") }
    guard let credential = SharedStore.credential(), let url = URL(string: credential.endpoint) else { return finish("Open Allkept to sign in") }
    let requestId = UUID().uuidString
    var request = URLRequest(url: url, timeoutInterval: 8)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(credential.apikey, forHTTPHeaderField: "apikey")
    request.setValue(credential.token, forHTTPHeaderField: "X-Share-Token")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["text": text, "requestId": requestId])
    URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      DispatchQueue.main.async {
        switch (error == nil, status) {
        case (true, 200...299): self?.finish("Saved to Allkept ✓")
        case (true, 400): self?.finish("That wasn't a link")
        case (true, 401), (true, 403): self?.finish("Open Allkept to sign in")
        case (true, 429): self?.finish("Too many saves at once. Try again soon.")
        default:
          SharedStore.enqueue(text: text, requestId: requestId)
          self?.finish("Saved to Allkept. Syncs when you're online")
        }
      }
    }.resume()
  }

  private func finish(_ message: String) {
    banner.text = message
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
      self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
  }
}

/// A label with room around its text.
final class PaddedLabel: UILabel {
  private let inset = UIEdgeInsets(top: 14, left: 20, bottom: 14, right: 20)
  override func drawText(in rect: CGRect) { super.drawText(in: rect.inset(by: inset)) }
  override var intrinsicContentSize: CGSize {
    let size = super.intrinsicContentSize
    return CGSize(width: size.width + inset.left + inset.right, height: size.height + inset.top + inset.bottom)
  }
}
