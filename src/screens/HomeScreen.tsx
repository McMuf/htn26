import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Glass } from '../ui/Glass';
import { C, DOCK_INSET } from '../ui/theme';
import { useStore, type Side } from '../store';
import { PAINT_MAX, PAINT_REGEN_PER_SEC, SHAKE_ACCEL_THRESHOLD, SHAKE_GAIN_PER_EVENT, SHAKE_MIN_TO_SPRAY } from '../config';
import { sfx } from '../audio/sfx';

export function HomeScreen() {
  const painter = useStore((s) => s.painter);
  const paint = useStore((s) => s.paint);
  const shake = useStore((s) => s.shake);
  const settings = useStore((s) => s.settings);
  const strokes = useStore((s) => s.strokes);
  const online = useStore((s) => s.online);
  const setTab = useStore((s) => s.setTab);
  const stats = useMemo(() => dailyStats(Object.values(strokes).flat(), painter?.id), [strokes, painter?.id]);
  const low = shake < SHAKE_MIN_TO_SPRAY;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#160a24', C.bg, C.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: DOCK_INSET }]}>
        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: settings.avatarColor }]}><Text style={styles.avatarText}>{(painter?.name?.[0] ?? 'F').toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>{painter?.name ?? 'painter'}</Text>
            <Text style={styles.subtle}>{online ? '● live · Waterloo' : '○ offline · queued uploads retry'}</Text>
          </View>
          <Text style={styles.brand}>FRESCO</Text>
        </View>

        {/* spray can status */}
        <Glass style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>SPRAY CAN</Text>
            <Text style={[styles.badge, { color: low ? C.orange : C.lime }]}>{low ? 'NEEDS A SHAKE' : 'READY'}</Text>
          </View>
          <View style={styles.canRow}>
            <View style={styles.canBody}>
              <View style={styles.canNozzle} />
              <View style={styles.canTube}><View style={[styles.canFill, { height: `${Math.round(shake * 100)}%`, backgroundColor: low ? C.orange : C.lime }]} /></View>
            </View>
            <View style={{ flex: 1, gap: 10 }}>
              <Gauge side="A" label="VOL+ · A" color={settings.optionA.color} value={paint.A} cap={settings.optionA.cap} />
              <Gauge side="B" label="VOL− · B" color={settings.optionB.color} value={paint.B} cap={settings.optionB.cap} />
              <Text style={styles.subtle}>charge {Math.round(shake * 100)}% · decays over a minute of use</Text>
            </View>
          </View>
          <Pressable onPress={() => setTab('create')} style={styles.cta}><Text style={styles.ctaText}>OPEN THE CAN →</Text></Pressable>
        </Glass>

        <ShakeTest />

        {/* daily stats */}
        <Glass style={styles.card}>
          <Text style={styles.label}>TODAY</Text>
          <View style={styles.statRow}>
            <Stat n={stats.strokes} l="strokes" />
            <Stat n={stats.pieces} l="pieces" />
            <Stat n={Math.round(stats.paint)} l="paint" />
            <Stat n={stats.streak} l="day streak" />
          </View>
          <Text style={styles.subtle}>all time: {painter?.strokes ?? 0} strokes · {Math.round(painter?.paint_used ?? 0)} paint</Text>
        </Glass>
      </ScrollView>
    </View>
  );
}

