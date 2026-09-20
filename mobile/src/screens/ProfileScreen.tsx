import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PixelBox } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelCan } from '../ui/PixelCan';
import { Avatar, Btn, Gauge, IconBtn, Panel, Pill, Screen, SegBar, T, Tile } from '../ui/kit';
import { haptic } from '../ui/haptics';
import { C, F, TONES, outline } from '../ui/theme';
import { useStore } from '../store';
import { PAINT_MAX, PAINT_REGEN_PER_SEC, SHAKE_MIN_TO_SPRAY } from '../config';
import { CREWS, MISSIONS, coinsOf, colorName, dayKey, dayStats, skinColor } from '../lib/economy';

export function ProfileScreen() {
  const painter = useStore((s) => s.painter);
  const paint = useStore((s) => s.paint);
  const shake = useStore((s) => s.shake);
  const settings = useStore((s) => s.settings);
  const strokes = useStore((s) => s.strokes);
  const online = useStore((s) => s.online);
  const setTab = useStore((s) => s.setTab);
  const setSheet = useStore((s) => s.setSheet);
  const stats = useMemo(() => dayStats(Object.values(strokes).flat(), painter?.id), [strokes, painter?.id]);
  const coins = coinsOf(painter, settings);
  const crew = CREWS.find((c) => c.id === settings.crew);
  const low = shake < SHAKE_MIN_TO_SPRAY;

  return (
    <Screen>
      <View style={styles.head}>
        <Avatar name={painter?.name} color={settings.avatarColor} size={52} />
        <View style={{ flex: 1 }}>
          <T v="h" numberOfLines={1}>{painter?.name ?? 'painter'}</T>
          <T v="small">{crew ? crew.name : 'NO CREW'} · {online ? 'LIVE' : 'OFFLINE'}</T>
        </View>
        <Pill icon="coin" value={coins} onPress={() => setSheet('market')} />
        <IconBtn icon="settings" onPress={() => setSheet('settings')} />
      </View>

      <Panel title="SPRAY CAN" right={<T v="label" color={low ? C.red : C.greenHi}>{low ? 'NEEDS A SHAKE' : 'READY'}</T>}>
        <View style={styles.canRow}>
          <View style={styles.canBox}>
            <PixelCan color={skinColor(settings.canSkin, settings.optionA.color)} level={paint.A / PAINT_MAX} cell={5} wobble={low} />
          </View>
          <View style={{ flex: 1, gap: 12 }}>
            <Gauge label={colorName(settings.optionA.color)} color={settings.optionA.color} value={paint.A} max={PAINT_MAX} regenPerSec={PAINT_REGEN_PER_SEC} />
            <Gauge label={colorName(settings.optionB.color)} color={settings.optionB.color} value={paint.B} max={PAINT_MAX} regenPerSec={PAINT_REGEN_PER_SEC} />
            <View style={{ gap: 4 }}>
              <View style={styles.rowBetween}>
                <T v="eyebrow">PRESSURE</T>
                <T v="small">{Math.round(shake * 100)}%</T>
              </View>
              <SegBar value={shake} color={low ? C.red : C.greenHi} />
            </View>
          </View>
        </View>
        <Btn label="GO PAINT" icon="create" tone="green" size="lg" onPress={() => setTab('create')} />
      </Panel>

      <Missions stats={stats} />

      <Panel title="MARKET" right={<T v="eyebrow">{coins} COINS</T>}>
        <T v="sub">New paints and can skins. Spray to earn coins; missions pay extra.</T>
        <Btn label="OPEN MARKET" icon="market" tone="purple" onPress={() => setSheet('market')} />
      </Panel>

      <Panel title="TODAY">
        <View style={styles.tiles}>
          <Tile n={stats.strokes} label="strokes" />
          <Tile n={stats.pieces} label="walls" />
          <Tile n={stats.paint} label="paint" />
          <Tile n={stats.streak} label="day streak" />
        </View>
        <T v="small">all time · {painter?.strokes ?? 0} strokes · {Math.round(painter?.paint_used ?? 0)} paint sprayed</T>
      </Panel>
    </Screen>
  );
}

/** Daily quests in the Subway Surfers layout: goal, progress box and a claim strip. */
function Missions({ stats }: { stats: ReturnType<typeof dayStats> }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const day = dayKey();
  const deep = TONES.dark;
  return (
    <Panel title="DAILY QUESTS" tone="purple" right={<PixelIcon name="star" size={24} color={C.green} alt={C.greenLo} />}>
      {MISSIONS.map((m) => {
        const key = `${day}:${m.id}`;
        const got = Math.min(m.goal, m.get(stats));
        const done = got >= m.goal;
        const claimed = !!settings.claimed[key];
        const [pre, post] = m.title.split('{n}');
        return (
          <PixelBox key={m.id} fill={deep.fill} hi={deep.hi} lo={deep.lo} depth={3} contentStyle={{ padding: 10, gap: 8 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.mTitle}>{pre}<Text style={{ color: C.green }}>{m.hot}</Text>{post}</Text>
              <PixelBox fill={deep.lo} depth={0} bw={3} n={3} contentStyle={{ paddingHorizontal: 10, height: 30, justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.display, fontSize: 16, color: C.white }}>{got}/{m.goal}</Text>
              </PixelBox>
            </View>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <PixelIcon name="coin" size={24} color={C.green} alt={C.greenLo} />
                <Text style={{ fontFamily: F.display, fontSize: 16, color: C.green }}>+{m.reward}</Text>
              </View>
              {claimed ? <T v="label" color={C.greenHi}>CLAIMED</T> : (
                <Btn label={done ? 'CLAIM' : 'IN PROGRESS'} tone={done ? 'green' : 'dark'} size="sm" disabled={!done} onPress={() => {
                  haptic.success();
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

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  canRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  canBox: { width: 112, height: 150, alignItems: 'center', justifyContent: 'center', backgroundColor: C.well, borderWidth: 3, borderColor: C.ink },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tiles: { flexDirection: 'row', gap: 8 },
  mTitle: { flex: 1, fontFamily: F.display, fontSize: 17, color: C.white, ...outline(C.well) },
});
