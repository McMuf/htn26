import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Paths } from 'expo-file-system';
import { ArPaintView, type ArPaintViewRef, type ArStroke, type ArTrackingEvent } from '../../modules/ar-paint';
import { usePose } from '../hooks/usePose';
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
export function ArPaintScreen() {
  useKeepAwake();
  const settings = useStore((s) => s.settings);
  const painter = useStore((s) => s.painter);
  const online = useStore((s) => s.online);
  const location = useStore((s) => s.location);
  const canvases = useStore((s) => s.canvases);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const markDiscovered = useStore((s) => s.markDiscovered);

  const viewRef = useRef<ArPaintViewRef | null>(null);
  const engineRef = useRef<ReturnType<typeof useArSpray> | null>(null);
  const { pose } = usePose((m) => engineRef.current?.onShake(m));
  const mapCanvas = useRef<Canvas | null>(null); // canvas whose world map is loaded in the session
  const paintedThisSession = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [worldMapPath, setWorldMapPath] = useState<string | null>(null);
  const [tracking, setTracking] = useState<ArTrackingEvent>({ state: 'limited', reason: 'initializing' });
  const [surfaces, setSurfaces] = useState(0);
  const [justFound, setJustFound] = useState<Canvas | null>(null);
  const [mapState, setMapState] = useState<'none' | 'loading' | 'relocalizing' | 'resolved'>('none');

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
  const discovery = useDiscovery(pose, false);

  useVolumeTrigger(!settings.onScreenButtons, { onHoldStart: engine.start, onHoldEnd: engine.end });

  // Load the world map of the canvas you're standing at (once, and only before you paint here).
  useEffect(() => {
    if (!location || mapCanvas.current || paintedThisSession.current) return;
    let best: Canvas | null = null, bestD = Infinity;
    for (const c of Object.values(canvases)) {
      if (c.flagged || !c.world_map_path) continue;
      const d = haversineM(location.lat, location.lng, c.lat, c.lng);
      if (d < CANVAS_JOIN_RADIUS_M && d < bestD) { best = c; bestD = d; }
    }
    if (!best) return;
    mapCanvas.current = best;
    engine.activeCanvas.current = best;
    setMapState('loading');
    downloadWorldMap(best).then((p) => { if (p) setWorldMapPath(p); else { mapCanvas.current = null; setMapState('none'); } });
  }, [location?.lat, location?.lng, canvases]);

  // Strokes arriving live for the loaded canvas
  useEffect(() => onRemoteStroke((s: Stroke) => {
    const c = engine.activeCanvas.current;
    if (!c || s.canvas_id !== c.id || !s.anchor_id || !s.transform) return;
    if (s.author_id && s.author_id === painter?.id) return;
    viewRef.current?.addStrokes([{ id: s.id, anchorId: s.anchor_id, transform: s.transform, color: s.color, points: s.points as number[][] }]).catch(() => {});
  }), [painter?.id]);

  const onTracking = useCallback((e: { nativeEvent: ArTrackingEvent }) => {
    const ev = e.nativeEvent;
    if (ev.state === 'mapLoaded') {
      setMapState('relocalizing');
      const c = mapCanvas.current;
      const strokes = c ? (useStore.getState().strokes[c.id] ?? []).filter((s) => s.anchor_id && s.transform) : [];
      if (strokes.length) viewRef.current?.addStrokes(strokes.map((s) => ({ id: s.id, anchorId: s.anchor_id!, transform: s.transform!, color: s.color, points: s.points as number[][] }))).catch(() => {});
      return;
    }
    if (ev.state === 'mapLoadFailed') { setMapState('none'); mapCanvas.current = null; return; }
    setTracking(ev);
    if (ev.state === 'normal' && mapCanvas.current && mapState !== 'resolved' && worldMapPath) {
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

  const onHit = useCallback((e: { nativeEvent: { hit: boolean; distance: number; drip?: boolean } }) => {
    engine.hit.current = e.nativeEvent.hit;
    if (e.nativeEvent.drip && useStore.getState().settings.sound) import('../audio/sfx').then(({ sfx }) => sfx.pool());
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
  const mapText = mapState === 'loading' ? 'loading piece…' : mapState === 'relocalizing' ? 'look around to resolve the piece' : mapState === 'resolved' ? 'piece resolved' : '';
  const aimingAtNothing = engine.native.spraying && !engine.hit.current;

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
      <PaintMeters />
      <CanMeter />
      <DiscoveryOverlay d={{ ...discovery, justFound: justFound ?? discovery.justFound, walls: [] }} onReport={onReport} />
      <BlockerBanner blocker={ui.blocker} />
      {aimingAtNothing && !ui.blocker && (
        <View style={styles.banner} pointerEvents="none"><Text style={styles.bannerText}>Aim at a wall or floor — move the phone slowly so it finds the surface</Text></View>
      )}
      {settings.onScreenButtons && <HoldButtons onStart={engine.start} onEnd={engine.end} />}

      <View style={styles.topBar} pointerEvents="box-none">
        <Text style={styles.brand}>TAGGED</Text>
        <Text style={styles.status}>{painter?.name ?? '—'} · {online ? 'live' : 'offline'} · {trackingText}{mapText ? ` · ${mapText}` : ''}</Text>
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} style={styles.gear}><Text style={styles.gearText}>⚙︎</Text></Pressable>
      </View>
      {!settings.onScreenButtons && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>hold VOL+ / VOL− to spray · shake to charge</Text>
        </View>
      )}
      <View style={styles.debug} pointerEvents="none">
        <Text style={styles.debugText}>
          planes {tracking.planes ?? 0} · surfaces {surfaces} · hit {engine.hit.current ? 'yes' : 'no'} · held {ui.held} · block {ui.blocker ?? '-'} · gps {location ? `±${Math.round(location.accuracy)}m` : '…'} · map {tracking.mapping || '-'}
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
  debug: { position: 'absolute', bottom: 84, left: 12, right: 12, alignItems: 'center' },
  debugText: { color: '#ffffff99', fontSize: 9, textAlign: 'center' },
  hint: { position: 'absolute', bottom: 104, alignSelf: 'center', backgroundColor: '#0006', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  hintText: { color: '#ffffffcc', fontSize: 11 },
});
