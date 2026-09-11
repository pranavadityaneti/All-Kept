package app.allkept.sharesave

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** One POST to save-link. The outcome says what to tell the person and whether to keep the item queued. */
object SaveClient {
  enum class Outcome { SAVED, NOT_A_LINK, SIGNED_OUT, RATE_LIMITED, RETRY_LATER }

  fun save(credential: SharedStore.Credential, text: String, requestId: String, timeoutMs: Int = 8000): Outcome = try {
    val conn = (URL(credential.endpoint).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = timeoutMs
      readTimeout = timeoutMs
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("apikey", credential.apikey)
      setRequestProperty("X-Share-Token", credential.token)
    }
    conn.outputStream.use { it.write(JSONObject().put("text", text).put("requestId", requestId).toString().toByteArray()) }
    val code = conn.responseCode
    conn.disconnect()
    when (code) {
      in 200..299 -> Outcome.SAVED
      400 -> Outcome.NOT_A_LINK
      401, 403 -> Outcome.SIGNED_OUT
      429 -> Outcome.RATE_LIMITED
      else -> Outcome.RETRY_LATER
    }
  } catch (_: Exception) { Outcome.RETRY_LATER }
}
