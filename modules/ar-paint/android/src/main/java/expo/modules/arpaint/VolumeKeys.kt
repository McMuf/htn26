package expo.modules.arpaint

import android.app.Activity
import android.view.KeyEvent
import android.view.Window

/**
 * The volume rocker as two spray triggers, the Android way. iOS has no button API, so the iPhone
 * infers presses from volume changes; Android delivers real key events, so while enabled this
 * swallows VOL+ / VOL− (no volume change, no system volume panel) and reports exact press and
 * release — no 0.4 s release lag.
 *
 * Main thread only.
 */
class VolumeKeys(private val emit: (key: String, down: Boolean) -> Unit) {
  private var enabled = false
  private val held = mutableSetOf<Int>()

  fun setEnabled(activity: Activity?, on: Boolean) {
    enabled = on
    if (!on) releaseAll()
    val window = activity?.window ?: return
    val current = window.callback ?: return
    if (on && current !is Interceptor) window.callback = Interceptor(current)
  }

  /** App backgrounded mid-press: we will never see the key-up. */
  fun releaseAll() {
    for (code in held.toList()) emit(name(code), false)
    held.clear()
  }

  private fun name(code: Int) = if (code == KeyEvent.KEYCODE_VOLUME_UP) "up" else "down"

  private inner class Interceptor(private val base: Window.Callback) : Window.Callback by base {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      val code = event.keyCode
      if (!enabled || (code != KeyEvent.KEYCODE_VOLUME_UP && code != KeyEvent.KEYCODE_VOLUME_DOWN)) {
        return base.dispatchKeyEvent(event)
      }
      when (event.action) {
        KeyEvent.ACTION_DOWN -> if (event.repeatCount == 0 && held.add(code)) emit(name(code), true)
        KeyEvent.ACTION_UP -> if (held.remove(code)) emit(name(code), false)
      }
      return true
    }
  }
}
