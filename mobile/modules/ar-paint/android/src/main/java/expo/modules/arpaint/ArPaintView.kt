package expo.modules.arpaint

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Surface
import android.view.View
import com.google.ar.core.Anchor
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Camera
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.ResolveCloudAnchorFuture
import com.google.ar.core.Session
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * ARCore twin of ArPaintView.swift — same props, events and functions, so the JS screen is shared.
 *
 * DETECTION: horizontal + vertical plane finding, plus ARCore's Depth API (depth-from-motion on
 * phones without a depth sensor, e.g. Galaxy S25), which lets planes form on walls too blank to
 * give up feature points. The reticle hit-tests detected plane polygons first, then a plane's
 * extension — and nothing else. The overhang scales with the plane, so a wall stays paintable past
 * the patch ARCore has found while a chair seat stays chair-sized. Only floors and walls count;
 * ceilings, and the depth/feature points ARCore also offers, are rejected. See [raycastCenter].
 *
 * ANCHORING: every quad rides an ARCore anchor (attached to its plane when it has one), is snapped
 * onto a real plane when one appears (< 15 cm, < 14°) and re-snapped as ARCore refines it.
 *
 * MOVED SURFACES: ARCore assumes nothing in the world moves, so paint on a chair that gets pushed
 * away is left hanging in the air. [verifySurfaces] samples the depth map where each piece on a
 * furniture-sized plane sits, and hides the ones the camera can now see straight through. Hidden,
 * not deleted: bring the chair back and the paint comes back on it.
 *
 * FRAME: ARCore's yaw is arbitrary; [HeadingEstimator] recovers the north-aligned frame the iPhone
 * uses, and everything crossing to JS (stroke transforms, viewer positions) is expressed in it.
 *
 * PERSISTENCE: ARCore has no exportable world map. saveWorldMap hosts each quad as a Cloud Anchor
 * (needs an ARCore API key) and writes their ids to a small JSON "map"; loading resolves them, and
 * the first one to resolve aligns every other quad. Without a key, JS falls back to the
 * placed-from-memory path, exactly as the iPhone does when relocalisation fails.
 */
class ArPaintView(context: Context, appContext: AppContext) : ExpoView(context, appContext), GLSurfaceView.Renderer {
  private companion object {
    const val TAG = "ArPaint"
    const val HOST_TTL_DAYS = 1 // the maximum with API-key auth
    const val SAVE_TIMEOUT_MS = 30_000L

    // ---- surface verification (see verifySurfaces) ----
    /** Anything whose smaller side is under this can be picked up and carried off: a chair, a box,
     *  a laptop. A wall or a floor cannot, and is never subjected to the check. */
    const val FURNITURE_MAX_M = 2f
    const val VERIFY_INTERVAL_MS = 200L
    /** Measured depth must be this far behind the paint before it counts as seeing through it. */
    const val DEPTH_CLEAR_MARGIN_M = 0.25f
    /** Consecutive contradicting samples needed to hide a piece: ~1.2 s at 5 Hz. */
    const val MISS_TO_HIDE = 6f
    /** Depth-from-motion is only trustworthy in this band. */
    const val DEPTH_NEAR_M = 0.4f
    const val DEPTH_FAR_M = 4f
    val CROSS_X = intArrayOf(0, -1, 1, 0, 0)
    val CROSS_Y = intArrayOf(0, 0, 0, -1, 1)
  }

  private val onTracking by EventDispatcher()
  private val onHit by EventDispatcher()
  private val onStrokeEnd by EventDispatcher()
  private val onSurface by EventDispatcher()

  override val shouldUseAndroidLayout = true

  private val main = Handler(Looper.getMainLooper())
  private val glView = GLSurfaceView(context)
  private val heading = HeadingEstimator(context)

  // ---- props (written on the main thread) ------------------------------------------------
  @Volatile var radius = 0.05f
  @Volatile var flow = 1f
  @Volatile var showPlanes = true
  @Volatile private var colorInt = Color.rgb(255, 46, 148)
  @Volatile private var colorHex = "#ff2e94"

  // ---- session lifecycle (main thread) ---------------------------------------------------
  @Volatile private var session: Session? = null
  @Volatile private var running = false
  private var installRequested = false
  private var activityResumed = true
  private var destroyed = false
  private var retryPosted = false
  @Volatile private var cloudEnabled = false
  @Volatile private var depthEnabled = false
  @Volatile private var displayRotation = Surface.ROTATION_0

  // ---- work queued for the GL thread -----------------------------------------------------
  /** Returns true when done; false to retry next frame. Stale ops (from before a reset) are dropped. */
  private class Op(val gen: Int, val needsTracking: Boolean, val block: () -> Boolean, val onDropped: (() -> Unit)? = null)
  private val ops = ConcurrentLinkedQueue<Op>()
  private val pendingSaves = ConcurrentLinkedQueue<Promise>() // settled even if the view goes away first
  private val generation = AtomicInteger(0)
  private var activeGeneration = 0

  // ---- GL thread state -------------------------------------------------------------------
  private val background = CameraBackground()
  private val planeRenderer = PlaneRenderer()
  private val quadRenderer = QuadRenderer()
  private var viewportW = 0
  private var viewportH = 0
  private var displayChanged = true
  private var cameraTextureSet = false
  private val viewM = FloatArray(16)
  private val projM = FloatArray(16)
  private val viewProj = FloatArray(16)

  private val quads = LinkedHashMap<String, PaintQuad>()
  private val planes = LinkedHashMap<Plane, Long>() // plane → first seen (fade-in)
  private var aimedPlane: Plane? = null
  private var cameraPos = V3.ZERO
  private var tracking = false
  private var lastHitEvent = 0L
  private var lastTrackingEvent = 0L
  private var lastTrackingKey = ""

  private enum class HitKind(val js: String) { PLANE("plane"), EXTENDED("extended"), MESH("mesh"), ESTIMATED("estimated") }
  private class Hit(val transform: M4, val plane: Plane?, val kind: HitKind, val vertical: Boolean)

  // current stroke
  private class StrokeRec(val id: String, val quadId: String, val points: MutableList<List<Double>>, val rng: SplitMix, val color: String, val viewer: List<Double>)
  private var spraying = false
  private var stroke: StrokeRec? = null
  /** Strokes you painted this session, newest last - what undo walks back through. */
  private val myStrokes = mutableListOf<Pair<String, String>>() // quad id, stroke id
  private var lastTick = 0L
  @Volatile private var snapshotJob: SnapshotJob? = null // set from JS, consumed on the GL thread

