import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { Region } from 'react-native-maps'; // type-only, so it is erased and never loads the module
import { GEOFENCE } from '../config';
import { useStore } from '../store';
import { heatWeights } from '../lib/heat';
import { renderHeat } from '../lib/heatImage';
import { C, uiLabel } from '../ui/theme';
import type { Canvas } from '../types';

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

/** Metres per degree of latitude; longitude shrinks by cos(lat). Matches lib/heatImage. */
const M_PER_LAT = 110574, M_PER_LNG_EQ = 111320;
const D2R = Math.PI / 180;
/** Never zoom in past this, so two pieces a metre apart don't fill the screen. */
const MIN_REACH_M = 200;

/**
 * The same heat, with no tiles under it.
 *
 * It renders through [renderHeat], exactly as the map does, so Android-without-a-key gets the
 * design rather than a substitute for it: the same gaussians, the same quantised purple→green
 * ramp, the same dithered edges, under the same tint layers. What it cannot borrow is the map's
 * sense of scale, so it supplies its own — range rings and a caption — because without tiles
 * there is otherwise nothing on screen to say whether a blob is ten metres away or a kilometre.
 *
 * The heat image is square in metres, so it is laid out square at the container's larger side and
 * centred. Stretching it to a non-square container would shear the gaussians.
 */
function PixelHeat({ canvases, height, interactive }: Props) {
  const loc = useStore((s) => s.location);
  const weights = useMemo(() => heatWeights(canvases), [canvases]);
  const [box, setBox] = useState({ w: 0, h: height });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setBox((p) => (p.w === width && p.h === h ? p : { w: width, h }));
  };

  const lat = loc?.lat ?? canvases[0]?.lat ?? GEOFENCE.lat;
  const lng = loc?.lng ?? canvases[0]?.lng ?? GEOFENCE.lng;

  /** A square region centred on you, wide enough to hold every piece with room to spare. */
  const { region, reach } = useMemo(() => {
    const cosLat = Math.cos(lat * D2R);
    const reach = Math.max(MIN_REACH_M, ...canvases.map((c) =>
      Math.hypot((c.lng - lng) * M_PER_LNG_EQ * cosLat, (c.lat - lat) * M_PER_LAT) * 1.25));
    return {
      reach,
      region: {
        latitude: lat, longitude: lng,
        latitudeDelta: (2 * reach) / M_PER_LAT,
        longitudeDelta: (2 * reach) / (M_PER_LNG_EQ * cosLat),
      },
    };
  }, [lat, lng, canvases]);

  const points = useMemo(() => canvases.map((c) => ({ lat: c.lat, lng: c.lng, w: weights[c.id] ?? 0.12 })), [canvases, weights]);
  const heat = useMemo(() => renderHeat(points, region, interactive ? 192 : 128), [points, region, interactive]);

  const { w, h } = box;
  const side = Math.max(w, h);
  const half = Math.min(w, h) / 2;

  return (
    <View style={interactive ? styles.fill : { height }} onLayout={onLayout}>
      <View style={styles.noMapBg}>
        {heat ? (
          <Image
            source={{ uri: heat.uri }}
            style={{ position: 'absolute', left: (w - side) / 2, top: (h - side) / 2, width: side, height: side }}
            resizeMode="stretch"
          />
        ) : null}
        {/* range rings: the scale cue the tiles would otherwise give */}
        {[1, 0.66, 0.33].map((f) => (
          <View key={f} pointerEvents="none" style={[styles.ring, {
            width: half * 2 * f, height: half * 2 * f, marginLeft: -half * f, marginTop: -half * f,
          }]} />
        ))}
        <View pointerEvents="none" style={[styles.me, { left: w / 2 - 5, top: h / 2 - 5 }]} />
        <Text style={styles.caption}>
          {canvases.length ? `${canvases.length} PIECE${canvases.length === 1 ? '' : 'S'} · ${Math.round(reach)} M OUT` : 'NOTHING PAINTED NEARBY YET'}
        </Text>
      </View>
      {/* the same two tint layers the map wears, so both routes read as one design */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.deepen]} />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Interactive = fill whatever it's given; an explicit height would beat absoluteFill's bottom. */
  fill: { flex: 1 },
  tint: { backgroundColor: '#3a1a8a', mixBlendMode: 'color' },
  deepen: { backgroundColor: C.bg, opacity: 0.45, mixBlendMode: 'multiply' },
  noMapBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg2, overflow: 'hidden' },
  ring: { position: 'absolute', left: '50%', top: '50%', borderWidth: 1, borderColor: C.line, opacity: 0.5 },
  me: { position: 'absolute', width: 10, height: 10, backgroundColor: C.white, borderWidth: 2, borderColor: C.ink },
  caption: { position: 'absolute', left: 8, bottom: 6, ...uiLabel(9, 0.4), color: C.white, opacity: 0.7 },
});
