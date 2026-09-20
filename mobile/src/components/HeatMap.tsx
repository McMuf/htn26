import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { Region } from 'react-native-maps'; // type-only, so it is erased and never loads the module
import { GEOFENCE } from '../config';
import { useStore } from '../store';
import { heatLevel, heatWeights } from '../lib/heat';
import { renderHeat } from '../lib/heatImage';
import { C, HEAT, uiLabel } from '../ui/theme';
import { rgb } from '../ui/color';
import type { Canvas } from '../types';

const rgba = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/**
 * Google Maps on Android refuses to run without an API key - and it does not degrade, it throws
 * `RuntimeException: API key not found` while inflating the view, taking the whole app down the
 * moment you open Explore. Nothing reaches JS, so it reads as a random crash on a tab.
 *
 * iOS never hits this: react-native-maps uses Apple Maps there, which needs no key.
 *
 * So the map is only mounted when it can work, and Android without a key gets [PixelHeat] instead.
 * Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (see run-android.md) and the real map comes back;
 * app.config.js feeds the same variable into the manifest at prebuild time.
 */
const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAPS_OK = Platform.OS !== 'android' || !!MAPS_KEY;
// Required lazily so the module is not even resolved on the path where its view would crash.
const Maps = MAPS_OK ? require('react-native-maps') : null;

if (!MAPS_OK && __DEV__) {
  console.warn('[HeatMap] No EXPO_PUBLIC_GOOGLE_MAPS_API_KEY - using the pixel heat view. Google Maps would crash on Android without one.');
}

export function HeatMap({ canvases, height = 190, interactive = false }: { canvases: Canvas[]; height?: number; interactive?: boolean }) {
  return MAPS_OK
    ? <GoogleHeat canvases={canvases} height={height} interactive={interactive} />
    : <PixelHeat canvases={canvases} height={height} interactive={interactive} />;
}

type Props = { canvases: Canvas[]; height: number; interactive: boolean };

function GoogleHeat({ canvases, height, interactive }: Props) {
  const MapView = Maps.default, { Marker, Overlay } = Maps;
  const loc = useStore((s) => s.location);
  const discovered = useStore((s) => s.discovered);
  const weights = useMemo(() => heatWeights(canvases), [canvases]);
  const points = useMemo(() => canvases.map((c) => ({ lat: c.lat, lng: c.lng, w: weights[c.id] ?? 0.12 })), [canvases, weights]);
  const initial = useMemo<Region>(() => {
    const c = canvases[0];
    const d = interactive ? 0.02 : 0.014;
    return { latitude: loc?.lat ?? c?.lat ?? GEOFENCE.lat, longitude: loc?.lng ?? c?.lng ?? GEOFENCE.lng, latitudeDelta: d, longitudeDelta: d };
  }, [loc?.lat, loc?.lng, canvases.length, interactive]);
  const [region, setRegion] = useState<Region>(initial);
  useEffect(() => { if (!interactive) setRegion(initial); }, [initial, interactive]);
  // render a little wider than the viewport so panning doesn't show a hard edge before the next render
  const heat = useMemo(() => renderHeat(points, { ...region, latitudeDelta: region.latitudeDelta * 1.5, longitudeDelta: region.longitudeDelta * 1.5 }, interactive ? 192 : 128), [points, region, interactive]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSettle = (r: Region) => { if (pending.current) clearTimeout(pending.current); pending.current = setTimeout(() => setRegion(r), 150); };
  return (
    <View style={interactive ? styles.fill : { height }}>
      <MapView style={StyleSheet.absoluteFill} userInterfaceStyle="dark" showsUserLocation initialRegion={initial}
        onRegionChangeComplete={interactive ? onSettle : undefined}
        scrollEnabled={interactive} zoomEnabled={interactive} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}
        showsPointsOfInterests={false} showsBuildings={false} showsTraffic={false}>
        {heat && <Overlay image={{ uri: heat.uri }} bounds={heat.bounds} opacity={1} />}
        {interactive && canvases.map((c) => (
          <Marker key={c.id} coordinate={{ latitude: c.lat, longitude: c.lng }} title={`${c.author_name} · ${c.stroke_count} strokes`} description={`${c.views} views${discovered[c.id] ? ' · found' : ''}`} pinColor={discovered[c.id] ? C.green : C.purple} />
        ))}
      </MapView>
      {/* purple tint: colourise the dark tiles, then deepen the darks */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.deepen]} />
    </View>
  );
}

/** Metres per degree of latitude; longitude shrinks by cos(lat). Good enough over a campus. */
const M_PER_DEG = 111_320;
const D2R = Math.PI / 180;
/** Never zoom in past this, so two pieces a metre apart don't fly to opposite corners. */
const MIN_SPAN_M = 400;

