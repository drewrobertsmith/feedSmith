package expo.modules.predictiveback

import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android's predictive back, passed to JS (FEE-114). React Native's own back callback only hears a back
 * once it's committed, so a screen can't follow the finger. While JS turns this on, one callback, added
 * after React Native's and so heard first, sends the gesture's start, progress, cancel and commit as one
 * `onBack` event, and React Native hears no back at all: JS finishes the move and goes back itself. A back
 * button or a three-button bar sends only a commit.
 */
class PredictiveBackModule : Module() {
  private var callback: OnBackPressedCallback? = null

  private fun send(type: String, event: BackEventCompat? = null) {
    sendEvent(
      "onBack",
      mapOf(
        "type" to type,
        "progress" to (event?.progress ?: 0f).toDouble(),
        "edge" to if (event?.swipeEdge == BackEventCompat.EDGE_RIGHT) "right" else "left",
      ),
    )
  }

  /** The callback, added to the current activity the first time it's needed. */
  private fun callbackFor(activity: ComponentActivity): OnBackPressedCallback =
    callback ?: object : OnBackPressedCallback(false) {
      override fun handleOnBackStarted(backEvent: BackEventCompat) = send("started", backEvent)

      override fun handleOnBackProgressed(backEvent: BackEventCompat) = send("progress", backEvent)

      override fun handleOnBackCancelled() = send("cancelled")

      override fun handleOnBackPressed() = send("invoked")
    }.also {
      // Tied to the activity's lifecycle, so it's removed when the activity is destroyed.
      activity.onBackPressedDispatcher.addCallback(activity, it)
      callback = it
    }

  override fun definition() = ModuleDefinition {
    Name("PredictiveBack")

    Events("onBack")

    /** Turns the callback on while a screen follows the gesture, and off again so back is React Native's. */
    AsyncFunction("setEnabled") { enabled: Boolean ->
      val activity = appContext.currentActivity as? ComponentActivity ?: return@AsyncFunction
      callbackFor(activity).isEnabled = enabled
    }.runOnQueue(Queues.MAIN)

    OnActivityDestroys {
      callback?.remove()
      callback = null
    }
  }
}