function Gauge({ label, color, value, cap }: { side: Side; label: string; color: string; value: number; cap: string }) {
  const frac = value / PAINT_MAX;
  const secs = Math.ceil((PAINT_MAX - value) / PAINT_REGEN_PER_SEC);
  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={styles.gaugeLabel}>{label} · <Text style={{ color }}>{cap}</Text></Text>
        <Text style={styles.gaugeTime}>{frac >= 0.995 ? 'full' : `refill in ${secs}s`}</Text>
      </View>
      <View style={styles.gaugeBg}><View style={[styles.gaugeFill, { width: `${Math.max(2, frac * 100)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <View style={styles.stat}><Text style={styles.statN}>{n}</Text><Text style={styles.statL}>{l}</Text></View>;
}

/** Live accelerometer readout: shake the phone, the bar spikes and the can charges. */
function ShakeTest() {
  const [g, setG] = useState(0);
  const [peak, setPeak] = useState(0);
  const [hits, setHits] = useState(0);
  const lastHit = useRef(0);
  useEffect(() => {
    DeviceMotion.setUpdateInterval(33);
    const sub = DeviceMotion.addListener((m) => {
      const a = m.acceleration; if (!a) return;
      const mag = Math.hypot(a.x, a.y, a.z) / 9.81;
      setG(mag); setPeak((p) => Math.max(p * 0.995, mag));
      const now = Date.now();
      if (mag > SHAKE_ACCEL_THRESHOLD && now - lastHit.current > 120) {
        lastHit.current = now;
        const st = useStore.getState();
        st.setShake(Math.min(1, st.shake + SHAKE_GAIN_PER_EVENT * Math.min(2, mag / 2.4)));
        if (st.settings.sound) sfx.rattle(Math.min(1, mag / 4));
        if (st.settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        setHits((h) => h + 1);
      }
    });
    return () => sub.remove();
  }, []);
  const frac = Math.min(1, g / 4);
  return (
    <Glass style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>SHAKE TEST</Text>
        <Text style={styles.subtle}>{hits} rattles</Text>
      </View>
      <View style={styles.gaugeBg}>
        <View style={[styles.gaugeFill, { width: `${Math.max(1, frac * 100)}%`, backgroundColor: g > SHAKE_ACCEL_THRESHOLD ? C.lime : C.cyan }]} />
        <View style={[styles.tick, { left: `${(SHAKE_ACCEL_THRESHOLD / 4) * 100}%` }]} />
      </View>
      <Text style={styles.subtle}>{g.toFixed(2)} g now · peak {peak.toFixed(2)} g · threshold {SHAKE_ACCEL_THRESHOLD} g — shake it like a can</Text>
    </Glass>
  );
}

function dailyStats(all: { author_id: string | null; created_at: string; paint_used: number; canvas_id: string }[], me?: string) {
  const mine = me ? all.filter((s) => s.author_id === me) : [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = mine.filter((s) => new Date(s.created_at) >= start);
  const days = new Set(mine.map((s) => s.created_at.slice(0, 10)));
  let streak = 0; const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  return { strokes: today.length, pieces: new Set(today.map((s) => s.canvas_id)).size, paint: today.reduce((a, s) => a + s.paint_used, 0), streak };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 18, paddingTop: 66, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#000', fontWeight: '900', fontSize: 20 },
  hello: { color: '#fff', fontWeight: '900', fontSize: 20 },
  brand: { color: C.faint, fontWeight: '900', letterSpacing: 4, fontSize: 12 },
  card: { padding: 16, gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: C.yellow, fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  badge: { fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  subtle: { color: C.faint, fontSize: 12 },
  canRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  canBody: { alignItems: 'center' },
  canNozzle: { width: 12, height: 12, backgroundColor: '#ddd', borderRadius: 3, marginBottom: 3 },
  canTube: { width: 34, height: 96, borderRadius: 10, backgroundColor: '#ffffff18', borderWidth: 1, borderColor: '#ffffff44', justifyContent: 'flex-end', overflow: 'hidden' },
  canFill: { width: '100%' },
  gaugeLabel: { color: '#fff', fontWeight: '800', fontSize: 12 },
  gaugeTime: { color: C.dim, fontSize: 11 },
  gaugeBg: { height: 10, borderRadius: 5, backgroundColor: '#ffffff18', overflow: 'hidden', marginTop: 4 },
  gaugeFill: { height: '100%', borderRadius: 5 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  cta: { backgroundColor: C.pink, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statN: { color: '#fff', fontWeight: '900', fontSize: 26 },
  statL: { color: C.faint, fontSize: 11, fontWeight: '700' },
});
