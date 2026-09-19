import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { hydrateStore, useStore } from './src/store';
import { useLocation } from './src/hooks/useLocation';
import { sfx } from './src/audio/sfx';
import { fetchPainter, flushPending, loadCached, loadNearby, subscribeRealtime } from './src/data/sync';
import { supabase } from './src/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AuthScreen } from './src/screens/AuthScreen';
import { NameScreen } from './src/screens/NameScreen';
import { PaintScreen } from './src/screens/PaintScreen';
import { ArPaintScreen } from './src/screens/ArPaintScreen';
import { isArSupported } from './modules/ar-paint';
import { startWidgetSync } from './src/lib/widget';
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
  const setPainter = useStore((s) => s.setPainter);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [checkedFor, setCheckedFor] = useState<string | null>(null); // painter row looked up for this uid
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  // keep the persisted painter in sync with whoever is signed in
  useEffect(() => {
    if (!session) { if (session === null && painter) setPainter(null); return; }
    if (painter?.id === session.user.id) { setCheckedFor(session.user.id); return; }
    fetchPainter(session.user.id).then((p) => { setPainter(p); setCheckedFor(session.user.id); }).catch(() => setCheckedFor(session.user.id));
  }, [session?.user.id]);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const settings = useStore((s) => s.settings);
  const location = useStore((s) => s.location);
  useLocation();

  useEffect(() => { sfx.enabled = settings.sound; }, [settings.sound]);
  useEffect(() => startWidgetSync(), []);

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

  if (session === undefined) return <View style={{ flex: 1, backgroundColor: '#0b0b0f' }} />;
  if (!session) return <><AuthScreen /><StatusBar style="light" /></>;
  if (!painter || painter.id !== session.user.id) {
    if (checkedFor !== session.user.id) return <View style={{ flex: 1, backgroundColor: '#0b0b0f' }} />; // don't flash the tag prompt for returning users
    return <><NameScreen userId={session.user.id} /><StatusBar style="light" /></>;
  }

  return (
    <View style={styles.root}>
      {tab === 'paint' && (isArSupported ? <ArPaintScreen /> : <PaintScreen />)}
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
