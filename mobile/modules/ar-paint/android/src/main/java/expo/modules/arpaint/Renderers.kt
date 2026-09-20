package expo.modules.arpaint

import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.Matrix
import android.util.Log
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Small GLES 2 renderers for the AR view: camera background, plane grids, paint quads, reticle.
 * No depth buffer use: like the iPhone's SceneKit materials, nothing writes depth, and layers
 * draw in a fixed order (planes → paint → reticle).
 */
internal object Gl {
  private const val TAG = "ArPaint"

  fun floats(n: Int): FloatBuffer =
    ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

  fun floats(values: FloatArray): FloatBuffer = floats(values.size).apply { put(values); position(0) }

  fun program(vs: String, fs: String): Int {
    val v = shader(GLES20.GL_VERTEX_SHADER, vs)
    val f = shader(GLES20.GL_FRAGMENT_SHADER, fs)
    val p = GLES20.glCreateProgram()
    GLES20.glAttachShader(p, v)
    GLES20.glAttachShader(p, f)
    GLES20.glLinkProgram(p)
    val ok = IntArray(1)
    GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0)
    if (ok[0] == 0) Log.e(TAG, "link failed: " + GLES20.glGetProgramInfoLog(p))
    return p
  }

  private fun shader(type: Int, src: String): Int {
    val s = GLES20.glCreateShader(type)
    GLES20.glShaderSource(s, src)
    GLES20.glCompileShader(s)
    val ok = IntArray(1)
    GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
    if (ok[0] == 0) Log.e(TAG, "compile failed: " + GLES20.glGetShaderInfoLog(s))
    return s
  }
}

/** The camera image, full screen, via ARCore's external OES texture. */
internal class CameraBackground {
  var textureId = 0; private set
  private var program = 0
  private var aPos = 0
  private var aTex = 0
  private var uTex = 0
  private val ndc = Gl.floats(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f))
  private val uv = Gl.floats(8)

  fun create() {
    val ids = IntArray(1)
    GLES20.glGenTextures(1, ids, 0)
    textureId = ids[0]
    val target = GLES11Ext.GL_TEXTURE_EXTERNAL_OES
    GLES20.glBindTexture(target, textureId)
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    program = Gl.program(
      """
      attribute vec4 a_Pos;
      attribute vec2 a_Tex;
      varying vec2 v_Tex;
      void main() { gl_Position = a_Pos; v_Tex = a_Tex; }
      """.trimIndent(),
      """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 v_Tex;
      uniform samplerExternalOES u_Tex;
      void main() { gl_FragColor = texture2D(u_Tex, v_Tex); }
      """.trimIndent(),
    )
    aPos = GLES20.glGetAttribLocation(program, "a_Pos")
    aTex = GLES20.glGetAttribLocation(program, "a_Tex")
    uTex = GLES20.glGetUniformLocation(program, "u_Tex")
  }

  fun draw(frame: Frame) {
    if (frame.hasDisplayGeometryChanged()) {
      ndc.position(0); uv.position(0)
      frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, ndc, Coordinates2d.TEXTURE_NORMALIZED, uv)
    }
    if (frame.timestamp == 0L) return // camera hasn't produced an image yet
    ndc.position(0); uv.position(0)
    GLES20.glDisable(GLES20.GL_DEPTH_TEST)
    GLES20.glDepthMask(false)
    GLES20.glDisable(GLES20.GL_BLEND)
    GLES20.glUseProgram(program)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glUniform1i(uTex, 0)
    GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, ndc)
    GLES20.glVertexAttribPointer(aTex, 2, GLES20.GL_FLOAT, false, 0, uv)
    GLES20.glEnableVertexAttribArray(aPos)
    GLES20.glEnableVertexAttribArray(aTex)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(aPos)
    GLES20.glDisableVertexAttribArray(aTex)
  }
}

/** Detected planes as a 25 cm grid in metres (cyan = wall, lime = floor), like the iPhone's grid texture. */
internal class PlaneRenderer {
  private var program = 0
  private var aXZ = 0
  private var uMvp = 0
  private var uColor = 0
  private var buf = Gl.floats(256)
  private val mvp = FloatArray(16)

