import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { hydrateStore, useStore } from './src/store';
import { useLocation } from './src/hooks/useLocation';
import { sfx } from './src/audio/sfx';
import { flushPending, loadCached, loadNearby, subscribeRealtime } from './src/data/sync';
import { NameScreen } from './src/screens/NameScreen';
import { PaintScreen } from './src/screens/PaintScreen';
import { MapScreen } from './src/screens/MapScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      await hydrateStore();
      await loadCached();
      await sfx.init();
      setReady(true);
    })();
  }, []);
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#0b0b0f' }} />;
  return <Root />;
}

function Root() {
  const painter = useStore((s) => s.painter);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const settings = useStore((s) => s.settings);
  const location = useStore((s) => s.location);
  useLocation();

  useEffect(() => { sfx.enabled = settings.sound; }, [settings.sound]);

  // backend: realtime + periodic nearby refresh + pending flush
  useEffect(() => {
    const unsub = subscribeRealtime();
    const id = setInterval(() => {
      const l = useStore.getState().location;
      if (l) loadNearby(l.lat, l.lng);
      flushPending();
    }, 15000);
    return () => { unsub(); clearInterval(id); };
  }, []);
  const firstFix = !!location;
  useEffect(() => { if (location) loadNearby(location.lat, location.lng); }, [firstFix]);

  if (!painter) return <><NameScreen /><StatusBar style="light" /></>;

  return (
    <View style={styles.root}>
      {tab === 'paint' && <PaintScreen />}
      {tab === 'map' && <MapScreen />}
      {tab === 'board' && <LeaderboardScreen />}
      <SettingsScreen />
      <View style={styles.tabs}>
        {([['paint', 'PAINT'], ['map', 'MAP'], ['board', 'BOARD']] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
            <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f' },
  tabs: { position: 'absolute', bottom: 34, alignSelf: 'center', flexDirection: 'row', backgroundColor: '#000c', borderRadius: 26, padding: 4, gap: 4 },
  tab: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22 },
  tabOn: { backgroundColor: '#ff2d95' },
  tabText: { color: '#ffffffaa', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  tabTextOn: { color: '#fff' },
});
