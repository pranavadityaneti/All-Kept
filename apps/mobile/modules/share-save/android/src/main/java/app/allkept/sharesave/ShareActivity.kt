package app.allkept.sharesave

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import java.util.UUID

/**
 * Saves what was shared and gets out of the way. Stays invisible for as long as the request takes
 * (well under a second online, up to eight seconds on a bad connection), then a toast, then gone.
 * Never launches Allkept.
 */
class ShareActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val app = applicationContext
    val text = if (intent?.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT)?.trim() else null
    if (text.isNullOrEmpty()) return done("That wasn't a link")
    val credential = SharedStore.credential(app) ?: return done("Open Allkept to sign in")
    val requestId = UUID.randomUUID().toString()
    SharedStore.enqueue(app, text, requestId) // durable first; dropped once the server has it
    Thread {
      val outcome = SaveClient.save(credential, text, requestId)
      val message = when (outcome) {
        SaveClient.Outcome.SAVED -> "Saved to Allkept ✓"
        SaveClient.Outcome.NOT_A_LINK -> "That wasn't a link"
        SaveClient.Outcome.SIGNED_OUT -> "Open Allkept to sign in"
        SaveClient.Outcome.RATE_LIMITED -> "Too many saves at once. Try again soon."
        SaveClient.Outcome.RETRY_LATER -> "Saved to Allkept. Syncs when you're online"
      }
      if (outcome == SaveClient.Outcome.RETRY_LATER) ShareWorker.schedule(app) else SharedStore.drop(app, requestId)
      Handler(Looper.getMainLooper()).post { done(message) }
    }.start()
  }

  private fun done(message: String) {
    Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
    finish()
  }
}
