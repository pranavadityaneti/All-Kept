import ExpoModulesCore

public class ShareSaveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ShareSave")

    Function("setCredential") { (json: String) throws in
      let credential = try JSONDecoder().decode(SharedStore.Credential.self, from: Data(json.utf8))
      try SharedStore.setCredential(credential)
    }
    Function("clearCredential") { SharedStore.clearCredential() }
    Function("hasCredential") { () -> Bool in SharedStore.credential() != nil }
    Function("peekQueue") { () -> String in
      let data = (try? JSONEncoder().encode(SharedStore.queue())) ?? Data("[]".utf8)
      return String(decoding: data, as: UTF8.self)
    }
    Function("dropQueued") { (requestId: String) in SharedStore.drop(requestId: requestId) }
  }
}
