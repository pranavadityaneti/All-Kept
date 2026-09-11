package app.allkept.sharesave

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * "Save to Allkept" in the share sheet's direct-share row — the top row, with the app's icon — as a
 * Sharing Shortcut that points at ShareActivity (declared in res/xml/shortcuts.xml). Published once
 * sharing can work (a credential exists) and again on every classic share, removed at sign-out.
 */
object ShareShortcut {
  private const val ID = "save-to-allkept"
  private const val CATEGORY = "app.allkept.sharesave.SHARE_TARGET"

  fun publish(context: Context) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(Intent.ACTION_MAIN)
    val shortcut = ShortcutInfoCompat.Builder(context, ID)
      .setShortLabel("Save to Allkept")
      .setLongLabel("Save to Allkept")
      .setIcon(IconCompat.createWithResource(context, context.applicationInfo.icon))
      .setIntent(launch)
      .setCategories(setOf(CATEGORY))
      .setLongLived(true)
      .setRank(0)
      .build()
    try { ShortcutManagerCompat.pushDynamicShortcut(context, shortcut) } catch (_: Exception) { /* a launcher without shortcut support */ }
  }

  fun remove(context: Context) {
    try { ShortcutManagerCompat.removeDynamicShortcuts(context, listOf(ID)) } catch (_: Exception) { /* nothing to remove */ }
  }
}