/**
 * The map without tiles: pieces plotted on their real bearing and distance from where you stand,
 * as stepped pixel rings in the same heat ramp. Square, aliased and gridded on purpose — it reads
 * as radar rather than as a map that failed to load.
 */
function PixelHeat({ canvases, height, interactive }: Props) {
  const loc = useStore((s) => s.location);
  const discovered = useStore((s) => s.discovered);
  const weights = useMemo(() => heatWeights(canvases), [canvases]);
  const [box, setBox] = useState({ w: 0, h: height });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setBox((p) => (p.w === width && p.h === h ? p : { w: width, h }));
  };

  const centre = { lat: loc?.lat ?? canvases[0]?.lat ?? GEOFENCE.lat, lng: loc?.lng ?? canvases[0]?.lng ?? GEOFENCE.lng };

  /** Work in metres from the centre, then scale to fit the widest piece with a margin. */
  const plotted = useMemo(() => {
    const mPerLng = M_PER_DEG * Math.cos(centre.lat * D2R);
    const pts = canvases.map((c) => ({
      c,
      east: (c.lng - centre.lng) * mPerLng,
      north: (c.lat - centre.lat) * M_PER_DEG,
      w: weights[c.id] ?? 0.12,
    }));
    const reach = Math.max(MIN_SPAN_M / 2, ...pts.map((p) => Math.max(Math.abs(p.east), Math.abs(p.north)) * 1.25));
    return { pts, reach };
  }, [canvases, weights, centre.lat, centre.lng]);

  const { w, h } = box;
  const half = Math.min(w, h) / 2;
  const scale = half > 0 ? half / plotted.reach : 0;

  return (
    <View style={interactive ? styles.fill : { height }} onLayout={onLayout}>
      <View style={styles.pixelBg}>
        {/* range rings, so distance is readable without a scale bar */}
        {[1, 0.66, 0.33].map((f) => (
          <View key={f} pointerEvents="none" style={[styles.ring, {
            width: half * 2 * f, height: half * 2 * f, marginLeft: -half * f, marginTop: -half * f,
          }]} />
        ))}
        {scale > 0 && plotted.pts.map(({ c, east, north, w: weight }) => {
          const lvl = Math.max(1, heatLevel(weight));
          const size = Math.round(10 + weight * 22);
          const x = w / 2 + east * scale;
          const y = h / 2 - north * scale;
          // off the edge: pin to the rim so a distant piece still shows a direction
          const cx = Math.max(size, Math.min(w - size, x));
          const cy = Math.max(size, Math.min(h - size, y));
          const found = !!discovered[c.id];
          return (
            <React.Fragment key={c.id}>
              <View pointerEvents="none" style={[styles.blob, {
                left: cx - size, top: cy - size, width: size * 2, height: size * 2,
                backgroundColor: rgba(HEAT[Math.max(1, lvl - 1)], 0.22),
              }]} />
              <View pointerEvents="none" style={[styles.blob, {
                left: cx - size / 2, top: cy - size / 2, width: size, height: size,
                backgroundColor: rgba(HEAT[lvl], 0.55),
              }]} />
              <View pointerEvents="none" style={[styles.blob, {
                left: cx - 3, top: cy - 3, width: 6, height: 6,
                backgroundColor: found ? C.green : HEAT[lvl], borderWidth: 1, borderColor: C.ink,
              }]} />
            </React.Fragment>
          );
        })}
        {/* you, dead centre */}
        <View pointerEvents="none" style={[styles.me, { left: w / 2 - 5, top: h / 2 - 5 }]} />
        <Text style={styles.caption}>
          {canvases.length ? `${canvases.length} PIECE${canvases.length === 1 ? '' : 'S'} · ${Math.round(plotted.reach)} M OUT` : 'NOTHING PAINTED NEARBY YET'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Interactive = fill whatever it's given; an explicit height would beat absoluteFill's bottom. */
  fill: { flex: 1 },
  tint: { backgroundColor: '#3a1a8a', mixBlendMode: 'color' },
  deepen: { backgroundColor: C.bg, opacity: 0.45, mixBlendMode: 'multiply' },
  pixelBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg2, overflow: 'hidden' },
  ring: { position: 'absolute', left: '50%', top: '50%', borderWidth: 1, borderColor: C.line, opacity: 0.5 },
  blob: { position: 'absolute' },
  me: { position: 'absolute', width: 10, height: 10, backgroundColor: C.white, borderWidth: 2, borderColor: C.ink },
  caption: { position: 'absolute', left: 8, bottom: 6, ...uiLabel(9, 0.4), color: C.white, opacity: 0.7 },
});