  private class SnapshotJob(val path: String, val promise: Promise)

  // loaded Cloud-Anchor map
  private enum class MapState { NONE, RESOLVING, RESOLVED, FAILED }
  private var mapState = MapState.NONE
  private var mapAlignment: M4? = null // saving session's north frame → this session's ARCore world
  private var pendingResolves = 0
  private val resolveFutures = mutableListOf<ResolveCloudAnchorFuture>()

  // ---- setup -----------------------------------------------------------------------------

  init {
    glView.preserveEGLContextOnPause = true
    glView.setEGLContextClientVersion(2)
    glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
    glView.setRenderer(this)
    glView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    addView(glView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private val lifecycle = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityResumed(a: Activity) { if (a === appContext.currentActivity) { activityResumed = true; updateRunning() } }
    override fun onActivityPaused(a: Activity) { if (a === appContext.currentActivity) { activityResumed = false; updateRunning() } }
    override fun onActivityCreated(a: Activity, b: Bundle?) {}
    override fun onActivityStarted(a: Activity) {}
    override fun onActivityStopped(a: Activity) {}
    override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
    override fun onActivityDestroyed(a: Activity) {}
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    appContext.currentActivity?.application?.registerActivityLifecycleCallbacks(lifecycle)
    updateRunning()
  }

  override fun onDetachedFromWindow() {
    appContext.currentActivity?.application?.unregisterActivityLifecycleCallbacks(lifecycle)
    // isAttachedToWindow / windowVisibility are still stale here, so stop outright rather than re-deriving
    stop()
    super.onDetachedFromWindow()
  }

  // React Native sizes this view but never measures native children: fill it with the GL surface.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    glView.measure(MeasureSpec.makeMeasureSpec(r - l, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(b - t, MeasureSpec.EXACTLY))
    glView.layout(0, 0, r - l, b - t)
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility != View.VISIBLE) stop() else updateRunning()
  }

  override fun onVisibilityChanged(changedView: View, visibility: Int) {
    super.onVisibilityChanged(changedView, visibility)
    if (visibility != View.VISIBLE) stop() else updateRunning()
  }
  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    displayRotation = display?.rotation ?: Surface.ROTATION_0
    displayChanged = true
    updateRunning()
  }

  /**
   * Leaving the Create tab (hidden / zero size / detached) or backgrounding the app pauses the
   * session; coming back RESUMES the same session, so every anchor keeps its place.
   */
  private fun updateRunning() {
    if (destroyed) return
    val want = isAttachedToWindow && windowVisibility == View.VISIBLE && isShown && width > 0 && height > 0 && activityResumed
    if (want) start() else stop()
  }

  private fun start() {
    if (running) return
    val activity = appContext.currentActivity ?: return retryLater()
    if (context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      emitTracking(mapOf("state" to "notAvailable", "reason" to "cameraPermission"))
      return retryLater()
    }
    if (session == null) {
      try {
        if (ArCoreApk.getInstance().requestInstall(activity, !installRequested) == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
          installRequested = true // Play Services for AR is installing; we resume via onActivityResumed
          return
        }
        session = Session(activity).also { configure(it) }
      } catch (e: UnavailableUserDeclinedInstallationException) {
        emitTracking(mapOf("state" to "notAvailable", "reason" to "arcoreDeclined"))
        return
      } catch (e: Exception) {
        Log.w(TAG, "ARCore session failed", e)
        emitTracking(mapOf("state" to "notAvailable", "reason" to (e.javaClass.simpleName ?: "error")))
        return
      }
    }
    try {
      session!!.resume()
    } catch (e: CameraNotAvailableException) {
      emitTracking(mapOf("state" to "notAvailable", "reason" to "cameraUnavailable"))
      return retryLater()
    } catch (e: Exception) {
      Log.w(TAG, "resume failed", e)
      return retryLater()
    }
    glView.onResume()
    heading.start()
    running = true
  }

  private fun stop() {
    if (!running) return
    running = false
    glView.queueEvent { if (spraying) { spraying = false; flushStroke() } }
    glView.onPause()
    session?.pause()
    heading.stop()
  }

  private fun retryLater() {
    if (retryPosted || destroyed) return
    retryPosted = true
    main.postDelayed({ retryPosted = false; updateRunning() }, 1000)
  }

  private fun configure(s: Session) {
    val cfg = Config(s)
    cfg.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
    cfg.focusMode = Config.FocusMode.AUTO
    cfg.lightEstimationMode = Config.LightEstimationMode.DISABLED
    cfg.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
    cfg.instantPlacementMode = Config.InstantPlacementMode.DISABLED
    // Depth-from-motion (or a ToF sensor where present) makes untextured walls hit-testable.
    depthEnabled = s.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
    cfg.depthMode = if (depthEnabled) Config.DepthMode.AUTOMATIC else Config.DepthMode.DISABLED
    cloudEnabled = ArSupport.hasCloudAnchorKey(context)
    cfg.cloudAnchorMode = if (cloudEnabled) Config.CloudAnchorMode.ENABLED else Config.CloudAnchorMode.DISABLED
    s.configure(cfg)
  }

  fun destroy() {
    destroyed = true
    main.removeCallbacksAndMessages(null)
    ops.clear()
    while (true) failSave(pendingSaves.poll() ?: break, "AR view closed before the map was saved")
    // Free textures and detach anchors on the GL thread *before* the session closes under them.
    // If the GL thread is already gone the latch times out and Session.close() frees them anyway.
    val released = CountDownLatch(1)
    glView.queueEvent {
      try { for (q in quads.values) q.release(); quads.clear() } finally { released.countDown() }
    }
    try { released.await(500, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) {}
    stop()
    session?.close()
    session = null
  }

  private fun failSave(promise: Promise?, message: String) {
    if (promise == null) return
    pendingSaves.remove(promise)
    promise.reject("E_WORLDMAP", message, null)
  }

  // ---- props / functions from JS ----------------------------------------------------------

  fun setSpraying(value: Boolean) {
    glView.queueEvent {
      if (value == spraying) return@queueEvent
      spraying = value
      if (value) beginStroke() else flushStroke()
    }
  }

  fun setPaintColor(hex: String) {
    val clean = hex.trim().removePrefix("#")
    val parsed = colorOrNull(clean)
    colorInt = parsed ?: Color.rgb(255, 0, 255)
    colorHex = "#" + (if (parsed != null) clean.lowercase() else "ff00ff")
  }

  private fun colorOrNull(hex: String): Int? = hex.takeIf { it.length == 6 }?.toLongOrNull(16)
    ?.let { Color.rgb(((it shr 16) and 0xff).toInt(), ((it shr 8) and 0xff).toInt(), (it and 0xff).toInt()) }

  private fun colorOf(hex: String): Int = colorOrNull(hex.trim().removePrefix("#")) ?: Color.rgb(255, 0, 255)

  private fun enqueue(needsTracking: Boolean = true, gen: Int = generation.get(), onDropped: (() -> Unit)? = null, block: () -> Boolean) {
    ops.add(Op(gen, needsTracking, block, onDropped))
  }

  fun clearAll() {
    enqueue(needsTracking = false) { for (q in quads.values) q.release(); quads.clear(); stroke = null; true }
  }

  /** A fresh start for placed-from-memory: drop all paint and any loaded map. Keeps ARCore's planes and the heading lock. */
  fun resetSession() {
    val g = generation.incrementAndGet()
    enqueue(needsTracking = false, gen = g) { resetState(); activeGeneration = g; true }
  }

  private fun resetState() {
    stroke = null
    myStrokes.clear()
    for (f in resolveFutures) f.cancel()
    resolveFutures.clear()
    for (q in quads.values) q.release()
    quads.clear()
    mapState = MapState.NONE
    mapAlignment = null
    pendingResolves = 0
    aimedPlane = null
  }

  fun setWorldMapPath(path: String?) {
    if (path.isNullOrEmpty()) return
    Thread {
      val entries = WorldMapFile.read(path)
      if (entries == null) { emitTracking(mapOf("state" to "mapLoadFailed")); return@Thread }
      val g = generation.incrementAndGet()
      enqueue(needsTracking = true, gen = g) { loadMap(entries, g); activeGeneration = g; true }
    }.start()
  }

  fun saveWorldMap(path: String, promise: Promise) {
    if (session == null) return promise.reject("E_WORLDMAP", "AR session not running", null)
    if (!cloudEnabled) return promise.reject("E_WORLDMAP", "Cloud Anchors not configured (no ARCore API key)", null)
    val deadline = SystemClock.elapsedRealtime() + SAVE_TIMEOUT_MS
    var started = false
    pendingSaves.add(promise)
    enqueue(needsTracking = false, onDropped = { failSave(promise, "AR session reset before the map was saved") }) {
      val now = SystemClock.elapsedRealtime()
      if (!started) {
        if (!tracking && now < deadline) return@enqueue false
        started = true
        if (tracking) hostUnhostedQuads()
      }
      if (quads.values.any { it.hosting != null } && now < deadline) return@enqueue false
      pendingSaves.remove(promise)
      finishSave(path, promise)
      true
    }
  }

  /**
   * Takes back your most recent stroke in this session: its quad is repainted from the strokes that
   * remain, so other people's paint over the top survives. Resolves the stroke id for the app to
   * drop from the shared wall, or null when you have nothing left to undo here.
   */
  fun undoLast(promise: Promise) {
    enqueue(needsTracking = false, onDropped = { promise.resolve(null) }) {
      var result: Map<String, Any>? = null
      while (result == null && myStrokes.isNotEmpty()) {
        val (quadId, strokeId) = myStrokes.removeAt(myStrokes.size - 1)
        val q = quads[quadId] ?: continue
        if (!q.remove(strokeId)) continue
        q.upload(SystemClock.elapsedRealtime(), force = true)
        result = mapOf("id" to strokeId, "anchorId" to quadId)
      }
      promise.resolve(result)
      true
    }
  }

  /**
   * A photo of the wall as you're seeing it: the camera frame with the paint composited on top,
   * written to [path] as JPEG. The reticle and the surface grids are left out of that frame, so it
   * looks like a picture of the piece rather than a screenshot of the app.
   */
  fun snapshot(path: String, promise: Promise) {
    if (!running) return promise.reject("E_SNAPSHOT", "AR session not running", null)
    if (snapshotJob != null) return promise.reject("E_SNAPSHOT", "a photo is already being taken", null)
    snapshotJob = SnapshotJob(path, promise) // the next drawn frame takes it
  }

  /** Reads the frame just drawn (GL origin is bottom-left, so it comes back flipped) and writes a JPEG. */
  private fun takeSnapshot(job: SnapshotJob) {
    val w = viewportW
    val h = viewportH
    if (w <= 0 || h <= 0) return job.promise.reject("E_SNAPSHOT", "nothing drawn yet", null)
    val buf = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
    GLES20.glReadPixels(0, 0, w, h, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buf)
    buf.rewind()
    val raw = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    raw.copyPixelsFromBuffer(buf)
    val flip = android.graphics.Matrix().apply { postScale(1f, -1f, w / 2f, h / 2f) } // android.opengl.Matrix is the other one
    val image = Bitmap.createBitmap(raw, 0, 0, w, h, flip, true)
    raw.recycle()
    Thread {
      try {
        val file = File(job.path)
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { out ->
          image.compress(Bitmap.CompressFormat.JPEG, 85, out)
          out.flush()
        }
        val bytes = file.length().toInt()
        image.recycle()
        job.promise.resolve(mapOf("width" to w, "height" to h, "bytes" to bytes))
      } catch (e: Exception) {
        job.promise.reject("E_SNAPSHOT", e.message ?: "could not write the photo", e)
      }
    }.start()
  }

  /** Strokes from other phones / previous sessions: [{id, anchorId, transform:[16], color, points:[[u,v,r,a,kind]], viewer:[3]}]. */
  fun addRemoteStrokes(raw: List<Map<String, Any?>>, mode: String) {
    val strokes = raw.mapNotNull { parseStroke(it) }
    if (strokes.isEmpty()) return
    val enqueuedAt = SystemClock.elapsedRealtime()
    enqueue(needsTracking = true) {
      // relative placement is only meaningful in the north-aligned frame: give the compass a moment
      if (mode == "relative" && !heading.locked && SystemClock.elapsedRealtime() - enqueuedAt < 5000) return@enqueue false
      placeRemote(strokes, mode)
      true
    }
  }

  // ---- GLSurfaceView.Renderer --------------------------------------------------------------

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    background.create()
    planeRenderer.create()
    quadRenderer.create()
    cameraTextureSet = false
    for (q in quads.values) q.onContextLost()
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    GLES20.glViewport(0, 0, width, height)
    viewportW = width
    viewportH = height
    displayChanged = true
  }

  override fun onDrawFrame(gl: GL10?) {
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
    val s = session ?: return
    if (!running) return
    if (displayChanged && viewportW > 0) { s.setDisplayGeometry(displayRotation, viewportW, viewportH); displayChanged = false }
    if (!cameraTextureSet) { s.setCameraTextureName(background.textureId); cameraTextureSet = true }
    val frame = try { s.update() } catch (e: Exception) { return }
    background.draw(frame)

    val camera = frame.camera
    val now = SystemClock.elapsedRealtime()
    tracking = camera.trackingState == TrackingState.TRACKING
    cameraPos = M.pos(M.fromPose(camera.pose))
    drainOps()

    if (!tracking) {
      if (now - lastHitEvent > 100) { lastHitEvent = now; emitHit(mapOf("hit" to false, "distance" to 0.0, "kind" to "none", "locked" to false)) }
      emitTrackingIfDue(camera, now)
      return
    }

    camera.getViewMatrix(viewM, 0)
    camera.getProjectionMatrix(projM, 0, 0.05f, 100f)
    Matrix.multiplyMM(viewProj, 0, projM, 0, viewM, 0)
    heading.addFrame(-M.col(M.fromPose(camera.displayOrientedPose), 2))

    updatePlanes(frame, now)
    updateQuadPoses()
    verifySurfaces(frame, now)

    val hit = raycastCenter(frame)
    if (hit != null) {
      val locked = hit.kind != HitKind.ESTIMATED
      val dist = cameraPos.distance(M.pos(hit.transform))
      aimedPlane = hit.plane
      if (now - lastHitEvent > 100) {
        lastHitEvent = now
        emitHit(mapOf("hit" to true, "distance" to dist.toDouble(), "kind" to hit.kind.js, "vertical" to hit.vertical, "locked" to locked))
      }
      if (spraying && now - lastTick >= 33) { lastTick = now; paintAt(hit, now) }
    } else {
      aimedPlane = null
      if (now - lastHitEvent > 100) { lastHitEvent = now; emitHit(mapOf("hit" to false, "distance" to 0.0, "kind" to "none", "locked" to false)) }
    }

    for (q in quads.values) q.upload(now)
    val job = snapshotJob
    if (job != null) snapshotJob = null
    drawScene(hit, now, overlays = job == null)
    if (job != null) takeSnapshot(job)
    emitTrackingIfDue(camera, now)
  }

  private fun drainOps() {
    repeat(ops.size) {
      val op = ops.poll() ?: return
      if (op.gen < activeGeneration) { op.onDropped?.invoke(); return@repeat }
      if (op.needsTracking && !tracking) { ops.add(op); return@repeat }
      val done = try { op.block() } catch (e: Exception) { Log.w(TAG, "op failed", e); true }
      if (!done) ops.add(op)
    }
  }

  private fun drawScene(hit: Hit?, now: Long, overlays: Boolean = true) {
    if (showPlanes && overlays) {
      planeRenderer.begin()
      for ((p, seen) in planes) {
        if (p.trackingState != TrackingState.TRACKING || p.subsumedBy != null) continue
        // don't draw a grid on something the reticle refuses to paint — a ceiling reads as a target
        if (p.type == Plane.Type.HORIZONTAL_DOWNWARD_FACING) continue
        val fade = min(1f, (now - seen) / 350f)
        val opacity = (if (p == aimedPlane) 0.55f else 0.16f) * fade
        planeRenderer.draw(viewProj, M.fromPose(p.centerPose), p.polygon, p.type == Plane.Type.VERTICAL, opacity)
      }
    }
    quadRenderer.beginPaint()
    // q.missing: the surface this was painted on has been carried off, so the paint goes with it
    for (q in quads.values) if (q.placed && !q.missing) quadRenderer.drawPaint(viewProj, q)
    if (hit != null && overlays) {
      val t = hit.transform
      val n = M.col(t, 1).normalized()
      val scale = max(0.5f, min(3f, cameraPos.distance(M.pos(t)) / 0.8f))
      val m = M.withPos(t, M.pos(t) + n * 0.006f)
      for (i in 0..10) if (i % 4 != 3) m[i] *= scale
      quadRenderer.drawReticle(viewProj, m, hit.kind != HitKind.ESTIMATED)
    }
  }

  // ---- planes + anchors --------------------------------------------------------------------

  private fun planeNormal(p: Plane) = M.col(M.fromPose(p.centerPose), 1).normalized()
  private fun planeCenter(p: Plane) = M.pos(M.fromPose(p.centerPose))

  private fun updatePlanes(frame: Frame, now: Long) {
    for (p in frame.getUpdatedTrackables(Plane::class.java)) {
      if (p.subsumedBy != null || p.trackingState == TrackingState.STOPPED) {
        // merged into another plane: quads go back to "unbound" and re-adopt the survivor
        if (planes.remove(p) != null) {
          if (aimedPlane == p) aimedPlane = null
          for (q in quads.values) if (q.plane == p) { q.plane = null; attachLooseToNearbyPlane(q) }
        }
        continue
      }
      if (p.trackingState != TrackingState.TRACKING) continue
      val isNew = !planes.containsKey(p)
      if (isNew) planes[p] = now
      // ARCore refines a plane's depth/tilt for a while after it appears: keep our quads on it
      for (q in quads.values) {
        if (!q.placed) continue
        if (q.plane == p) { if (!isNew) snap(q, p, now) } else tryAdopt(q, p, now)
      }
    }
  }

  private fun updateQuadPoses() {
    for (q in quads.values) {
      val a = q.anchor ?: continue
      when (a.trackingState) {
        TrackingState.TRACKING -> {
          val m = M.fromPose(a.pose)
          q.transform = q.anchorOffset?.let { M.mul(m, it) } ?: m
        }
        TrackingState.STOPPED -> { q.anchor = null }
        else -> {}
      }
    }
  }

  /** (Re)anchor a quad at its current transform, on its plane when it has one. */
  private fun anchorQuad(q: PaintQuad) {
    val s = session ?: return
    val pose = M.toPose(q.transform)
    val old = q.anchor
    q.anchor = try {
      q.plane?.takeIf { it.trackingState == TrackingState.TRACKING }?.createAnchor(pose) ?: s.createAnchor(pose)
    } catch (e: Exception) {
      Log.w(TAG, "createAnchor failed", e); null
    }
    q.anchorOffset = null
    if (old != null && old !== q.hostAnchor) old.detach()
  }

  /**
   * A right-handed quad frame: Y = surface normal, X horizontal along the surface, −Z "up the wall"
   * (so drips run down) or north for floors. Built from the normal alone, so a quad keeps its
   * orientation when it snaps onto a plane (ARCore's in-plane plane axes are arbitrary).
   */
  private fun quadFrame(p: V3, normalIn: V3): M4 {
    var y = normalIn.normalized()
    var x: V3
    var z: V3
    if (abs(y.y) > 0.7f) { // floor / table: X = east
      if (y.y < 0) y = -y
      val east = heading.east()
      x = (east - y * (y dot east)).normalized()
      z = x cross y
    } else {
      x = (V3.UP cross y).normalized()
      z = x cross y // points down for a wall normal → −Z is up
      if (z.y > 0) { x = -x; z = -z }
    }
    return M.fromAxes(x, y, z, p)
  }

  /** Bind an estimated quad to a real plane and pull it onto that plane. */
  /** Small enough to be picked up and carried off. A wall or a floor is not. */
  private fun isFurniture(p: Plane?) = p != null && min(p.extentX, p.extentZ) <= FURNITURE_MAX_M

  private fun adopt(q: PaintQuad, plane: Plane, now: Long) {
    q.plane = plane
    q.loose = false
    q.onFurniture = isFurniture(plane)
    snap(q, plane, now, force = true)
  }

  /** Move a quad onto its plane (position projected along the normal, orientation from the plane's normal). Debounced. */
  private fun snap(q: PaintQuad, plane: Plane, now: Long, force: Boolean = false) {
    // ARCore grows a plane as it sees more of it, and a wall's first patch looks like a tabletop,
    // so the furniture verdict is re-taken every time rather than latched at first contact.
    q.onFurniture = isFurniture(plane)
    if (!force && now - q.lastSnap < 700) return
    val pn = planeNormal(plane)
    val pc = planeCenter(plane)
    val c = q.center
    val off = (c - pc) dot pn
    val angle = acos((pn dot q.normal).coerceIn(-1f, 1f))
    if (!force && abs(off) <= 0.012f && angle <= Math.toRadians(2.0).toFloat()) return
    q.lastSnap = now
    q.transform = quadFrame(c - pn * off, pn)
    anchorQuad(q)
  }

  /** Quads without a real plane (estimated hits, or placed from memory) adopt a close, parallel plane. Loose quads accept a wider gap. */
  private fun tryAdopt(q: PaintQuad, plane: Plane, now: Long): Boolean {
    if (q.plane != null || !q.placed) return false
    // a piece placed from memory must not get pulled onto a ceiling, the one plane we never paint
    if (plane.type == Plane.Type.HORIZONTAL_DOWNWARD_FACING) return false
    val pn = planeNormal(plane)
    if ((pn dot q.normal) <= (if (q.loose) 0.94f else 0.97f)) return false // ~20° / ~14°
    val pc = planeCenter(plane)
    if (abs((q.center - pc) dot pn) >= (if (q.loose) 0.6f else 0.15f)) return false
    // and the quad must overlap the plane's known extent (in-plane distance). The allowance scales
    // with the plane for the same reason the hit-test's does: a chair seat must not reach out and
    // adopt paint that was put on the floor beside it.
    val l = M.transformPoint(M.invert(M.fromPose(plane.centerPose)), q.center)
    val dx = max(0f, abs(l.x) - plane.extentX / 2)
    val dz = max(0f, abs(l.z) - plane.extentZ / 2)
    if (hypot(dx, dz) >= min(PaintQuad.SIZE_M / 2, max(0.3f, min(plane.extentX, plane.extentZ)))) return false
    adopt(q, plane, now)
    return true
  }

  private fun attachLooseToNearbyPlane(q: PaintQuad) {
    val now = SystemClock.elapsedRealtime()
    for (p in planes.keys) {
      if (p.trackingState != TrackingState.TRACKING || p.subsumedBy != null) continue
      if (tryAdopt(q, p, now)) return
    }
  }

  // ---- surface verification --------------------------------------------------------------

  private var lastVerify = 0L
  /** Pieces eligible for the check, and how many are currently hidden — reported to the debug HUD. */
  @Volatile private var watchedCount = 0
  @Volatile private var movedCount = 0
  private val viewIn = FloatArray(2)
  private val texOut = FloatArray(2)
  private val depthSamples = FloatArray(5)

  /**
   * Notice when the thing you painted has been carried off, and take the paint with it.
   *
   * ARCore assumes the world holds still. Spray a chair, push the chair away, and the anchor stays
   * where the chair was — the piece hangs in mid-air, which is the single most obviously fake
   * thing the app can do. There is no callback for it: a plane that moved is not subsumed and not
   * stopped, it simply stops describing reality, and ARCore goes on reporting it.
   *
   * The depth map is the one thing that can tell. Where the paint claims to sit, ARCore measures
   * the distance to whatever is actually in front of the camera. If that measurement comes back
   * well *behind* the paint, we are looking through the space the surface used to occupy. Hold
   * that reading and the piece is hidden — hidden, not deleted, so wheeling the chair back brings
   * the paint back with it, which is also what makes a false positive survivable.
   *
   * Deliberately timid, because depth-from-motion on a phone with no ToF sensor is noisy, and
   * paint vanishing while you are painting it would be far worse than paint floating:
   *  - only pieces on furniture-sized planes are eligible, so a wall or floor piece can never go;
   *  - evidence accrues at 5 Hz and needs ~1.2 s of agreement, while confirming evidence counts
   *    double against it, so returning is twice as easy as leaving;
   *  - the sample must sit well inside the frame and inside depth's useful range;
   *  - a five-texel median, so one dead pixel decides nothing.
   */
  private fun verifySurfaces(frame: Frame, now: Long) {
    if (!depthEnabled || now - lastVerify < VERIFY_INTERVAL_MS) return
    lastVerify = now
    watchedCount = quads.values.count { it.placed && it.onFurniture }
    movedCount = quads.values.count { it.missing }
    if (watchedCount == 0) return
    val img = try { frame.acquireDepthImage16Bits() } catch (e: Exception) { return } // usually NotYetAvailable
    try {
      val plane = img.planes[0]
      val buf = plane.buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
      val stride = plane.rowStride / 2
      for (q in quads.values) {
        if (!q.placed || !q.onFurniture) continue
        val delta = depthDelta(frame, q.center, img.width, img.height, buf, stride) ?: continue
        q.missScore = (q.missScore + if (delta > DEPTH_CLEAR_MARGIN_M) 1f else -2f).coerceIn(0f, MISS_TO_HIDE)
        val missing = q.missScore >= MISS_TO_HIDE
        if (missing != q.missing) {
          q.missing = missing
          Log.i(TAG, "surface ${if (missing) "gone" else "back"}: ${q.id}")
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "depth verify failed", e)
    } finally {
      img.close()
    }
  }

  /**
   * How far the measured surface is behind this point, in metres, or null if the sample can't be
   * trusted. Positive means free space where the paint is.
   */
  private fun depthDelta(frame: Frame, p: V3, dw: Int, dh: Int, buf: java.nio.ShortBuffer, stride: Int): Float? {
    val m = viewProj
    val cw = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15]
    if (cw <= 0f) return null // behind the camera
    val ndcX = (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) / cw
    val ndcY = (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) / cw
    if (abs(ndcX) > 0.7f || abs(ndcY) > 0.7f) return null // edges are where depth is worst

    // The depth map measures along the camera axis, not along the ray, so compare like with like.
    val paintZ = -(viewM[2] * p.x + viewM[6] * p.y + viewM[10] * p.z + viewM[14])
    if (paintZ < DEPTH_NEAR_M || paintZ > DEPTH_FAR_M) return null

    viewIn[0] = (ndcX * 0.5f + 0.5f) * viewportW
    viewIn[1] = (0.5f - ndcY * 0.5f) * viewportH // GL is y-up, the view is y-down
    try {
      frame.transformCoordinates2d(Coordinates2d.VIEW, viewIn, Coordinates2d.TEXTURE_NORMALIZED, texOut)
    } catch (e: Exception) { return null }
    val tx = (texOut[0] * dw).toInt()
    val ty = (texOut[1] * dh).toInt()
    if (tx < 1 || ty < 1 || tx >= dw - 1 || ty >= dh - 1) return null

    var n = 0
    for (i in 0 until 5) {
      val raw = buf.get((ty + CROSS_Y[i]) * stride + (tx + CROSS_X[i])).toInt() and 0xFFFF
      val mm = raw and 0x1FFF        // low 13 bits: millimetres
      if (mm == 0 || (raw shr 13) == 0) continue // no reading, or zero confidence
      depthSamples[n++] = mm / 1000f
    }
    if (n < 3) return null
    java.util.Arrays.sort(depthSamples, 0, n)
    return depthSamples[n / 2] - paintZ
  }

  // ---- hit testing -----------------------------------------------------------------------

  /**
   * Real planes only, and only the two kinds you can paint: floors and walls. A detected polygon
   * first, then the extension of a known plane, so a whole wall is paintable once any patch of it
   * is found.
   *
   * There used to be a third pass taking ARCore's DepthPoint and feature-point hits. On a phone
   * with no time-of-flight sensor the depth map is inferred from motion, so those hits land on
   * people, glass, the back of a chair — anything with parallax — and `locked` counted them as a
   * surface. That is how the reticle came to read "0.5 M FROM THE SURFACE" while aimed down a
   * corridor, and why paint went onto things that are not walls. A point is not a plane: if ARCore
   * hasn't resolved actual geometry we now report no hit, and the HUD says "aim at a wall or
   * floor" instead of lying. The iPhone keeps its equivalent fallback because on a LiDAR device
   * that mesh is measured rather than guessed.
   *
   * Depth stays enabled in the session config — ARCore uses it to find planes on surfaces too
   * blank to yield feature points, which is exactly the wall this is meant to work on.
   */
  private fun raycastCenter(frame: Frame): Hit? {
    if (viewportW == 0) return null
    val hits = try { frame.hitTest(viewportW / 2f, viewportH / 2f) } catch (e: Exception) { return null }
    // A ceiling is a plane you can neither reach nor meant to paint; ARCore calls it downward-facing.
    fun paintable(p: Plane) = p.type == Plane.Type.VERTICAL || p.type == Plane.Type.HORIZONTAL_UPWARD_FACING
    /**
     * How far past its seen edge a plane may still be painted. Proportional to the plane's own
     * smaller dimension, because the flat 0.9 m this used to be turned every piece of furniture
     * into a shelf: scan a chair and its ~45 cm seat became a 2.25 m plate floating at seat
     * height, paintable from across the room. A wall does want the slack — ARCore finds walls one
     * patch at a time — and a wall is large enough to earn it. Now a chair gets ~13 cm, a
     * half-found wall ~35 cm, a floor the old 0.9 m.
     */
    fun slack(p: Plane) = min(0.9f, max(0.06f, 0.3f * min(p.extentX, p.extentZ)))
    fun usable(p: Plane, hitPos: V3) =
      p.trackingState == TrackingState.TRACKING && p.subsumedBy == null && paintable(p) &&
        ((cameraPos - hitPos) dot planeNormal(p)) > 0f

    for (h in hits) {
      val p = h.trackable as? Plane ?: continue
      val t = M.fromPose(h.hitPose)
      if (usable(p, M.pos(t)) && p.isPoseInPolygon(h.hitPose)) return Hit(t, p, HitKind.PLANE, p.type == Plane.Type.VERTICAL || M.isVertical(t))
    }
    for (h in hits) {
      val p = h.trackable as? Plane ?: continue
      val t = M.fromPose(h.hitPose)
      if (!usable(p, M.pos(t))) continue
      // only trust the extension close to the part of the plane ARCore has actually seen
      val l = M.transformPoint(M.invert(M.fromPose(p.centerPose)), M.pos(t))
      val dx = max(0f, abs(l.x) - p.extentX / 2)
      val dz = max(0f, abs(l.z) - p.extentZ / 2)
      if (hypot(dx, dz) < slack(p)) return Hit(t, p, HitKind.EXTENDED, p.type == Plane.Type.VERTICAL)
    }
    return null
  }

  // ---- paint loop --------------------------------------------------------------------------

  private fun beginStroke() {
    lastTick = 0
    stroke = null // created lazily on first hit so the anchor is the surface we actually hit
  }

  private fun flushStroke() {
    val s = stroke ?: return
    stroke = null
    val q = quads[s.quadId] ?: return
    if (s.points.isEmpty()) return
    q.record(PaintQuad.Painted(s.id, colorOf(s.color), s.points.map { p -> FloatArray(p.size) { i -> p[i].toFloat() } }))
    myStrokes.add(q.id to s.id)
    q.upload(SystemClock.elapsedRealtime(), force = true)
    emitStrokeEnd(mapOf(
      "id" to s.id,
      "anchorId" to q.id,
      "transform" to M.flatten(M.mul(heading.toNorth(), q.transform)),
      "color" to s.color,
      "points" to s.points.toList(),
      "viewer" to s.viewer,
    ))
  }

  /** Pick the quad for a hit: one on the same plane containing the point, else any coplanar one, else a new one. */
  private fun quadFor(hit: Hit, now: Long): PaintQuad {
    val p = M.pos(hit.transform)
    val n = M.col(hit.transform, 1).normalized()
    hit.plane?.let { plane ->
      for (q in quads.values) {
        if (!q.placed || q.plane != plane) continue
        val l = q.local(p)
        if (q.contains(l.u, l.v)) return q
      }
    }
    for (q in quads.values) {
      if (!q.placed) continue
      val l = q.local(p)
      if (l.d < 0.08f && q.contains(l.u, l.v) && (n dot q.normal) > 0.95f) {
        if (q.plane == null && hit.plane != null) adopt(q, hit.plane, now) // estimated quad meets its real wall
        return q
      }
    }
    // "paint-a-" marks quads made on Android, so each platform knows whose saved map a stroke belongs to
    val id = "paint-a-" + UUID.randomUUID().toString().lowercase()
    val q = PaintQuad(id, quadFrame(p, hit.plane?.let { planeNormal(it) } ?: n))
    q.plane = hit.plane
    q.onFurniture = isFurniture(hit.plane)
    quads[id] = q
    anchorQuad(q)
    emitSurface(mapOf("id" to id, "count" to quads.size, "kind" to hit.kind.js))
    return q
  }

  /**
   * One spray tick. Dwelling on a spot used to start a drip; paint now stays where it was sprayed
   * and only builds up, which is what you want when you're actually trying to draw something.
   */
  private fun paintAt(hit: Hit, now: Long) {
    val q = quadFor(hit, now)
    var s = stroke
    if (s == null || s.quadId != q.id) {
      flushStroke()
      val id = UUID.randomUUID().toString().lowercase()
      val viewer = M.transformPoint(heading.toNorth(), cameraPos)
      s = StrokeRec(id, q.id, mutableListOf(), SplitMix(id), colorHex, viewer.toList())
      stroke = s
    }
    val l = q.local(M.pos(hit.transform))
    val f = flow
    val r = radius * (0.85f + 0.3f * f)
    val a = 0.28f * f
    q.dab(l.u, l.v, r, a, colorInt, s.rng)
    s.points.add(listOf(l.u.toDouble(), l.v.toDouble(), r.toDouble(), a.toDouble(), 0.0))
  }

  // ---- remote strokes ----------------------------------------------------------------------

  private class RemoteStroke(val id: String, val anchorId: String, val transform: M4, val color: Int, val points: List<FloatArray>, val viewer: V3?)

  private fun parseStroke(m: Map<String, Any?>): RemoteStroke? {
    val id = m["id"] as? String ?: return null
    val anchorId = m["anchorId"] as? String ?: return null
    val tf = M.unflatten(m["transform"]) ?: return null
    val hex = (m["color"] as? String)?.trim()?.removePrefix("#") ?: return null
    val color = colorOf(hex)
    val pts = (m["points"] as? List<*>)?.mapNotNull { p -> (p as? List<*>)?.mapNotNull { (it as? Number)?.toFloat() }?.toFloatArray()?.takeIf { it.size >= 4 } } ?: return null
    val viewer = (m["viewer"] as? List<*>)?.mapNotNull { (it as? Number)?.toFloat() }?.takeIf { it.size == 3 }?.let { V3(it[0], it[1], it[2]) }
    return RemoteStroke(id, anchorId, tf, color, pts, viewer)
  }

  /**
   * mode "absolute": transforms are in the frame of the loaded map (aligned once one of its anchors
   * resolves) or, with no map, this session's own north frame. mode "relative": no shared map —
   * place each quad at its offset from where the painter stood, relative to the camera now (valid
   * because both frames are north-aligned); real planes then pull it in.
   */
  private fun placeRemote(strokes: List<RemoteStroke>, mode: String) {
    val now = SystemClock.elapsedRealtime()
    val fromNorth = heading.fromNorth()
    val camNorth = M.transformPoint(heading.toNorth(), cameraPos)
    for (s in strokes) {
      var q = quads[s.anchorId]
      if (q == null) {
        when {
          mode == "relative" -> {
            val viewer = s.viewer ?: continue
            val placedNorth = M.withPos(s.transform, camNorth + (M.pos(s.transform) - viewer))
            q = PaintQuad(s.anchorId, M.mul(fromNorth, placedNorth)).also { it.loose = true }
          }
          mapState == MapState.RESOLVING && mapAlignment == null -> {
            // part of the piece being resolved, but not in the saved map: place it when the map aligns
            q = PaintQuad(s.anchorId, M.identity()).also { it.placed = false; it.savedNorth = s.transform }
          }
          mapAlignment != null -> q = PaintQuad(s.anchorId, M.mul(mapAlignment!!, s.transform)).also { it.loose = true }
          else -> q = PaintQuad(s.anchorId, M.mul(fromNorth, s.transform))
        }
        quads[s.anchorId] = q
        if (q.placed) { anchorQuad(q); if (q.loose) attachLooseToNearbyPlane(q) }
      }
      q.add(PaintQuad.Painted(s.id, s.color, s.points))
      q.upload(now, force = true)
    }
  }

  // ---- Cloud Anchor "world map" ------------------------------------------------------------

  private fun loadMap(entries: List<WorldMapFile.Entry>, g: Int) {
    resetState()
    val s = session ?: return
    for (e in entries) {
      val q = PaintQuad(e.id, M.identity())
      q.placed = false
      q.savedNorth = e.north
      q.savedOffset = e.offset
      q.cloudId = e.cloudId
      quads[e.id] = q
      val cloudId = e.cloudId ?: continue
      if (!cloudEnabled) continue
      try {
        pendingResolves++
        resolveFutures.add(s.resolveCloudAnchorAsync(cloudId) { anchor, state ->
          enqueue(needsTracking = false, gen = g) { onResolved(e.id, anchor, state == Anchor.CloudAnchorState.SUCCESS); true }
        })
      } catch (ex: Exception) {
        pendingResolves--
        Log.w(TAG, "resolve failed to start", ex)
      }
    }
    if (pendingResolves == 0) {
      mapState = MapState.FAILED
      emitTracking(mapOf("state" to "mapLoadFailed"))
      return
    }
    mapState = MapState.RESOLVING
    emitTracking(mapOf("state" to "mapLoaded", "anchors" to entries.size))
  }

  private fun onResolved(id: String, anchor: Anchor?, ok: Boolean) {
    pendingResolves--
    val q = quads[id]
    if (ok && anchor != null && q != null) {
      if (q.anchor != null && q.anchor !== q.hostAnchor) q.anchor?.detach() // provisional placement
      q.hostAnchor = anchor
      q.anchor = anchor
      q.anchorOffset = q.savedOffset ?: M.identity()
      q.transform = M.mul(M.fromPose(anchor.pose), q.anchorOffset!!)
      q.loose = false
      q.placed = true
      val saved = q.savedNorth
      if (mapAlignment == null && saved != null) {
        mapAlignment = M.mul(q.transform, M.invert(saved))
        placePendingWithAlignment()
      }
      mapState = MapState.RESOLVED
      attachLooseToNearbyPlane(q)
      emitSurface(mapOf("id" to id, "count" to quads.size, "restored" to true))
    } else {
      anchor?.detach()
    }
    if (pendingResolves <= 0 && mapState == MapState.RESOLVING) {
      mapState = MapState.FAILED
      emitTracking(mapOf("state" to "mapLoadFailed"))
    }
  }

  /** The first resolved anchor tells us how the saved frame sits in ours: place everything still waiting. */
  private fun placePendingWithAlignment() {
    val align = mapAlignment ?: return
    for (q in quads.values) {
      val saved = q.savedNorth ?: continue
      if (q.placed) continue
      q.transform = M.mul(align, saved)
      q.placed = true
      q.loose = true
      anchorQuad(q)
      attachLooseToNearbyPlane(q)
    }
  }

  private fun hostUnhostedQuads() {
    val s = session ?: return
    val g = generation.get()
    for (q in quads.values) {
      if (!q.placed || q.cloudId != null || q.hosting != null) continue
      try {
        val host = s.createAnchor(M.toPose(q.transform))
        if (q.hostAnchor != null && q.hostAnchor !== q.anchor) q.hostAnchor?.detach()
        q.hostAnchor = host
        q.hosting = s.hostCloudAnchorAsync(host, HOST_TTL_DAYS) { cloudId, state ->
          enqueue(needsTracking = false, gen = g) {
            q.hosting = null
            if (state == Anchor.CloudAnchorState.SUCCESS && cloudId != null) q.cloudId = cloudId
            else { Log.w(TAG, "hosting ${q.id} failed: $state"); if (q.hostAnchor !== q.anchor) q.hostAnchor?.detach(); q.hostAnchor = null }
            true
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "hosting ${q.id} failed to start", e)
      }
    }
  }

  private fun finishSave(path: String, promise: Promise) {
    val toNorth = heading.toNorth()
    val entries = quads.values.filter { it.placed }.map { q ->
      val host = q.hostAnchor
      val offset = if (q.cloudId != null && host != null && host.trackingState == TrackingState.TRACKING) {
        M.mul(M.invert(M.fromPose(host.pose)), q.transform)
      } else if (q.cloudId != null) q.anchorOffset ?: q.savedOffset else null
      WorldMapFile.Entry(q.id, if (offset != null) q.cloudId else null, offset, M.mul(toNorth, q.transform))
    }
    val hosted = entries.count { it.cloudId != null }
    if (hosted == 0) return promise.reject("E_WORLDMAP", "No Cloud Anchors could be hosted (scan the wall a little longer)", null)
    Thread {
      try {
        val bytes = WorldMapFile.write(path, entries)
        promise.resolve(mapOf("bytes" to bytes, "anchors" to hosted))
      } catch (e: Exception) {
        promise.reject("E_WORLDMAP", e.message ?: "write failed", e)
      }
    }.start()
  }

  // ---- events ------------------------------------------------------------------------------

  private fun emitTrackingIfDue(camera: Camera, now: Long) {
    if (now - lastTrackingEvent < 500) return
    var state = "normal"
    var reason = ""
    when (camera.trackingState) {
      TrackingState.STOPPED -> state = "notAvailable"
      TrackingState.PAUSED -> {
        state = "limited"
        reason = when (camera.trackingFailureReason) {
          TrackingFailureReason.NONE -> "initializing"
          TrackingFailureReason.EXCESSIVE_MOTION -> "excessiveMotion"
          TrackingFailureReason.INSUFFICIENT_FEATURES -> "insufficientFeatures"
          TrackingFailureReason.INSUFFICIENT_LIGHT -> "insufficientLight"
          TrackingFailureReason.CAMERA_UNAVAILABLE -> "cameraUnavailable"
          else -> "unknown"
        }
      }
      else -> if (mapState == MapState.RESOLVING) { state = "limited"; reason = "relocalizing" }
    }
    var mapping = ""
    if (cloudEnabled && camera.trackingState == TrackingState.TRACKING) {
      mapping = try {
        when (session?.estimateFeatureMapQualityForHosting(camera.pose)) {
          Session.FeatureMapQuality.GOOD -> "mapped"
          Session.FeatureMapQuality.SUFFICIENT -> "extending"
          Session.FeatureMapQuality.INSUFFICIENT -> "limited"
          else -> "unknown"
        }
      } catch (_: Exception) { "" }
    }
    val key = state + reason + mapping
    if (key == lastTrackingKey && now - lastTrackingEvent < 2000) return
    lastTrackingKey = key
    lastTrackingEvent = now
    val planeCount = planes.keys.count { it.trackingState == TrackingState.TRACKING && it.subsumedBy == null }
    emitTracking(mapOf(
      "state" to state, "reason" to reason, "mapping" to mapping, "planes" to planeCount, "surfaces" to quads.size,
      "lidar" to false, "depth" to depthEnabled, "heading" to if (heading.locked) "ready" else "calibrating",
    ))
  }

  private fun emitTracking(body: Map<String, Any>) = main.post { if (!destroyed) onTracking(body) }
  /** Every hit event also carries how the moved-surface check is doing, for the debug HUD. */
  private fun emitHit(body: Map<String, Any>) =
    main.post { if (!destroyed) onHit(body + mapOf("watched" to watchedCount, "moved" to movedCount)) }
  private fun emitStrokeEnd(body: Map<String, Any>) = main.post { if (!destroyed) onStrokeEnd(body) }
  private fun emitSurface(body: Map<String, Any>) = main.post { if (!destroyed) onSurface(body) }
}
