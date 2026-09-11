package app.allkept.sharesave

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** Delivers queued saves once the network is back, without Allkept being opened. */
class ShareWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val app = applicationContext
    val credential = SharedStore.credential(app) ?: return Result.success()
    var retry = false
    for (item in SharedStore.queue(app)) {
      when (SaveClient.save(credential, item.text, item.requestId)) {
        SaveClient.Outcome.RETRY_LATER -> retry = true
        else -> SharedStore.drop(app, item.requestId)
      }
    }
    return if (retry) Result.retry() else Result.success()
  }

  companion object {
    private const val NAME = "app.allkept.share-save.flush"
    fun schedule(context: Context) {
      val request = OneTimeWorkRequestBuilder<ShareWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, request)
    }
  }
}
