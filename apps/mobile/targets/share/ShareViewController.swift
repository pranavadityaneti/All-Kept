import UIKit
import UniformTypeIdentifiers
import UserNotifications

/// Saves the shared link to Allkept and gets out of the way. The link is queued in the app group,
/// handed to a background URL session (iOS finishes the upload after this extension is gone, and
/// waits for a connection if there is none), and the request completes at once — iOS shows and
/// dismisses its sheet in the same breath. The app's next foreground re-delivers anything the
/// system did not; the server dedupes by request id.
///
/// Feedback is a notification banner with the app icon ("Saved to Allkept · Sorting it now"), when
/// notifications are allowed. Only two outcomes need a person's attention regardless, and those
/// show a small card for a second: no signed-in account on this phone, or not a link.
final class ShareViewController: UIViewController {
  private var card: SaveCard?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    readSharedText { [weak self] text in self?.handle(text) }
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

  private func handle(_ shared: String?) {
    guard let text = shared?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return tell("That wasn't a link") }
    guard let credential = SharedStore.credential() else { return tell("Open Allkept to sign in") }
    let requestId = UUID().uuidString
    SharedStore.enqueue(text: text, requestId: requestId)
    BackgroundUpload.start(text: text, requestId: requestId, credential: credential)
    Banner.post(title: "Saved to Allkept", body: "Sorting it now") { [weak self] in self?.complete() }
  }

  /// A small card for the cases that need a person, held for a second.
  private func tell(_ message: String) {
    let card = SaveCard()
    self.card = card
    view.addSubview(card)
    NSLayoutConstraint.activate([
      card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      card.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
      card.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 16),
      card.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -16),
    ])
    card.show(title: message)
    card.alpha = 0
    card.transform = CGAffineTransform(translationX: 0, y: 12)
    UIView.animate(withDuration: 0.18, delay: 0, options: [.curveEaseOut]) { card.alpha = 1; card.transform = .identity }
    UIAccessibility.post(notification: .announcement, argument: message)
    view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(complete)))
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) { [weak self] in self?.complete() }
  }

  private var completing = false
  @objc private func complete() {
    guard !completing else { return }
    completing = true
    guard let card else { return extensionContext?.completeRequest(returningItems: nil, completionHandler: nil) ?? () }
    UIView.animate(withDuration: 0.2, animations: { card.alpha = 0 }) { _ in
      self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
  }
}

/// A local notification posted on the app's behalf: the banner with the app icon that stands in
/// for a toast. Only when notifications are allowed; the caller continues either way, and never
/// before the notification has been handed to the system.
enum Banner {
  static func post(title: String, body: String?, then done: @escaping () -> Void) {
    let center = UNUserNotificationCenter.current()
    var finished = false
    let once = { DispatchQueue.main.async { if !finished { finished = true; done() } } }
    // Never hold the share sheet hostage to the notification system.
    DispatchQueue.global().asyncAfter(deadline: .now() + 1.5) { once() }
    center.getNotificationSettings { settings in
      guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return once() }
      let content = UNMutableNotificationContent()
      content.title = title
      if let body { content.body = body }
      content.threadIdentifier = "share-save"
      content.interruptionLevel = .active
      center.add(UNNotificationRequest(identifier: "share-save-\(UUID().uuidString)", content: content, trigger: nil)) { _ in once() }
    }
  }
}

/// The upload that outlives the extension. Background sessions need a file body and a shared
/// container; the body files are swept after a day.
enum BackgroundUpload {
  static func start(text: String, requestId: String, credential: SharedStore.Credential) {
    guard let url = URL(string: credential.endpoint),
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedStore.appGroup) else { return }
    let uploads = container.appendingPathComponent("uploads", isDirectory: true)
    try? FileManager.default.createDirectory(at: uploads, withIntermediateDirectories: true)
    sweep(uploads)
    let bodyURL = uploads.appendingPathComponent("\(requestId).json")
    guard let body = try? JSONSerialization.data(withJSONObject: ["text": text, "requestId": requestId]),
          (try? body.write(to: bodyURL, options: .atomic)) != nil else { return }
    let config = URLSessionConfiguration.background(withIdentifier: "app.allkept.share-save.\(requestId)")
    config.sharedContainerIdentifier = SharedStore.appGroup
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = false
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(credential.apikey, forHTTPHeaderField: "apikey")
    request.setValue(credential.token, forHTTPHeaderField: "X-Share-Token")
    URLSession(configuration: config).uploadTask(with: request, fromFile: bodyURL).resume()
  }

  private static func sweep(_ dir: URL) {
    let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
    let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
    for file in files {
      let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? Date()
      if modified < cutoff { try? FileManager.default.removeItem(at: file) }
    }
  }
}

/// The card: the app icon and one line. Follows the system appearance and Dynamic Type.
final class SaveCard: UIView {
  private let title = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)
    translatesAutoresizingMaskIntoConstraints = false
    layer.cornerRadius = 18
    layer.cornerCurve = .continuous
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOpacity = 0.28
    layer.shadowRadius = 14
    layer.shadowOffset = CGSize(width: 0, height: 8)
    backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(white: 0.07, alpha: 0.94) : UIColor(white: 1, alpha: 0.96) }

    // The app icon, bundled into the extension by expo-target.config.js (images.icon); a glyph if it is ever missing.
    let mark = UIImageView(image: UIImage(named: "icon") ?? UIImage(systemName: "bookmark.fill"))
    mark.tintColor = .white
    mark.contentMode = .scaleAspectFill
    mark.layer.cornerRadius = 7
    mark.layer.cornerCurve = .continuous
    mark.layer.masksToBounds = true
    mark.translatesAutoresizingMaskIntoConstraints = false

    title.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: .systemFont(ofSize: 15, weight: .semibold))
    title.adjustsFontForContentSizeCategory = true
    title.textColor = UIColor { $0.userInterfaceStyle == .dark ? .white : UIColor(red: 0.08, green: 0.09, blue: 0.11, alpha: 1) }
    title.numberOfLines = 2

    let row = UIStackView(arrangedSubviews: [mark, title])
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 10
    row.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)
    NSLayoutConstraint.activate([
      mark.widthAnchor.constraint(equalToConstant: 28),
      mark.heightAnchor.constraint(equalToConstant: 28),
      row.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
      row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
      row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
    ])
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  func show(title text: String) { title.text = text }
}
