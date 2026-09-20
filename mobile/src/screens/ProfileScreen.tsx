import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelCan } from '../ui/PixelCan';
import { Avatar, Btn, Gauge, IconBtn, Panel, CoinPill, Screen, SegBar, T, Tile } from '../ui/kit';
import { haptic } from '../ui/haptics';
import { C, F, outline } from '../ui/theme';
import { useStore } from '../store';
import { PAINT_MAX, PAINT_REGEN_PER_SEC, SHAKE_MIN_TO_SPRAY } from '../config';
import { CREWS, MISSIONS, colorName, dayKey, dayStats, skinColor } from '../lib/economy';

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
        <CoinPill />
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
              <SegBar value={shake} color={low ? C.purpleHi : C.greenHi} smooth />
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="GO PAINT" icon="can" tone="green" size="lg" style={{ flex: 1 }} onPress={() => setTab('create')} />
          <Btn label="MARKET" icon="market" tone="purple" size="lg" onPress={() => setSheet('market')} />
        </View>
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

      <Missions stats={stats} />
    </Screen>
  );
}

/** Daily quests: one row each — what to do, a bar that fills as you do it, the coins, and CLAIM when it's full. */
function Missions({ stats }: { stats: ReturnType<typeof dayStats> }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const day = dayKey();
  return (
    <Panel title="DAILY QUESTS" right={<T v="eyebrow">RESETS AT MIDNIGHT</T>}>
      {MISSIONS.map((m) => {
        const key = `${day}:${m.id}`;
        const got = Math.min(m.goal, m.get(stats));
        const done = got >= m.goal;
        const claimed = !!settings.claimed[key];
        const [pre, post] = m.title.split('{n}');
        return (
          <View key={m.id} style={{ gap: 6 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.mTitle} numberOfLines={1}>{pre}<Text style={{ color: C.greenHi }}>{m.hot}</Text>{post}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <PixelIcon name="coin" size={24} color={C.green} alt={C.greenLo} />
                <Text style={styles.mReward}>+{m.reward}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><SegBar value={claimed ? 1 : got / m.goal} color={claimed ? C.greenHi : C.green} h={12} smooth /></View>
              {claimed ? <T v="micro" color={C.greenHi}>CLAIMED</T>
                : done ? <Btn label="CLAIM" tone="green" size="sm" onPress={() => { haptic.success(); setSettings({ claimed: { ...settings.claimed, [key]: true }, bonus: settings.bonus + m.reward }); }} />
                : <T v="micro">{got}/{m.goal}</T>}
            </View>
          </View>
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
  mTitle: { flex: 1, fontFamily: F.display, fontSize: 17, color: C.white, ...outline(C.ink) },
  mReward: { fontFamily: F.display, fontSize: 16, color: C.green },
});
