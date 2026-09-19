import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Btn } from '../ui/kit';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { PaintLayer } from '../paint/PaintLayer';
import { usePose } from '../hooks/usePose';
import { useSprayEngine, type Blocker } from '../hooks/useSprayEngine';
import { useVolumeTrigger } from '../hooks/useVolumeTrigger';
import { useDiscovery } from '../hooks/useDiscovery';
import { BlockerBanner, CanMeter, HoldButtons, PaintMeters, Reticle, TopBar } from '../components/HUD';
import { PixelBox } from '../ui/PixelBox';
import { F, HOLD_TOP } from '../ui/theme';
import { DiscoveryOverlay } from '../components/DiscoveryOverlay';
import { useStore } from '../store';
import { reportCanvas } from '../data/sync';

/**
 * AR APPROACH — geo-anchored canvases (rung 2 of the fallback ladder), chosen deliberately:
 *  - True plane-anchored ARKit via Viro would need a native AR module fighting a brand-new
 *    RN/Expo SDK, and world-anchor sharing across phones (ARWorldMap/cloud anchors) is a
 *    multi-day problem on its own. Not a 36-hour bet.
 *  - So a canvas = a virtual cylindrical wall around the spot where its author stood, keyed
 *    by GPS. Paint lives in angular coordinates (compass yaw, pitch). Sensor fusion (gyro +
 *    magnetometer + gravity) gives a smooth camera pose, so as you turn the phone the paint
 *    stays glued to the direction you sprayed it — it reads as "on the wall" from where the
 *    painter stood, and anyone standing within ~15 m sees the same piece in the same direction.
 *  - Tradeoff: parallax. Step 5 m sideways and the paint drifts relative to the real wall
 *    (it's anchored to a direction, not a surface). GPS jitter (~3-5 m) also means two phones
 *    a few metres apart see slightly offset paint. For a campus-scale r/place demo that's
 *    acceptable; the README lists what real plane anchoring would fix.
 */
export function PaintScreen() {
  useKeepAwake();
  const [perm, requestPerm] = useCameraPermissions();
  const settings = useStore((s) => s.settings);
  const painter = useStore((s) => s.painter);
  const online = useStore((s) => s.online);
  const location = useStore((s) => s.location);
  const setTab = useStore((s) => s.setTab);
  const debug = useStore((s) => s.debug);
  const setDebug = useStore((s) => s.setDebug);
  const engineRef = useRef<ReturnType<typeof useSprayEngine> | null>(null);
  const { yawSV, pitchSV, rollSV, pose } = usePose((m) => engineRef.current?.onShake(m));
  const engine = useSprayEngine(pose);
  engineRef.current = engine;
  const discovery = useDiscovery(pose);
  const discoveryRef = useRef(discovery);
  discoveryRef.current = discovery;

  useVolumeTrigger(settings.volumeButtons, { onHoldStart: engine.start, onHoldEnd: engine.end });

  // cheap UI poll for spray state (engine runs off refs to stay at 30Hz without re-rendering)
  const [ui, setUi] = useState<{ spraying: boolean; blocker: Blocker; yaw: number }>({ spraying: false, blocker: null, yaw: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const spraying = engine.sprayingNow.current && !engine.blocker.current;
      const blocker = engine.held.current ? engine.blocker.current : null;
      const yaw = Math.round(pose.current.yaw);
      setUi((p) => (p.spraying === spraying && p.blocker === blocker && p.yaw === yaw ? p : { spraying, blocker, yaw }));
      const d = useStore.getState().debug;
      const held = engine.held.current ?? '-';
      const bl = engine.blocker.current ?? '-';
      if (d.held !== held || d.blocker !== bl || d.walls !== discoveryRef.current.walls.length || d.poseReady !== pose.current.ready)
        setDebug({ held, blocker: bl, walls: discoveryRef.current.walls.length, poseReady: pose.current.ready });
    }, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { if (perm && !perm.granted && perm.canAskAgain) requestPerm(); }, [perm]);

  const onReport = useCallback((id: string) => {
    Alert.alert('Report this piece?', 'Two reports hide a piece for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => reportCanvas(id, painter?.id ?? null, 'inappropriate') },
    ]);
  }, [painter]);

  if (!perm?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>Camera permission is needed to paint.</Text>
        <Btn label="ALLOW CAMERA" tone="green" onPress={requestPerm} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" animateShutter={false} mute />
      <PaintLayer yawSV={yawSV} pitchSV={pitchSV} rollSV={rollSV} walls={discovery.walls} />
      <Reticle spraying={ui.spraying} />
      <PaintMeters />
      <CanMeter />
      <DiscoveryOverlay d={discovery} onReport={onReport} />
      <BlockerBanner blocker={ui.blocker} />
      <HoldButtons onStart={engine.start} onEnd={engine.end} />
      <View style={styles.hint} pointerEvents="none">
        <PixelBox fill="#120a2e" hi="#2a1c5c" depth={3} contentStyle={{ paddingHorizontal: 12, height: 30, justifyContent: 'center' }}>
          <Text style={styles.hintText}>{settings.volumeButtons ? 'HOLD THE BUTTONS OR VOL+ / VOL− · SHAKE TO CHARGE' : 'HOLD THE BUTTONS · SHAKE TO CHARGE'}</Text>
        </PixelBox>
      </View>
      <TopBar status={`${(painter?.name ?? '—').toUpperCase()} · ${online ? 'LIVE' : 'OFFLINE'} · ${ui.yaw}°`} toolsOn={false} onTools={() => {}} onSettings={() => setTab('settings')} />
      {settings.debugHud && (
        <View style={styles.debug} pointerEvents="none">
          <Text style={styles.debugText}>
            vol events {debug.volEvents} (last {debug.lastVol}) · held {debug.held} · block {debug.blocker} · walls {debug.walls} · pose {debug.poseReady ? 'ok' : '…'} · gps {location ? `±${Math.round(location.accuracy)}m` : '…'} · surface {debug.surface}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#12082b', padding: 24, gap: 16 },
  msg: { fontFamily: F.body, color: '#fff', fontSize: 16, textAlign: 'center' },
  debug: { position: 'absolute', top: 108, left: 12, right: 12, alignItems: 'center' },
  debugText: { fontFamily: F.mono, fontSize: 14, color: '#ffffffcc', textAlign: 'center', backgroundColor: '#000a' },
  hint: { position: 'absolute', bottom: HOLD_TOP + 8, alignSelf: 'center' },
  hintText: { fontFamily: F.labelBold, fontSize: 8, color: '#ffffffcc', letterSpacing: 0.6 },
});
