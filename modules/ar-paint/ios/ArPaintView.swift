import ExpoModulesCore
import ARKit
import SceneKit

/// A surface painted with spray. One PaintNode = a 5 m × 5 m transparent quad glued to a custom
/// ARAnchor ("paint-<uuid>"), lying on a detected plane. Dabs are composited into its CGContext
/// texture, so cost is independent of how much paint is on it. Coordinates (u, v) are metres in
/// the anchor's plane (u = anchor +X, v = anchor −Z), which is what gets persisted and shared.
final class PaintNode {
  static let sizeM: CGFloat = 5.0
  static let px = 2048
  static var pxPerM: CGFloat { CGFloat(px) / sizeM }

  let id: String
  var transform: simd_float4x4
  let ctx: CGContext
  let node: SCNNode
  let material = SCNMaterial()
  var dirty = false
  var lastUpload: CFTimeInterval = 0
  var attached = false

  init(id: String, transform: simd_float4x4) {
    self.id = id
    self.transform = transform
    let cs = CGColorSpaceCreateDeviceRGB()
    ctx = CGContext(data: nil, width: PaintNode.px, height: PaintNode.px, bitsPerComponent: 8, bytesPerRow: PaintNode.px * 4,
                    space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.clear(CGRect(x: 0, y: 0, width: PaintNode.px, height: PaintNode.px))
    let plane = SCNPlane(width: PaintNode.sizeM, height: PaintNode.sizeM)
    material.lightingModel = .constant
    material.isDoubleSided = true
    material.blendMode = .alpha
    material.writesToDepthBuffer = false
    material.transparencyMode = .aOne
    material.diffuse.contents = UIColor.clear
    plane.materials = [material]
    node = SCNNode(geometry: plane)
    node.eulerAngles.x = -.pi / 2 // lie in the anchor's XZ plane, facing +Y
    node.position.y = 0.004 // sit just above the surface, avoids z-fighting with plane visuals
    node.renderingOrder = 10
  }

  /// World point → (u, v, distanceFromPlane) in this node's anchor space.
  func local(_ world: simd_float3) -> (u: CGFloat, v: CGFloat, d: CGFloat) {
    let inv = simd_inverse(transform)
    let p = inv * simd_float4(world, 1)
    return (CGFloat(p.x), CGFloat(-p.z), CGFloat(abs(p.y)))
  }
  var normal: simd_float3 { simd_normalize(simd_float3(transform.columns.1.x, transform.columns.1.y, transform.columns.1.z)) }

  func contains(u: CGFloat, v: CGFloat) -> Bool {
    let h = PaintNode.sizeM / 2
    return abs(u) <= h && abs(v) <= h
  }

  func pixel(u: CGFloat, v: CGFloat) -> CGPoint {
    let h = PaintNode.sizeM / 2
    // CGContext origin is bottom-left; SceneKit texture v=0 is top. Flip so +v (anchor −Z, "up"
    // the wall for vertical planes) maps to the top of the image.
    return CGPoint(x: (u + h) * PaintNode.pxPerM, y: (v + h) * PaintNode.pxPerM)
  }

  /// Curtis-style cheap spray: faint darker halo (edge darkening), scattered soft body (buildup),
  /// dense core, overspray speckle.
  func dab(u: CGFloat, v: CGFloat, radiusM: CGFloat, alpha: CGFloat, color: UIColor, rng: inout SplitMix) {
    let c = pixel(u: u, v: v)
    let r = max(2, radiusM * PaintNode.pxPerM)
    var cr: CGFloat = 0, cg: CGFloat = 0, cb: CGFloat = 0, ca: CGFloat = 0
    color.getRed(&cr, green: &cg, blue: &cb, alpha: &ca)
    let dark = UIColor(red: cr * 0.72, green: cg * 0.72, blue: cb * 0.72, alpha: 1)

    softCircle(at: c, r: r * 0.95, color: dark, alpha: alpha * 0.07)
    for _ in 0..<5 {
      let a = rng.next() * 2 * .pi
      let d = rng.gauss() * r * 0.45
      softCircle(at: CGPoint(x: c.x + cos(a) * d, y: c.y + sin(a) * d), r: r * 0.5, color: color, alpha: alpha * (0.22 + 0.16 * rng.next()))
    }
    softCircle(at: c, r: r * 0.24, color: color, alpha: alpha * 0.55, hard: 0.5)
    for _ in 0..<3 {
      let a = rng.next() * 2 * .pi
      let d = r * (0.8 + rng.next() * 0.9)
      let sr = r * (0.06 + rng.next() * 0.05)
      ctx.setFillColor(color.withAlphaComponent(alpha * 0.5).cgColor)
      ctx.fillEllipse(in: CGRect(x: c.x + cos(a) * d - sr, y: c.y + sin(a) * d - sr, width: sr * 2, height: sr * 2))
    }
    dirty = true
  }

  /// A run of paint downward from (u, v): pooling when you dwell on a spot.
  func drip(u: CGFloat, v: CGFloat, lengthM: CGFloat, alpha: CGFloat, color: UIColor, rng: inout SplitMix) {
    let w = (0.004 + rng.next() * 0.003) * PaintNode.pxPerM
    let start = pixel(u: u, v: v)
    let len = lengthM * PaintNode.pxPerM
    let steps = max(4, Int(len / (w * 0.6)))
    var x = start.x + (rng.next() - 0.5) * w
    for i in 0...steps {
      let t = CGFloat(i) / CGFloat(steps)
      x += (rng.next() - 0.5) * w * 0.35
      let rr = w * (1 - 0.45 * t)
      softCircle(at: CGPoint(x: x, y: start.y - len * t), r: rr, color: color, alpha: alpha * (0.75 - 0.35 * t), hard: 0.6)
    }
    softCircle(at: CGPoint(x: x, y: start.y - len), r: w * 0.9, color: color, alpha: alpha * 0.7, hard: 0.5)
    softCircle(at: start, r: w * 2.2, color: color, alpha: alpha * 0.25)
    dirty = true
  }

  private func softCircle(at c: CGPoint, r: CGFloat, color: UIColor, alpha: CGFloat, hard: CGFloat = 0.0) {
    let cs = CGColorSpaceCreateDeviceRGB()
    let inner = color.withAlphaComponent(alpha).cgColor
    let outer = color.withAlphaComponent(0).cgColor
    guard let g = CGGradient(colorsSpace: cs, colors: [inner, inner, outer] as CFArray, locations: [0, hard, 1]) else { return }
    ctx.saveGState()
    ctx.addEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
    ctx.clip()
    ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: r, options: [])
    ctx.restoreGState()
  }