  fun create() {
    program = Gl.program(
      """
      attribute vec2 a_XZ;
      uniform mat4 u_Mvp;
      varying vec2 v_XZ;
      void main() { v_XZ = a_XZ; gl_Position = u_Mvp * vec4(a_XZ.x, 0.0, a_XZ.y, 1.0); }
      """.trimIndent(),
      """
      precision highp float;
      varying vec2 v_XZ;
      uniform vec4 u_Color; // rgb tint, a = opacity
      float lines(vec2 p, float step, float w) {
        vec2 g = abs(fract(p / step + 0.5) - 0.5) * step;
        vec2 l = 1.0 - smoothstep(vec2(w * 0.5), vec2(w * 0.5 + 0.003), g);
        return max(l.x, l.y);
      }
      void main() {
        float a = max(lines(v_XZ, 0.25, 0.005), lines(v_XZ, 1.0, 0.012)) * 0.9 * u_Color.a;
        gl_FragColor = vec4(u_Color.rgb * a, a);
      }
      """.trimIndent(),
    )
    aXZ = GLES20.glGetAttribLocation(program, "a_XZ")
    uMvp = GLES20.glGetUniformLocation(program, "u_Mvp")
    uColor = GLES20.glGetUniformLocation(program, "u_Color")
  }

  fun begin() {
    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    GLES20.glUseProgram(program)
  }

  /** [polygon] is the plane's convex boundary as (x, z) pairs in its center-pose frame. */
  fun draw(viewProj: FloatArray, model: M4, polygon: FloatBuffer, vertical: Boolean, opacity: Float) {
    val n = polygon.remaining() / 2
    if (n < 3) return
    if (buf.capacity() < n * 2) buf = Gl.floats(n * 4)
    buf.clear(); buf.put(polygon); buf.flip()
    Matrix.multiplyMM(mvp, 0, viewProj, 0, model, 0)
    GLES20.glUniformMatrix4fv(uMvp, 1, false, mvp, 0)
    if (vertical) GLES20.glUniform4f(uColor, 0.1f, 0.9f, 1f, opacity) else GLES20.glUniform4f(uColor, 0.49f, 1f, 0.23f, opacity)
    GLES20.glVertexAttribPointer(aXZ, 2, GLES20.GL_FLOAT, false, 0, buf)
    GLES20.glEnableVertexAttribArray(aXZ)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, n)
    GLES20.glDisableVertexAttribArray(aXZ)
  }
}

/** Paint quads (5 m, textured from their bitmap) and the reticle ring, both lying in their frame's XZ plane. */
internal class QuadRenderer {
  private var paintProgram = 0
  private var reticleProgram = 0
  private var pPos = 0; private var pTex = 0; private var pMvp = 0; private var pSampler = 0
  private var rPos = 0; private var rMvp = 0; private var rColor = 0
  private val mvp = FloatArray(16)

