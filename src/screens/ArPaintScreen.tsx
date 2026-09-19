import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Paths } from 'expo-file-system';
import { ArPaintView, hasLidar, type ArHitEvent, type ArPaintViewRef, type ArStroke, type ArTrackingEvent, type HitKind } from '../../modules/ar-paint';
import { usePose } from '../hooks/usePose';
import { PaintLayer } from '../paint/PaintLayer';
import { useArSpray } from '../hooks/useArSpray';
import { useVolumeTrigger } from '../hooks/useVolumeTrigger';
import { useDiscovery } from '../hooks/useDiscovery';
import { BlockerBanner, CanMeter, HoldButtons, PaintMeters } from '../components/HUD';
import { DiscoveryOverlay } from '../components/DiscoveryOverlay';
import { useStore } from '../store';
import { downloadWorldMap, incrementViews, onRemoteStroke, reportCanvas, uploadWorldMap } from '../data/sync';
import { CANVAS_JOIN_RADIUS_M } from '../config';
import { haversineM } from '../lib/geo';
import type { Blocker } from '../hooks/useSprayEngine';
import type { Canvas, Stroke } from '../types';

/**
 * AR APPROACH — real surfaces via ARKit (rung 1 of the ladder), in a small custom Expo module
 * (modules/ar-paint). ARKit detects horizontal + vertical planes; a raycast from the reticle
 * finds the surface you're aiming at; paint is composited into a texture on a 5 m quad glued to
 * a custom ARAnchor on that surface. Persistence + sharing: each canvas (GPS spot) stores its
 * ARWorldMap in Supabase Storage plus strokes in anchor-local metres. Walking up to a canvas
 * downloads its map; ARKit relocalises against it ("the piece resolves") and the strokes are
 * replayed onto anchors in the same world frame, so a second phone sees paint on the same wall.
 * Tradeoff: relocalisation needs roughly the same viewpoint and lighting as the painter had.
 */
/**
 * DETECTION: ARKit horizontal + vertical planes (+ LiDAR mesh when the phone has it). The reticle
 * raycasts detected plane geometry first, then the infinite extension of a known plane, then a
 * feature-point estimate — so you can spray within a second or two of raising the phone, and the
 * quad is pulled onto the real wall the moment ARKit confirms it (see ArPaintView.snap).
 * ANCHORING: every quad is a custom ARAnchor in the session's world map; the view stays mounted
 * across tabs and resumes (not resets) the session, so paint keeps its world pose. Restart: the
 * saved ARWorldMap relocalises the anchors; if that fails within RELOC_TIMEOUT_MS, strokes are
 * placed from where the painter stood relative to the camera now, then snapped to detected planes.
 */
const RELOC_TIMEOUT_MS = 15000;