  func uploadIfNeeded(now: CFTimeInterval, force: Bool = false) {
    guard dirty, force || now - lastUpload > 1.0 / 20.0 else { return }
    if let img = ctx.makeImage() {
      material.diffuse.contents = img
      lastUpload = now
      dirty = false
    }
  }
}

/// Deterministic PRNG so every phone renders the same speckle for the same stroke.
struct SplitMix {
  var state: UInt64
  init(seed: String) {
    var h: UInt64 = 0xcbf29ce484222325
    for b in seed.utf8 { h = (h ^ UInt64(b)) &* 0x100000001b3 }
    state = h
  }
  mutating func next() -> CGFloat {
    state &+= 0x9e3779b97f4a7c15
    var z = state
    z = (z ^ (z >> 30)) &* 0xbf58476d1ce4e5b9
    z = (z ^ (z >> 27)) &* 0x94d049bb133111eb
    z = z ^ (z >> 31)
    return CGFloat(Double(z >> 11) / Double(1 << 53))
  }
  mutating func gauss() -> CGFloat {
    let u = max(1e-9, next()), v = next()
    return max(-2.5, min(2.5, sqrt(-2 * log(u)) * cos(2 * .pi * v)))
  }
}

final class ArPaintView: ExpoView, ARSCNViewDelegate, ARSessionDelegate {
  let sceneView = ARSCNView()
  let onTracking = EventDispatcher()
  let onHit = EventDispatcher()
  let onStrokeEnd = EventDispatcher()
  let onSurface = EventDispatcher()