  private val h = PaintQuad.SIZE_M / 2
  // lifted 4 mm off the surface (as on iPhone) to avoid fighting with plane visuals; texture row 0 = −Z ("up")
  private val quadPos = Gl.floats(floatArrayOf(-h, 0.004f, -h, h, 0.004f, -h, -h, 0.004f, h, h, 0.004f, h))
  private val quadTex = Gl.floats(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 1f, 1f))
  private val ret = 0.05f
  private val reticlePos = Gl.floats(floatArrayOf(-ret, 0f, -ret, ret, 0f, -ret, -ret, 0f, ret, ret, 0f, ret))

  fun create() {
    paintProgram = Gl.program(
      """
      attribute vec3 a_Pos;
      attribute vec2 a_Tex;
      uniform mat4 u_Mvp;
      varying vec2 v_Tex;
      void main() { v_Tex = a_Tex; gl_Position = u_Mvp * vec4(a_Pos, 1.0); }
      """.trimIndent(),
      """
      precision mediump float;
      varying vec2 v_Tex;
      uniform sampler2D u_Tex;
      void main() { gl_FragColor = texture2D(u_Tex, v_Tex); } // bitmap is premultiplied
      """.trimIndent(),
    )
    pPos = GLES20.glGetAttribLocation(paintProgram, "a_Pos")
    pTex = GLES20.glGetAttribLocation(paintProgram, "a_Tex")
    pMvp = GLES20.glGetUniformLocation(paintProgram, "u_Mvp")
    pSampler = GLES20.glGetUniformLocation(paintProgram, "u_Tex")

    reticleProgram = Gl.program(
      """
      attribute vec3 a_Pos;
      uniform mat4 u_Mvp;
      varying vec2 v_L;
      void main() { v_L = a_Pos.xz; gl_Position = u_Mvp * vec4(a_Pos, 1.0); }
      """.trimIndent(),
      """
      precision highp float;
      varying vec2 v_L;
      uniform vec4 u_Color;
      // Square brackets, edge ticks and a square pip — the same crosshair the compass-mode HUD
      // draws in React views, so the two modes look like one app. No circle, and only a sliver of
      // softening at each edge: enough to stop the diagonals crawling as the phone moves, far less
      // than it takes to read as anti-aliased. Everything is in half-extents, so it is identical at
      // every distance once the quad is scaled.
      float bar(vec2 q, vec2 lo, vec2 hi, float e) {
        vec2 a = smoothstep(lo - e, lo + e, q);
        vec2 b = 1.0 - smoothstep(hi - e, hi + e, q);
        return a.x * a.y * b.x * b.y;
      }
      void main() {
        vec2 q = abs(v_L) / 0.05;   // ret, so q is 0..1 inside the reticle
        float e = 0.02;
        float T = 0.12;             // stroke thickness
        float L = 0.42;             // bracket arm length, in from each corner
        // four corners, both arms, by symmetry on |x|,|y|
        float m = max(bar(q, vec2(1.0 - L, 1.0 - T), vec2(1.0, 1.0), e),
                      bar(q, vec2(1.0 - T, 1.0 - L), vec2(1.0, 1.0), e));
        // ticks at the middle of each edge
        m = max(m, bar(q, vec2(0.0, 0.72), vec2(T * 0.75, 1.0), e));
        m = max(m, bar(q, vec2(0.72, 0.0), vec2(1.0, T * 0.75), e));
        // centre pip, always white so the exact aim point reads against any wall
        float pip = bar(q, vec2(0.0), vec2(0.1), e);
        float a = max(m * u_Color.a, pip);
        gl_FragColor = vec4(mix(u_Color.rgb, vec3(1.0), pip) * a, a);
      }
      """.trimIndent(),
    )
    rPos = GLES20.glGetAttribLocation(reticleProgram, "a_Pos")
    rMvp = GLES20.glGetUniformLocation(reticleProgram, "u_Mvp")
    rColor = GLES20.glGetUniformLocation(reticleProgram, "u_Color")
  }

  fun beginPaint() {
    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    GLES20.glDisable(GLES20.GL_CULL_FACE)
    GLES20.glUseProgram(paintProgram)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glUniform1i(pSampler, 0)
  }

  fun drawPaint(viewProj: FloatArray, quad: PaintQuad) {
    if (quad.texture == 0) return
    Matrix.multiplyMM(mvp, 0, viewProj, 0, quad.transform, 0)
    GLES20.glUniformMatrix4fv(pMvp, 1, false, mvp, 0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, quad.texture)
    quadPos.position(0); quadTex.position(0)
    GLES20.glVertexAttribPointer(pPos, 3, GLES20.GL_FLOAT, false, 0, quadPos)
    GLES20.glVertexAttribPointer(pTex, 2, GLES20.GL_FLOAT, false, 0, quadTex)
    GLES20.glEnableVertexAttribArray(pPos)
    GLES20.glEnableVertexAttribArray(pTex)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(pPos)
    GLES20.glDisableVertexAttribArray(pTex)
  }

  /** [model] already includes the lift along the normal and the distance scale. */
  fun drawReticle(viewProj: FloatArray, model: M4, locked: Boolean) {
    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    GLES20.glUseProgram(reticleProgram)
    Matrix.multiplyMM(mvp, 0, viewProj, 0, model, 0)
    GLES20.glUniformMatrix4fv(rMvp, 1, false, mvp, 0)
    // white when it has a surface, the UI's purple when it is only guessing — the palette the rest
    // of the app uses, rather than the amber that belonged to no theme
    if (locked) GLES20.glUniform4f(rColor, 1f, 1f, 1f, 0.92f) else GLES20.glUniform4f(rColor, 0.67f, 0.55f, 1f, 0.92f)
    reticlePos.position(0)
    GLES20.glVertexAttribPointer(rPos, 3, GLES20.GL_FLOAT, false, 0, reticlePos)
    GLES20.glEnableVertexAttribArray(rPos)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(rPos)
  }
}