export function ArPaintScreen({ active = true }: { active?: boolean }) {
  useKeepAwake();
  const settings = useStore((s) => s.settings);
  const painter = useStore((s) => s.painter);
  const online = useStore((s) => s.online);
  const location = useStore((s) => s.location);
  const canvases = useStore((s) => s.canvases);
  const setTab = useStore((s) => s.setTab);
  const markDiscovered = useStore((s) => s.markDiscovered);

  const viewRef = useRef<ArPaintViewRef | null>(null);
  const engineRef = useRef<ReturnType<typeof useArSpray> | null>(null);
  const { pose, yawSV, pitchSV, rollSV } = usePose((m) => engineRef.current?.onShake(m));
  const mapCanvas = useRef<Canvas | null>(null); // canvas whose world map is loaded in the session
  const paintedThisSession = useRef(false);
  const failedMaps = useRef(new Set<string>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [worldMapPath, setWorldMapPath] = useState<string | null>(null);
  const [tracking, setTracking] = useState<ArTrackingEvent>({ state: 'limited', reason: 'initializing' });
  const [surfaces, setSurfaces] = useState(0);
  const [justFound, setJustFound] = useState<Canvas | null>(null);
  const [mapState, setMapState] = useState<'none' | 'loading' | 'relocalizing' | 'resolved' | 'approx'>('none');
  const [hitInfo, setHitInfo] = useState<{ kind: HitKind; vertical: boolean; locked: boolean }>({ kind: 'none', vertical: false, locked: false });
  const relocTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleMapSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const c = engineRef.current?.activeCanvas.current;
      if (!c || !viewRef.current) return;
      try {
        const path = `${Paths.cache.uri.replace('file://', '')}/${c.id}.arworldmap`;
        await viewRef.current.saveWorldMap(path);
        await uploadWorldMap(c.id, path);
      } catch (e) { console.warn('world map save failed', e); }
    }, 5000);
  }, []);

  const engine = useArSpray(pose, { onStrokeSaved: () => { paintedThisSession.current = true; scheduleMapSave(); } });
  engineRef.current = engine;
  // canvases with a world map resolve by relocalisation; web-made canvases (no map) resolve by proximity
  const discovery = useDiscovery(pose, (c) => !c.world_map_path);

  useVolumeTrigger(settings.volumeButtons && active, { onHoldStart: engine.start, onHoldEnd: engine.end });
  useEffect(() => { if (!active && engine.held.current) engine.end(engine.held.current); }, [active]);

  // The canvas you're standing at: load its world map (relocalise), or, if it has AR strokes but
  // no usable map, place them from the painter's viewpoint. Once, and only before you paint here.
  useEffect(() => {
    if (!location || mapCanvas.current || paintedThisSession.current || mapState === 'approx') return;
    let best: Canvas | null = null, bestD = Infinity, approx: Canvas | null = null, approxD = Infinity;
    const st = useStore.getState();
    for (const c of Object.values(canvases)) {
      if (c.flagged || failedMaps.current.has(c.id)) continue;
      const d = haversineM(location.lat, location.lng, c.lat, c.lng);
      if (d >= CANVAS_JOIN_RADIUS_M) continue;
      if (c.world_map_path) { if (d < bestD) { best = c; bestD = d; } }
      else if ((st.strokes[c.id] ?? []).some((s) => s.anchor_id && s.viewer) && d < approxD) { approx = c; approxD = d; }
    }
    if (best) {
      mapCanvas.current = best;
      engine.activeCanvas.current = best;
      setMapState('loading');
      downloadWorldMap(best).then((p) => { if (p) setWorldMapPath(p); else { const c = mapCanvas.current; mapCanvas.current = null; if (c) placeApprox(c); } });
    } else if (approx) placeApprox(approx);
  }, [location?.lat, location?.lng, canvases, mapState]);

  // Strokes arriving live for the loaded canvas
  useEffect(() => onRemoteStroke((s: Stroke) => {
    const c = engine.activeCanvas.current;
    if (!c || s.canvas_id !== c.id || !s.anchor_id || !s.transform) return;
    if (s.author_id && s.author_id === painter?.id) return;
    viewRef.current?.addStrokes([{ id: s.id, anchorId: s.anchor_id, transform: s.transform, color: s.color, points: s.points as number[][] }]).catch(() => {});
  }), [painter?.id]);

  const arStrokes = (c: Canvas | null) => (c ? (useStore.getState().strokes[c.id] ?? []).filter((s) => s.anchor_id && s.transform) : [])
    .map((s) => ({ id: s.id, anchorId: s.anchor_id!, transform: s.transform!, color: s.color, points: s.points as number[][], viewer: s.viewer ?? undefined }));

  /** No usable world map: fresh session, strokes placed from the painter's viewpoint relative to ours. */
  const placeApprox = useCallback(async (c: Canvas) => {
    failedMaps.current.add(c.id);
    engine.activeCanvas.current = c;
    try {
      await viewRef.current?.resetSession();
      setWorldMapPath(null);
      const ss = arStrokes(c).filter((s) => s.viewer);
      setTimeout(() => { if (ss.length) viewRef.current?.addStrokes(ss, 'relative').catch(() => {}); }, 1500); // let tracking initialise first
      setMapState(ss.length ? 'approx' : 'none');
      const st = useStore.getState();
      if (ss.length && !st.discovered[c.id] && c.author_id !== st.painter?.id) {
        markDiscovered(c.id); incrementViews(c.id);
        setJustFound({ ...c, views: c.views + 1 });
        setTimeout(() => setJustFound(null), 7000);
      }
    } catch { setMapState('none'); }
  }, []);

  const onTracking = useCallback((e: { nativeEvent: ArTrackingEvent }) => {
    const ev = e.nativeEvent;
    if (ev.state === 'mapLoaded') {
      setMapState('relocalizing');
      const strokes = arStrokes(mapCanvas.current);
      if (strokes.length) viewRef.current?.addStrokes(strokes, 'absolute').catch(() => {});
      if (relocTimer.current) clearTimeout(relocTimer.current);
      relocTimer.current = setTimeout(() => {
        const c = mapCanvas.current;
        if (c && !paintedThisSession.current) { mapCanvas.current = null; placeApprox(c); }
      }, RELOC_TIMEOUT_MS);
      return;
    }
    if (ev.state === 'mapLoadFailed') { const c = mapCanvas.current; mapCanvas.current = null; if (c) placeApprox(c); else setMapState('none'); return; }
    setTracking(ev);
    if (ev.state === 'normal' && mapCanvas.current && mapState === 'relocalizing') {
      if (relocTimer.current) { clearTimeout(relocTimer.current); relocTimer.current = null; }
      setMapState('resolved');
      const c = mapCanvas.current;
      const st = useStore.getState();
      if (!st.discovered[c.id] && c.author_id !== st.painter?.id) {
        markDiscovered(c.id); incrementViews(c.id);
        setJustFound({ ...c, views: c.views + 1 });
        setTimeout(() => setJustFound(null), 7000);
      }
    }
  }, [mapState, worldMapPath]);

  const onHit = useCallback((e: { nativeEvent: ArHitEvent }) => {
    const ev = e.nativeEvent;
    engine.hit.current = ev.hit;
    if (ev.drip) { if (useStore.getState().settings.sound) import('../audio/sfx').then(({ sfx }) => sfx.pool()); return; }
    const kind = ev.kind ?? (ev.hit ? 'estimated' : 'none');
    setHitInfo((p) => (p.kind === kind && p.vertical === !!ev.vertical && p.locked === !!ev.locked ? p : { kind, vertical: !!ev.vertical, locked: !!ev.locked }));
  }, []);
  const onStrokeEnd = useCallback((e: { nativeEvent: ArStroke }) => engine.onNativeStroke(e.nativeEvent), []);
  const onSurface = useCallback((e: { nativeEvent: { count: number } }) => setSurfaces(e.nativeEvent.count), []);

  const [ui, setUi] = useState<{ blocker: Blocker; held: string }>({ blocker: null, held: '-' });
  useEffect(() => {
    const id = setInterval(() => {
      const blocker = engine.held.current ? engine.blocker.current : null;
      const held = engine.held.current ?? '-';
      setUi((p) => (p.blocker === blocker && p.held === held ? p : { blocker, held }));
    }, 100);
    return () => clearInterval(id);
  }, []);

  const onReport = useCallback((id: string) => {
    Alert.alert('Report this piece?', 'Two reports hide a piece for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => reportCanvas(id, painter?.id ?? null, 'inappropriate') },
    ]);
  }, [painter]);

  const trackingText = tracking.state === 'normal' ? 'tracking' : tracking.state === 'limited' ? `limited · ${tracking.reason}` : tracking.state;
  const mapText = mapState === 'loading' ? 'loading piece…' : mapState === 'relocalizing' ? 'look around to resolve the piece' : mapState === 'resolved' ? 'piece resolved' : mapState === 'approx' ? 'piece placed from memory · walk to where it was painted' : '';
  const aimingAtNothing = engine.native.spraying && !engine.hit.current;
  const lock = hitInfo.kind === 'none' ? { text: 'AIM AT A WALL OR FLOOR', color: '#ff5c1a' }
    : hitInfo.locked ? { text: `${hitInfo.vertical ? 'WALL' : 'FLOOR'} LOCKED${hitInfo.kind === 'extended' ? ' · edge' : hitInfo.kind === 'mesh' ? ' · lidar' : ''}`, color: hitInfo.vertical ? '#19e6ff' : '#7cff3a' }
    : { text: 'FINDING SURFACE… move the phone slowly', color: '#ffe600' };

  return (
    <View style={styles.root}>
      <ArPaintView
        ref={viewRef}
        style={StyleSheet.absoluteFill}
        spraying={engine.native.spraying}
        paintColor={engine.native.color}
        radius={engine.native.radius}
        flow={engine.native.flow}
        showPlanes={settings.showPlanes}
        worldMapPath={worldMapPath}
        onTracking={onTracking}
        onHit={onHit}
        onStrokeEnd={onStrokeEnd}
        onSurface={onSurface}
      />
      {/* strokes painted from the web app (compass-anchored) render as an overlay on top of the AR view */}
      <PaintLayer yawSV={yawSV} pitchSV={pitchSV} rollSV={rollSV} walls={discovery.walls} />
      <PaintMeters />
      <CanMeter />
      <DiscoveryOverlay d={{ ...discovery, justFound: justFound ?? discovery.justFound, walls: [] }} onReport={onReport} />
      <BlockerBanner blocker={ui.blocker} />
      <View style={[styles.lock, { borderColor: lock.color }]} pointerEvents="none">
        <View style={[styles.lockDot, { backgroundColor: lock.color }]} />
        <Text style={[styles.lockText, { color: lock.color }]}>{lock.text}</Text>
      </View>
      {aimingAtNothing && !ui.blocker && (
        <View style={styles.banner} pointerEvents="none"><Text style={styles.bannerText}>Aim at a wall or floor — move the phone slowly so it finds the surface</Text></View>
      )}
      <HoldButtons onStart={engine.start} onEnd={engine.end} />

      <View style={styles.topBar} pointerEvents="box-none">
        <Text style={styles.brand}>FRESCO</Text>
        <Text style={styles.status}>{painter?.name ?? '—'} · {online ? 'live' : 'offline'} · {trackingText}{mapText ? ` · ${mapText}` : ''}</Text>
        <Pressable onPress={() => setTab('settings')} hitSlop={10} style={styles.gear}><Text style={styles.gearText}>⚙︎</Text></Pressable>
      </View>
      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>{settings.volumeButtons ? 'hold the buttons or VOL+ / VOL− to spray · shake to charge' : 'hold the buttons to spray · shake to charge'}</Text>
      </View>
      <View style={styles.debug} pointerEvents="none">
        <Text style={styles.debugText}>
          planes {tracking.planes ?? 0} · quads {surfaces} · {hasLidar ? 'lidar' : 'no lidar'} · hit {hitInfo.kind} · held {ui.held} · block {ui.blocker ?? '-'} · gps {location ? `±${Math.round(location.accuracy)}m` : '…'} · map {tracking.mapping || '-'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 3 },
  status: { color: '#ffffffaa', fontSize: 11, flex: 1 },
  gear: { backgroundColor: '#0008', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gearText: { color: '#fff', fontSize: 18 },
  banner: { position: 'absolute', top: '58%', alignSelf: 'center', backgroundColor: '#000a', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, maxWidth: '85%' },
  bannerText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  debug: { position: 'absolute', top: 92, left: 12, right: 12, alignItems: 'center' },
  debugText: { color: '#ffffff99', fontSize: 9, textAlign: 'center' },
  lock: { position: 'absolute', top: '36%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#000a', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  lockDot: { width: 8, height: 8, borderRadius: 4 },
  lockText: { fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
  hint: { position: 'absolute', bottom: 194, alignSelf: 'center', backgroundColor: '#0006', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  hintText: { color: '#ffffffcc', fontSize: 11 },
});
