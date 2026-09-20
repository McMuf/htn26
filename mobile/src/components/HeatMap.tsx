import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Overlay, type Region } from 'react-native-maps';
import { GEOFENCE } from '../config';
import { useStore } from '../store';
import { heatWeights } from '../lib/heat';
import { renderHeat } from '../lib/heatImage';
import { C } from '../ui/theme';
import type { Canvas } from '../types';

/**
 * Hot-zone map: a dark purple map (Apple's dark tiles, tinted through blend layers) with the
 * recency-weighted activity of every piece burned in as chunky purple→green heat (same model as the
 * widget). The heat is rendered by us (react-native-maps' Heatmap is Google-only on iOS) as an
 * image overlay that re-renders when the region settles.
 */
export function HeatMap({ canvases, height = 190, interactive = false }: { canvases: Canvas[]; height?: number; interactive?: boolean }) {
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

const styles = StyleSheet.create({
  /** Interactive = fill whatever it's given; an explicit height would beat absoluteFill's bottom. */
  fill: { flex: 1 },
  tint: { backgroundColor: '#3a1a8a', mixBlendMode: 'color' },
  deepen: { backgroundColor: C.bg, opacity: 0.45, mixBlendMode: 'multiply' },
});
