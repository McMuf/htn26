package expo.modules.arpaint

import android.opengl.Matrix
import com.google.ar.core.Pose
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Column-major 4×4, the same layout as ARKit's simd_float4x4, OpenGL and the persisted `transform`. */
typealias M4 = FloatArray

data class V3(val x: Float, val y: Float, val z: Float) {
  operator fun plus(o: V3) = V3(x + o.x, y + o.y, z + o.z)
  operator fun minus(o: V3) = V3(x - o.x, y - o.y, z - o.z)
  operator fun times(s: Float) = V3(x * s, y * s, z * s)
  operator fun unaryMinus() = V3(-x, -y, -z)
  infix fun dot(o: V3) = x * o.x + y * o.y + z * o.z
  infix fun cross(o: V3) = V3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
  val length: Float get() = sqrt(this dot this)
  fun normalized(): V3 { val l = length; return if (l < 1e-6f) this else this * (1f / l) }
  fun distance(o: V3) = (this - o).length
  fun toList(): List<Double> = listOf(x.toDouble(), y.toDouble(), z.toDouble())

  companion object {
    val ZERO = V3(0f, 0f, 0f)
    val UP = V3(0f, 1f, 0f)
  }
}

object M {
  fun identity(): M4 = FloatArray(16).also { Matrix.setIdentityM(it, 0) }
  fun col(m: M4, c: Int) = V3(m[c * 4], m[c * 4 + 1], m[c * 4 + 2])
  fun pos(m: M4) = col(m, 3)

  fun fromAxes(x: V3, y: V3, z: V3, p: V3): M4 = floatArrayOf(
    x.x, x.y, x.z, 0f,
    y.x, y.y, y.z, 0f,
    z.x, z.y, z.z, 0f,
    p.x, p.y, p.z, 1f,
  )

  fun mul(a: M4, b: M4): M4 = FloatArray(16).also { Matrix.multiplyMM(it, 0, a, 0, b, 0) }
  fun invert(m: M4): M4 = FloatArray(16).also { if (!Matrix.invertM(it, 0, m, 0)) Matrix.setIdentityM(it, 0) }

  fun transformPoint(m: M4, p: V3) = V3(
    m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  )

  fun withPos(m: M4, p: V3): M4 = m.copyOf().also { it[12] = p.x; it[13] = p.y; it[14] = p.z }

  /** Right-handed rotation about +Y (counter-clockwise seen from above). */
  fun rotY(rad: Float): M4 {
    val c = cos(rad); val s = sin(rad)
    return floatArrayOf(c, 0f, -s, 0f, 0f, 1f, 0f, 0f, s, 0f, c, 0f, 0f, 0f, 0f, 1f)
  }

  fun fromPose(p: Pose): M4 = FloatArray(16).also { p.toMatrix(it, 0) }

  /** Rigid matrix → ARCore Pose (rotation part assumed orthonormal). */
  fun toPose(m: M4): Pose {
    val m00 = m[0]; val m10 = m[1]; val m20 = m[2]
    val m01 = m[4]; val m11 = m[5]; val m21 = m[6]
    val m02 = m[8]; val m12 = m[9]; val m22 = m[10]
    val trace = m00 + m11 + m22
    var qx: Float; var qy: Float; var qz: Float; var qw: Float
    if (trace > 0f) {
      val s = sqrt(trace + 1f) * 2f
      qw = 0.25f * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s
    } else if (m00 > m11 && m00 > m22) {
      val s = sqrt(1f + m00 - m11 - m22) * 2f
      qw = (m21 - m12) / s; qx = 0.25f * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s
    } else if (m11 > m22) {
      val s = sqrt(1f + m11 - m00 - m22) * 2f
      qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25f * s; qz = (m12 + m21) / s
    } else {
      val s = sqrt(1f + m22 - m00 - m11) * 2f
      qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25f * s
    }
    val l = sqrt(qx * qx + qy * qy + qz * qz + qw * qw).takeIf { it > 1e-6f } ?: 1f
    return Pose(floatArrayOf(m[12], m[13], m[14]), floatArrayOf(qx / l, qy / l, qz / l, qw / l))
  }

  fun flatten(m: M4): List<Double> = m.map { it.toDouble() }

  fun unflatten(a: Any?): M4? {
    val list = a as? List<*> ?: return null
    if (list.size != 16) return null
    return FloatArray(16) { i -> (list[i] as? Number)?.toFloat() ?: return null }
  }

  fun isVertical(m: M4) = abs(m[5]) < 0.5f
}
