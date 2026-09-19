import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { PixelBox } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelCan } from '../ui/PixelCan';
import { Avatar, Btn, Header, Panel, Pill, SegBar, Screen, T, Tile } from '../ui/kit';
import { C, F, outline } from '../ui/theme';
import { useStore } from '../store';
import { PAINT_MAX, PAINT_REGEN_PER_SEC, SHAKE_ACCEL_THRESHOLD, SHAKE_GAIN_PER_EVENT, SHAKE_MIN_TO_SPRAY } from '../config';
import { CREWS, MISSIONS, coinsOf, dayKey, dayStats, skinColor } from '../lib/economy';
import { sfx } from '../audio/sfx';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function HomeScreen() {
  const painter = useStore((s) => s.painter);
  const paint = useStore((s) => s.paint);
  const shake = useStore((s) => s.shake);
  const settings = useStore((s) => s.settings);
  const strokes = useStore((s) => s.strokes);
  const online = useStore((s) => s.online);
  const setTab = useStore((s) => s.setTab);
  const stats = useMemo(() => dayStats(Object.values(strokes).flat(), painter?.id), [strokes, painter?.id]);
  const coins = coinsOf(painter, settings);
  const crew = CREWS.find((c) => c.id === settings.crew);
  const low = shake < SHAKE_MIN_TO_SPRAY;

  return (
    <Screen tone="purple">
      <View style={styles.head}>
        <Avatar name={painter?.name} color={settings.avatarColor} size={52} />
        <View style={{ flex: 1 }}>
          <T v="h" numberOfLines={1}>{painter?.name ?? 'painter'}</T>
          <T v="small">{crew ? crew.name : 'NO CREW'} · {online ? 'LIVE' : 'OFFLINE'}</T>
        </View>
        <Pill icon="flame" value={stats.streak} iconColor={C.orange} alt="#ffd21f" />
        <Pill icon="coin" value={coins} iconColor={C.yellow} alt="#c48f00" />
      </View>

      <Panel title="SPRAY CAN" right={<T v="label" color={low ? C.red : C.greenHi}>{low ? 'NEEDS A SHAKE' : 'READY'}</T>}>
        <View style={styles.canRow}>
          <View style={styles.canBox}>
            <PixelCan color={skinColor(settings.canSkin, settings.optionA.color)} level={paint.A / PAINT_MAX} cell={5} wobble={low} />
          </View>
          <View style={{ flex: 1, gap: 12 }}>
            <Gauge label={`A · ${settings.optionA.cap.toUpperCase()} CAP`} color={settings.optionA.color} value={paint.A} />
            <Gauge label={`B · ${settings.optionB.cap.toUpperCase()} CAP`} color={settings.optionB.color} value={paint.B} />
            <View style={{ gap: 4 }}>
              <View style={styles.rowBetween}>
                <T v="label" color={C.white}>PRESSURE</T>
                <T v="small">{Math.round(shake * 100)}%</T>
              </View>
              <SegBar value={shake} color={low ? C.orange : C.greenHi} />
            </View>
          </View>
        </View>
        <Btn label="OPEN THE CAN" icon="create" tone="green" size="lg" onPress={() => setTab('create')} />
      </Panel>

      <Missions stats={stats} />
      <ShakeTest />

      <Panel title="TODAY">
        <View style={styles.tiles}>
          <Tile n={stats.strokes} label="strokes" />
          <Tile n={stats.pieces} label="walls" />
          <Tile n={stats.paint} label="paint" />
        </View>
        <T v="small">all time · {painter?.strokes ?? 0} strokes · {Math.round(painter?.paint_used ?? 0)} paint sprayed</T>
      </Panel>
    </Screen>
  );
}

function Gauge({ label, color, value }: { label: string; color: string; value: number }) {
  const secs = Math.ceil((PAINT_MAX - value) / PAINT_REGEN_PER_SEC);
  const full = value / PAINT_MAX >= 0.995;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.rowBetween}>
        <T v="label" color={C.white}>{label}</T>
        <T v="small">{full ? 'FULL' : `FULL IN ${mmss(secs)}`}</T>
      </View>
      <SegBar value={value / PAINT_MAX} color={color} />
    </View>
  );
}

/** Daily missions in the Subway Surfers layout: goal, progress box and a claim strip. */
function Missions({ stats }: { stats: ReturnType<typeof dayStats> }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const day = dayKey();
  return (
    <Panel title="DAILY MISSIONS" tone="blue" right={<PixelIcon name="star" size={24} color={C.yellow} alt="#c48f00" />}>
      {MISSIONS.map((m) => {
        const key = `${day}:${m.id}`;
        const got = Math.min(m.goal, m.get(stats));
        const done = got >= m.goal;
        const claimed = !!settings.claimed[key];
        const [pre, post] = m.title.split('{n}');
        return (
          <PixelBox key={m.id} fill="#1f4fa8" hi="#2b63c8" lo="#173f88" depth={3} contentStyle={{ padding: 10, gap: 8 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.mTitle}>{pre}<Text style={{ color: C.yellow }}>{m.hot}</Text>{post}</Text>
              <PixelBox fill="#12306b" depth={0} bw={3} n={3} contentStyle={{ paddingHorizontal: 10, height: 30, justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.display, fontSize: 16, color: '#fff' }}>{got}/{m.goal}</Text>
              </PixelBox>
            </View>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <PixelIcon name="coin" size={24} color={C.yellow} alt="#c48f00" />
                <Text style={{ fontFamily: F.display, fontSize: 16, color: C.yellow }}>+{m.reward}</Text>
              </View>
              {claimed ? <T v="label" color={C.greenHi}>CLAIMED</T> : (
                <Btn label={done ? 'CLAIM' : 'IN PROGRESS'} tone={done ? 'green' : 'dark'} size="sm" disabled={!done} onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  setSettings({ claimed: { ...settings.claimed, [key]: true }, bonus: settings.bonus + m.reward });
                }} />
              )}
            </View>
          </PixelBox>
        );
      })}
    </Panel>
  );
}

/** Live accelerometer readout: shake the phone, the meter spikes and the can charges. */
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
  const over = g > SHAKE_ACCEL_THRESHOLD;
  return (
    <Panel title="SHAKE TEST" right={<T v="small">{hits} rattles</T>}>
      <SegBar value={Math.min(1, g / 4)} color={over ? C.greenHi : C.blueHi} segs={16} />
      <Text style={styles.mono}>{g.toFixed(2)}G NOW · PEAK {peak.toFixed(2)}G · NEED {SHAKE_ACCEL_THRESHOLD}G</Text>
      <T v="small">Shake the phone like a real can. The rattle charges your pressure.</T>
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  canRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  canBox: { width: 112, height: 150, alignItems: 'center', justifyContent: 'center', backgroundColor: '#150a36', borderWidth: 3, borderColor: C.ink },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tiles: { flexDirection: 'row', gap: 8 },
  mTitle: { flex: 1, fontFamily: F.display, fontSize: 17, color: '#fff', ...outline('#173f88') },
  mono: { fontFamily: F.mono, fontSize: 20, color: C.phosphor },
});
