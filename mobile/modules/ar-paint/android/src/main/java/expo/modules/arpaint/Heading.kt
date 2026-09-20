package expo.modules.arpaint

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.LocationManager
import android.os.SystemClock
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.sqrt

/**
 * ARCore's world frame is gravity-aligned but its yaw is arbitrary, whereas the iPhone runs ARKit
 * with `.gravityAndHeading` (−Z = true north, +X = east). Stored transforms and viewer positions
 * live in that north-aligned frame, so Android has to produce the same frame to share paint with
 * the iPhone app and the web client.
 *
 * This pairs the compass heading of the back camera (rotation-vector sensor + magnetic
 * declination) with the camera's yaw in ARCore's world, and averages the difference over the
 * first couple of seconds of tracking. The offset is then locked for the session, so every
 * transform written in it stays mutually consistent. Accuracy is compass-class (a few degrees).
 *
 *   north = rotY(−offset) · arcore      (offset = compass heading − ARCore yaw)
 */
class HeadingEstimator(private val context: Context) : SensorEventListener {
  private val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val rot = FloatArray(9)
  private var registered = false

  @Volatile private var compassRad = Float.NaN
  @Volatile private var compassAtMs = 0L
  @Volatile private var declinationRad = 0f
  private var declinationKnown = false

  // circular mean of (compass − arcore) samples
  private var sumSin = 0.0
  private var sumCos = 0.0
  private var samples = 0
  private var firstFrameAtMs = 0L

  /** True once the offset is fixed for this session. */
  @Volatile var locked = false; private set
  /** Radians; provisional until [locked]. */
  @Volatile var offsetRad = 0f; private set
  /** False when the phone has no usable compass (frames then stay in ARCore's own yaw). */
  var available = true; private set

  fun start() {
    if (registered) return
    val s = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
      ?: sensors.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
    if (s == null) { available = false; return }
    sensors.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME)
    registered = true
    if (!declinationKnown) updateDeclination()
  }

  fun stop() {
    if (!registered) return
    sensors.unregisterListener(this)
    registered = false
  }

  /** Magnetic → true north, from the last known location (already granted to the app). */
  private fun updateDeclination() {
    try {
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val loc = lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time } ?: return
      val field = GeomagneticField(loc.latitude.toFloat(), loc.longitude.toFloat(), loc.altitude.toFloat(), System.currentTimeMillis())
      declinationRad = Math.toRadians(field.declination.toDouble()).toFloat()
      declinationKnown = true
    } catch (_: SecurityException) {
    } catch (_: Exception) {
    }
  }

  override fun onSensorChanged(e: SensorEvent) {
    SensorManager.getRotationMatrixFromVector(rot, e.values)
    // back camera looks along device −Z; world axes are (east, north, up)
    val east = -rot[2]
    val north = -rot[5]
    if (hypot(east, north) < 0.35f) { compassRad = Float.NaN; return } // pointing at the sky/floor: heading undefined
    // values[4] (when present) is the estimated heading accuracy in radians; skip badly calibrated readings
    if (e.values.size > 4 && e.values[4] > 0.6f) { compassRad = Float.NaN; return }
    compassRad = atan2(east, north) + declinationRad
    compassAtMs = SystemClock.elapsedRealtime()
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  /** Feed the camera's forward direction in ARCore world space, once per tracked frame. */
  fun addFrame(forward: V3) {
    if (locked) return
    val now = SystemClock.elapsedRealtime()
    if (firstFrameAtMs == 0L) firstFrameAtMs = now
    val elapsed = now - firstFrameAtMs
    if (!available) { if (elapsed > 1000) locked = true; return }

    val c = compassRad
    val fresh = !c.isNaN() && now - compassAtMs < 150
    val horiz = hypot(forward.x, forward.z)
    if (fresh && horiz > 0.35f) {
      val arYaw = atan2(forward.x, -forward.z) // clockwise from ARCore's −Z, seen from above
      val d = (c - arYaw).toDouble()
      sumSin += kotlin.math.sin(d); sumCos += kotlin.math.cos(d); samples++
      offsetRad = atan2(sumSin, sumCos).toFloat()
    }
    // Lock once there is a consistent estimate; give up waiting for consistency after 6 s.
    val resultant = if (samples > 0) sqrt(sumSin * sumSin + sumCos * sumCos) / samples else 0.0
    if ((samples >= 45 && elapsed >= 1500 && resultant > 0.9) || (samples >= 20 && elapsed >= 6000)) locked = true
    if (samples == 0 && elapsed > 8000) { available = false; locked = true } // no compass readings at all
  }

  /** ARCore world → north-aligned frame. */
  fun toNorth(): M4 = M.rotY(-offsetRad)
  /** North-aligned frame → ARCore world. */
  fun fromNorth(): M4 = M.rotY(offsetRad)
  /** East in ARCore world coordinates (used to orient floor quads like the iPhone does). */
  fun east(): V3 = M.col(fromNorth(), 0)

  fun reset() {
    sumSin = 0.0; sumCos = 0.0; samples = 0; firstFrameAtMs = 0L
    locked = false; offsetRad = 0f
  }
}
