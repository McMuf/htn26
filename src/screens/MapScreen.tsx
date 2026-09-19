import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { GEOFENCE } from '../config';
import { useStore } from '../store';
import { fetchAllCanvases } from '../data/sync';
import type { Canvas } from '../types';
import { timeAgo } from '../components/DiscoveryOverlay';

export function MapScreen() {
  const loc = useStore((s) => s.location);
  const local = useStore((s) => s.canvases);
  const discovered = useStore((s) => s.discovered);
  const [remote, setRemote] = useState<Canvas[]>([]);
  useEffect(() => { fetchAllCanvases().then(setRemote).catch(() => {}); }, []);
  const all = new Map<string, Canvas>();
  for (const c of remote) all.set(c.id, c);
  for (const c of Object.values(local)) all.set(c.id, c);
  const canvases = [...all.values()].filter((c) => !c.flagged);

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFill}
        userInterfaceStyle="dark"
        showsUserLocation
        initialRegion={{ latitude: loc?.lat ?? GEOFENCE.lat, longitude: loc?.lng ?? GEOFENCE.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }}>
        <Circle center={{ latitude: GEOFENCE.lat, longitude: GEOFENCE.lng }} radius={GEOFENCE.radiusM} strokeColor="#ff2d9566" fillColor="#ff2d9511" />
        {canvases.map((c) => (
          <Marker key={c.id} coordinate={{ latitude: c.lat, longitude: c.lng }} title={`${c.author_name} · ${c.stroke_count} strokes`} description={`${c.views} views · ${timeAgo(c.created_at)}`}
            pinColor={discovered[c.id] ? '#7cff3a' : '#ff2d95'} />
        ))}
      </MapView>
      <View style={styles.chip}><Text style={styles.chipText}>{canvases.length} pieces · pink = undiscovered · green = found</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f' },
  chip: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: '#000a', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
