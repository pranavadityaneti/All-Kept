import Foundation
import Security

/// Everything the app and its share extension have in common: one credential in the keychain and
/// one queue file, both reachable through the app group so either process can use them.
/// KEEP IDENTICAL to targets/share/SharedStore.swift — scripts/check-shared-store.sh compares them.
enum SharedStore {
  static let appGroup = "group.app.allkept.mobile"
  static let service = "app.allkept.share-save"
  static let account = "credential"
  static let queueFile = "share-queue.json"

  struct Credential: Codable { let token: String; let endpoint: String; let apikey: String }
  struct Queued: Codable { let text: String; let requestId: String; let at: Double }

  private static var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: account,
     kSecAttrAccessGroup as String: appGroup]
  }

  static func setCredential(_ credential: Credential) throws {
    let data = try JSONEncoder().encode(credential)
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { throw NSError(domain: "ShareSave", code: Int(status)) }
  }

  static func credential() -> Credential? {
    var read = query
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    guard SecItemCopyMatching(read as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return try? JSONDecoder().decode(Credential.self, from: data)
  }

  static func clearCredential() { SecItemDelete(query as CFDictionary) }

  private static var queueURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent(queueFile)
  }
  private static let lock = NSLock()

  static func queue() -> [Queued] {
    guard let url = queueURL, let data = try? Data(contentsOf: url) else { return [] }
    return (try? JSONDecoder().decode([Queued].self, from: data)) ?? []
  }

  static func enqueue(text: String, requestId: String) {
    lock.lock(); defer { lock.unlock() }
    write(queue() + [Queued(text: text, requestId: requestId, at: Date().timeIntervalSince1970 * 1000)])
  }

  static func drop(requestId: String) {
    lock.lock(); defer { lock.unlock() }
    write(queue().filter { $0.requestId != requestId })
  }

  private static func write(_ items: [Queued]) {
    guard let url = queueURL, let data = try? JSONEncoder().encode(items) else { return }
    try? data.write(to: url, options: .atomic)
  }
}