  // props
  var spraying = false { didSet { if spraying != oldValue { spraying ? beginStroke() : endStroke() } } }
  var paintColor: UIColor = UIColor(red: 1, green: 0.18, blue: 0.58, alpha: 1)
  var radius: CGFloat = 0.05
  var flow: CGFloat = 1
  var showPlanes = true { didSet { planeNodes.values.forEach { $0.isHidden = !showPlanes } } }

  private var paintNodes: [String: PaintNode] = [:]
  private var planeNodes: [UUID: SCNNode] = [:]
  private var displayLink: CADisplayLink?
  private var reticle = SCNNode()
  private var lastHitEvent: CFTimeInterval = 0
  private var lastTrackingEvent: CFTimeInterval = 0
  private var lastTrackingKey = ""
  private var pendingWorldMap: ARWorldMap?

  // current stroke
  private struct StrokeRec { var id: String; var nodeId: String; var points: [[Double]]; var rng: SplitMix; var color: String; var viewer: [Double] }
  private var loadedMapAnchorNames = Set<String>()
  private var stroke: StrokeRec?
  private var lastDab: (u: CGFloat, v: CGFloat, t: CFTimeInterval)?
  private var dwellSince: CFTimeInterval = 0
  private var lastTick: CFTimeInterval = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    sceneView.delegate = self
    sceneView.session.delegate = self
    sceneView.automaticallyUpdatesLighting = true
    sceneView.antialiasingMode = .multisampling2X
    sceneView.scene = SCNScene()
    addSubview(sceneView)
    buildReticle()
    sceneView.scene.rootNode.addChildNode(reticle)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sceneView.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      restartSession(worldMap: pendingWorldMap)
      pendingWorldMap = nil
      if displayLink == nil {
        displayLink = CADisplayLink(target: self, selector: #selector(tick))
        displayLink?.preferredFramesPerSecond = 60
        displayLink?.add(to: .main, forMode: .common)
      }
    } else {
      sceneView.session.pause()
      displayLink?.invalidate(); displayLink = nil
    }
  }

  // MARK: session

  func restartSession(worldMap: ARWorldMap?) {
    guard ARWorldTrackingConfiguration.isSupported else { return }
    let config = ARWorldTrackingConfiguration()
    // North-aligned metric frame (−Z = north, +X = east, +Y = up, origin = where the session started).
    // Anchor transforms are stored in this frame, so the web app can project AR strokes onto its
    // compass sphere and both clients agree on where paint is.
    config.worldAlignment = .gravityAndHeading
    config.planeDetection = [.horizontal, .vertical]
    config.environmentTexturing = .none
    config.isLightEstimationEnabled = true
    if let map = worldMap { config.initialWorldMap = map }
    for p in paintNodes.values { p.node.removeFromParentNode(); p.attached = false }
    paintNodes.removeAll()
    planeNodes.values.forEach { $0.removeFromParentNode() }
    planeNodes.removeAll()
    sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
  }

  func setWorldMapPath(_ path: String?) {
    guard let path = path, !path.isEmpty else { return }
    DispatchQueue.global(qos: .userInitiated).async {
      guard let data = FileManager.default.contents(atPath: path),
            let map = try? NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data) else {
        DispatchQueue.main.async { self.onTracking(["state": "mapLoadFailed"]) }
        return
      }
      DispatchQueue.main.async {
        self.loadedMapAnchorNames = Set(map.anchors.compactMap { $0.name })
        if self.window != nil { self.restartSession(worldMap: map) } else { self.pendingWorldMap = map }
        self.onTracking(["state": "mapLoaded", "anchors": map.anchors.count])
      }
    }
  }

  func saveWorldMap(to path: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    sceneView.session.getCurrentWorldMap { map, error in
      guard let map = map else { completion(.failure(error ?? NSError(domain: "ArPaint", code: 1))); return }
      DispatchQueue.global(qos: .utility).async {
        do {
          let data = try NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true)
          try data.write(to: URL(fileURLWithPath: path))
          completion(.success(["bytes": data.count, "anchors": map.anchors.count]))
        } catch { completion(.failure(error)) }
      }
    }
  }

  func clearAll() {
    for p in paintNodes.values { p.node.removeFromParentNode() }
    paintNodes.removeAll()
  }

  // MARK: reticle

  private func buildReticle() {
    let ring = SCNTube(innerRadius: 0.035, outerRadius: 0.045, height: 0.001)
    let m = SCNMaterial(); m.diffuse.contents = UIColor.white.withAlphaComponent(0.85); m.lightingModel = .constant
    m.writesToDepthBuffer = false
    ring.materials = [m]
    reticle = SCNNode(geometry: ring)
    reticle.renderingOrder = 20
    reticle.isHidden = true
    let dot = SCNNode(geometry: SCNSphere(radius: 0.004))
    dot.geometry?.firstMaterial?.diffuse.contents = UIColor.white
    dot.geometry?.firstMaterial?.lightingModel = .constant
    reticle.addChildNode(dot)
  }

  // MARK: paint loop

  private func raycastCenter() -> ARRaycastResult? {
    let center = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
    if let q = sceneView.raycastQuery(from: center, allowing: .existingPlaneGeometry, alignment: .any),
       let r = sceneView.session.raycast(q).first { return r }
    if let q = sceneView.raycastQuery(from: center, allowing: .estimatedPlane, alignment: .any),
       let r = sceneView.session.raycast(q).first { return r }
    return nil
  }

  @objc private func tick(_ link: CADisplayLink) {
    let now = link.timestamp
    let hit = raycastCenter()
    if let h = hit {
      let t = h.worldTransform
      reticle.simdTransform = t
      reticle.simdPosition += simd_float3(t.columns.1.x, t.columns.1.y, t.columns.1.z) * 0.006
      reticle.isHidden = false
      let cam = sceneView.pointOfView?.simdWorldPosition ?? .zero
      let dist = simd_distance(cam, simd_float3(t.columns.3.x, t.columns.3.y, t.columns.3.z))
      reticle.simdScale = simd_float3(repeating: max(0.5, min(3, dist / 0.8)))
      if now - lastHitEvent > 0.1 { lastHitEvent = now; onHit(["hit": true, "distance": Double(dist)]) }
    } else {
      reticle.isHidden = true
      if now - lastHitEvent > 0.1 { lastHitEvent = now; onHit(["hit": false, "distance": 0]) }
    }

    if spraying, let h = hit, now - lastTick >= 1.0 / 30.0 {
      lastTick = now
      paintAt(h, now: now)
    }
    for p in paintNodes.values { p.uploadIfNeeded(now: now) }
  }

  private func beginStroke() {
    lastTick = 0
    lastDab = nil
    dwellSince = CACurrentMediaTime()
    stroke = nil // created lazily on first hit so the anchor is the surface we actually hit
  }

  private func endStroke() {
    flushStroke()
  }

  private func flushStroke() {
    guard let s = stroke else { return }
    stroke = nil
    guard !s.points.isEmpty, let node = paintNodes[s.nodeId] else { return }
    node.uploadIfNeeded(now: CACurrentMediaTime(), force: true)
    onStrokeEnd([
      "id": s.id, "anchorId": s.nodeId, "transform": flatten(node.transform), "color": s.color, "points": s.points, "viewer": s.viewer,
    ])
  }

  /// Pick the paint node for a hit: an existing coplanar quad that contains the point, else a new one.
  private func nodeFor(hit: ARRaycastResult) -> PaintNode {
    let t = hit.worldTransform
    let p = simd_float3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    let n = simd_normalize(simd_float3(t.columns.1.x, t.columns.1.y, t.columns.1.z))
    for node in paintNodes.values {
      let l = node.local(p)
      if l.d < 0.06 && node.contains(u: l.u, v: l.v) && simd_dot(n, node.normal) > 0.9 { return node }
    }
    // New quad centred on the hit, oriented like the surface (use the plane anchor's frame when we have one
    // so u/v run along the wall's own axes).
    var transform = t
    if let plane = hit.anchor as? ARPlaneAnchor {
      transform = plane.transform
      transform.columns.3 = simd_float4(p, 1)
    }
    let id = "paint-" + UUID().uuidString.lowercased()
    let node = PaintNode(id: id, transform: transform)
    paintNodes[id] = node
    sceneView.session.add(anchor: ARAnchor(name: id, transform: transform))
    onSurface(["id": id, "count": paintNodes.count])
    return node
  }

  private func paintAt(_ hit: ARRaycastResult, now: CFTimeInterval) {
    let node = nodeFor(hit: hit)
    if stroke == nil || stroke!.nodeId != node.id {
      flushStroke()
      let id = UUID().uuidString.lowercased()
      let cam = sceneView.pointOfView?.simdWorldPosition ?? .zero
      stroke = StrokeRec(id: id, nodeId: node.id, points: [], rng: SplitMix(seed: id), color: paintColor.hexString, viewer: [Double(cam.x), Double(cam.y), Double(cam.z)])
    }
    let t = hit.worldTransform
    let p = simd_float3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    let l = node.local(p)
    let r = radius * (0.85 + 0.3 * flow)
    let a = 0.16 * flow
    node.dab(u: l.u, v: l.v, radiusM: r, alpha: a, color: paintColor, rng: &stroke!.rng)
    stroke!.points.append([Double(l.u), Double(l.v), Double(r), Double(a), 0])

    // dwell → pooling drip
    if let last = lastDab, hypot(l.u - last.u, l.v - last.v) < 0.02 {
      if now - dwellSince > 1.1 {
        dwellSince = now
        let len = 0.05 + stroke!.rng.next() * 0.12
        node.drip(u: l.u, v: l.v - r * 0.3, lengthM: len, alpha: 0.6 * flow, color: paintColor, rng: &stroke!.rng)
        stroke!.points.append([Double(l.u), Double(l.v - r * 0.3), Double(len), Double(0.6 * flow), 1])
        onHit(["hit": true, "distance": 0, "drip": true])
      }
    } else { dwellSince = now }
    lastDab = (l.u, l.v, now)
  }

  /// Strokes from other phones / previous sessions: [{id, anchorId, transform:[16], color, points:[[u,v,r,a,kind]]}]
  func addRemoteStrokes(_ strokes: [[String: Any]]) {
    for s in strokes {
      guard let id = s["id"] as? String, let anchorId = s["anchorId"] as? String,
            let tf = s["transform"] as? [Double], tf.count == 16,
            let colorHex = s["color"] as? String, let pts = s["points"] as? [[Double]] else { continue }
      let node: PaintNode
      if let existing = paintNodes[anchorId] { node = existing } else {
        let transform = unflatten(tf)
        node = PaintNode(id: anchorId, transform: transform)
        paintNodes[anchorId] = node
        // If the loaded world map already contains this anchor, ARKit will call didAdd and we attach there;
        // otherwise add it ourselves.
        let inLoadedMap = loadedMapAnchorNames.contains(anchorId)
        if !inLoadedMap && !(sceneView.session.currentFrame?.anchors.contains { $0.name == anchorId } ?? false) {
          sceneView.session.add(anchor: ARAnchor(name: anchorId, transform: transform))
        } else if let anchor = sceneView.session.currentFrame?.anchors.first(where: { $0.name == anchorId }),
                  let anchorNode = sceneView.node(for: anchor) {
          anchorNode.addChildNode(node.node); node.attached = true
        }
      }
      var rng = SplitMix(seed: id)
      let color = UIColor(hex: colorHex)
      for p in pts where p.count >= 4 {
        let kind = p.count > 4 ? p[4] : 0
        if kind == 1 { _ = rng.next(); node.drip(u: CGFloat(p[0]), v: CGFloat(p[1]), lengthM: CGFloat(p[2]), alpha: CGFloat(p[3]), color: color, rng: &rng) }
        else { node.dab(u: CGFloat(p[0]), v: CGFloat(p[1]), radiusM: CGFloat(p[2]), alpha: CGFloat(p[3]), color: color, rng: &rng) }
      }
      node.uploadIfNeeded(now: CACurrentMediaTime(), force: true)
    }
  }

  // MARK: ARSCNViewDelegate

  func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
    if let plane = anchor as? ARPlaneAnchor {
      guard let geo = ARSCNPlaneGeometry(device: sceneView.device!) else { return }
      geo.update(from: plane.geometry)
      let m = SCNMaterial()
      m.diffuse.contents = UIColor.white.withAlphaComponent(0.06)
      m.lightingModel = .constant
      m.writesToDepthBuffer = false
      geo.materials = [m]
      let pn = SCNNode(geometry: geo)
      pn.isHidden = !showPlanes
      pn.renderingOrder = 5
      node.addChildNode(pn)
      DispatchQueue.main.async { self.planeNodes[plane.identifier] = pn }
      return
    }
    if let name = anchor.name, name.hasPrefix("paint-") {
      DispatchQueue.main.async {
        let pnode: PaintNode
        if let existing = self.paintNodes[name] { pnode = existing } else {
          // restored from a saved world map: JS will replay its strokes via addStrokes
          pnode = PaintNode(id: name, transform: anchor.transform)
          self.paintNodes[name] = pnode
        }
        pnode.transform = anchor.transform
        if !pnode.attached { node.addChildNode(pnode.node); pnode.attached = true }
        self.onSurface(["id": name, "count": self.paintNodes.count, "restored": true])
      }
    }
  }

  func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
    let transform = anchor.transform
    if let plane = anchor as? ARPlaneAnchor {
      let geometry = plane.geometry
      DispatchQueue.main.async {
        if let geo = self.planeNodes[plane.identifier]?.geometry as? ARSCNPlaneGeometry { geo.update(from: geometry) }
      }
    } else if let name = anchor.name, name.hasPrefix("paint-") {
      DispatchQueue.main.async { self.paintNodes[name]?.transform = transform }
    }
  }

  func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { true }

  func renderer(_ renderer: SCNSceneRenderer, didRemove node: SCNNode, for anchor: ARAnchor) {
    if let plane = anchor as? ARPlaneAnchor { DispatchQueue.main.async { self.planeNodes[plane.identifier] = nil } }
    // paint anchors are never removed by ARKit; if they were, keep the node where it is
  }

  // MARK: ARSessionDelegate

  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    emitTracking(camera: camera, frame: session.currentFrame)
  }

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    let now = CACurrentMediaTime()
    if now - lastTrackingEvent > 0.5 { emitTracking(camera: frame.camera, frame: frame) }
  }

  private func emitTracking(camera: ARCamera, frame: ARFrame?) {
    var state = "normal", reason = ""
    switch camera.trackingState {
    case .notAvailable: state = "notAvailable"
    case .limited(let r):
      state = "limited"
      switch r {
      case .initializing: reason = "initializing"
      case .relocalizing: reason = "relocalizing"
      case .excessiveMotion: reason = "excessiveMotion"
      case .insufficientFeatures: reason = "insufficientFeatures"
      @unknown default: reason = "unknown"
      }
    case .normal: state = "normal"
    }
    var mapping = ""
    if let f = frame {
      switch f.worldMappingStatus {
      case .notAvailable: mapping = "notAvailable"
      case .limited: mapping = "limited"
      case .extending: mapping = "extending"
      case .mapped: mapping = "mapped"
      @unknown default: mapping = "unknown"
      }
    }
    let key = state + reason + mapping
    let now = CACurrentMediaTime()
    if key == lastTrackingKey && now - lastTrackingEvent < 2 { return }
    lastTrackingKey = key; lastTrackingEvent = now
    onTracking(["state": state, "reason": reason, "mapping": mapping, "planes": planeNodes.count, "surfaces": paintNodes.count])
  }
}

private func flatten(_ m: simd_float4x4) -> [Double] {
  var out: [Double] = []
  for c in 0..<4 { for r in 0..<4 { out.append(Double(m[c][r])) } }
  return out
}
private func unflatten(_ a: [Double]) -> simd_float4x4 {
  var m = matrix_identity_float4x4
  for c in 0..<4 { for r in 0..<4 { m[c][r] = Float(a[c * 4 + r]) } }
  return m
}

extension UIColor {
  var hexString: String {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    getRed(&r, green: &g, blue: &b, alpha: &a)
    return String(format: "#%02x%02x%02x", Int(r * 255), Int(g * 255), Int(b * 255))
  }
}
