import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { GEOFENCE } from '../config';
import { useStore } from '../store';
import { heatLevel, heatWeights } from '../lib/heat';
import { C, HEAT } from '../ui/theme';
import { rgb } from '../ui/color';
import type { Canvas } from '../types';

const rgba = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/**
 * Hot-zone map: every canvas glows in proportion to its recency-weighted activity (same model as the
 * widget), as three stepped rings in the theme's heat ramp — no soft gradients.
 */
export function HeatMap({ canvases, height = 190, interactive = false }: { canvases: Canvas[]; height?: number; interactive?: boolean }) {
  const loc = useStore((s) => s.location);
  const discovered = useStore((s) => s.discovered);
  const weights = useMemo(() => heatWeights(canvases), [canvases]);
  const region = useMemo(() => {
    const c = canvases[0];
    return { latitude: loc?.lat ?? c?.lat ?? GEOFENCE.lat, longitude: loc?.lng ?? c?.lng ?? GEOFENCE.lng, latitudeDelta: 0.014, longitudeDelta: 0.014 };
  }, [loc?.lat, loc?.lng, canvases.length]);
  return (
    <View style={[{ height }, interactive && StyleSheet.absoluteFill]}>
      <MapView style={StyleSheet.absoluteFill} userInterfaceStyle="dark" showsUserLocation initialRegion={region}
        scrollEnabled={interactive} zoomEnabled={interactive} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>
        {canvases.map((c) => {
          const w = weights[c.id] ?? 0.12;
          const lvl = heatLevel(w);
          const r = 40 + w * 160;
          return (
            <React.Fragment key={c.id}>
              <Circle center={{ latitude: c.lat, longitude: c.lng }} radius={r} strokeWidth={0} fillColor={rgba(HEAT[Math.max(1, lvl - 1)], 0.16)} />
              <Circle center={{ latitude: c.lat, longitude: c.lng }} radius={r * 0.62} strokeWidth={0} fillColor={rgba(HEAT[Math.max(1, lvl)], 0.28)} />
              <Circle center={{ latitude: c.lat, longitude: c.lng }} radius={r * 0.3} strokeWidth={2} strokeColor={C.ink} fillColor={rgba(HEAT[Math.max(1, lvl)], 0.75)} />
              {interactive && <Marker coordinate={{ latitude: c.lat, longitude: c.lng }} title={`${c.author_name} · ${c.stroke_count} strokes`} description={`${c.views} views${discovered[c.id] ? ' · found' : ''}`} pinColor={discovered[c.id] ? C.green : C.red} />}
            </React.Fragment>
          );
        })}
      </MapView>
    </View>
  );
}
