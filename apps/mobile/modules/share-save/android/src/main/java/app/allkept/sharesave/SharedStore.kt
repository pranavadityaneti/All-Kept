package app.allkept.sharesave

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The credential and the offline queue, in the app's private storage. The share activity runs
 * inside the app's own sandbox, so nothing needs to cross a process boundary.
 */
object SharedStore {
  private const val PREFS = "app.allkept.share-save"
  private const val KEY = "credential"
  private const val QUEUE = "share-queue.json"
  private val lock = Any()

  data class Credential(val token: String, val endpoint: String, val apikey: String)
  data class Queued(val text: String, val requestId: String, val at: Long)

  fun setCredential(context: Context, json: String) {
    parse(json) ?: throw IllegalArgumentException("credential must carry token, endpoint and apikey")
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }
  fun credential(context: Context): Credential? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let { parse(it) }
  fun clearCredential(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }
  private fun parse(json: String): Credential? = try {
    val o = JSONObject(json)
    Credential(o.getString("token"), o.getString("endpoint"), o.getString("apikey"))
  } catch (_: Exception) { null }

  fun queue(context: Context): List<Queued> = synchronized(lock) { read(context) }
  fun queueJson(context: Context): String = synchronized(lock) { toJson(read(context)).toString() }
  fun enqueue(context: Context, text: String, requestId: String) = synchronized(lock) {
    write(context, read(context) + Queued(text, requestId, System.currentTimeMillis()))
  }
  fun drop(context: Context, requestId: String) = synchronized(lock) {
    write(context, read(context).filter { it.requestId != requestId })
  }

  private fun file(context: Context) = File(context.filesDir, QUEUE)
  private fun read(context: Context): List<Queued> {
    val f = file(context)
    if (!f.exists()) return emptyList()
    return try {
      val arr = JSONArray(f.readText())
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        Queued(o.getString("text"), o.getString("requestId"), o.optLong("at"))
      }
    } catch (_: Exception) { emptyList() }
  }
  private fun write(context: Context, items: List<Queued>) { file(context).writeText(toJson(items).toString()) }
  private fun toJson(items: List<Queued>) = JSONArray().apply {
    items.forEach { put(JSONObject().put("text", it.text).put("requestId", it.requestId).put("at", it.at)) }
  }
}
