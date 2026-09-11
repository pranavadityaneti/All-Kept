package app.allkept.sharesave

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareSaveModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "React context is not ready" }

  override fun definition() = ModuleDefinition {
    Name("ShareSave")
    Function("setCredential") { json: String -> SharedStore.setCredential(context, json); ShareShortcut.publish(context) }
    Function("clearCredential") { SharedStore.clearCredential(context); ShareShortcut.remove(context) }
    Function("hasCredential") { SharedStore.credential(context) != null }
    Function("peekQueue") { SharedStore.queueJson(context) }
    Function("dropQueued") { requestId: String -> SharedStore.drop(context, requestId) }
  }
}
