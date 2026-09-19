import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { makeImageFromView } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Glass } from '../ui/Glass';
import { C, DOCK_INSET } from '../ui/theme';
import { useStore } from '../store';
import { MOCK_ACTIVITY, MOCK_FRIENDS } from '../data/mock';

/**
 * Friends + activity are stubs (src/data/mock.ts). The stat card is real: it snapshots the
 * card view to a PNG and hands it to the share sheet (React Native's Share can't attach files on
 * Android, so there it goes through expo-sharing).
 */
export function SocialScreen() {
  const painter = useStore((s) => s.painter);
  const settings = useStore((s) => s.settings);
  const strokes = useStore((s) => s.strokes);
  const discovered = useStore((s) => s.discovered);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const mine = Object.values(strokes).flat().filter((s) => s.author_id === painter?.id);
  const pieces = new Set(mine.map((s) => s.canvas_id)).size;
  const found = Object.keys(discovered).length;
  const topColor = mode(mine.map((s) => s.color)) ?? settings.optionA.color;

  const share = async () => {
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const img = await makeImageFromView(cardRef);
      if (!img) throw new Error('snapshot failed');
      const f = new File(Paths.cache, 'fresco-card.png');
      f.write(img.encodeToBytes());
      if (Platform.OS === 'android') await Sharing.shareAsync(f.uri, { mimeType: 'image/png', dialogTitle: 'Share your Fresco card' });
      else await Share.share({ url: f.uri, message: `My Fresco week — ${painter?.name ?? 'anon'} · ${Math.round(painter?.paint_used ?? 0)} paint sprayed` });
    } catch (e) {
      await Share.share({ message: `My Fresco week — ${painter?.name ?? 'anon'} · ${painter?.strokes ?? 0} strokes · ${Math.round(painter?.paint_used ?? 0)} paint · ${found} pieces found` }).catch(() => {});
    }
    setSharing(false);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1a0812', C.bg, C.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: DOCK_INSET }]}>
        <Text style={styles.h1}>SOCIAL</Text>

        {/* shareable stat card (real numbers) */}
        <View ref={cardRef} collapsable={false} style={styles.cardWrap}>
          <LinearGradient colors={[topColor, '#0b0b0f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.avatar, { backgroundColor: settings.avatarColor }]}><Text style={styles.avatarText}>{(painter?.name?.[0] ?? 'F').toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{painter?.name ?? 'anon'}</Text>
                <Text style={styles.cardSub}>this week on the wall</Text>
              </View>
              <Text style={styles.cardBrand}>FRESCO</Text>
            </View>
            <View style={styles.cardStats}>
              <Big n={painter?.strokes ?? 0} l="strokes" />
              <Big n={Math.round(painter?.paint_used ?? 0)} l="paint sprayed" />
            </View>
            <View style={styles.cardStats}>
              <Big n={pieces} l="pieces painted" small />
              <Big n={found} l="pieces found" small />
              <Big n={mine.length ? [...new Set(mine.map((s) => s.color))].length : 0} l="colours" small />
            </View>
            <View style={styles.cardFoot}>
              <View style={[styles.dot, { backgroundColor: topColor }]} />
              <Text style={styles.cardSub}>signature colour · Waterloo, ON</Text>
            </View>
          </LinearGradient>
        </View>
        <Pressable onPress={share} disabled={sharing} style={[styles.cta, sharing && { opacity: 0.5 }]}><Text style={styles.ctaText}>{sharing ? '…' : 'SHARE CARD ↗'}</Text></Pressable>

        <Text style={styles.label}>FRIENDS</Text>
        <Glass style={{ paddingVertical: 4 }}>
          {MOCK_FRIENDS.map((f, i) => (
            <View key={f.id} style={[styles.friend, i > 0 && styles.friendLine]}>
              <View style={[styles.avatarSm, { backgroundColor: f.color }]}><Text style={styles.avatarSmText}>{f.name[0].toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>{f.name}</Text>
                <Text style={styles.meta}>{f.status}</Text>
              </View>
              <Text style={[styles.meta, { color: f.online ? C.lime : C.faint }]}>{f.online ? '● online' : '○'}</Text>
              {f.streak > 0 && <Text style={styles.streak}>🔥 {f.streak}</Text>}
            </View>
          ))}
        </Glass>
        <Text style={styles.stub}>friends, activity and crews are stubbed this pass</Text>

        <Text style={styles.label}>ACTIVITY</Text>
        <Glass style={{ paddingVertical: 4 }}>
          {MOCK_ACTIVITY.map((a, i) => (
            <View key={a.id} style={[styles.friend, i > 0 && styles.friendLine]}>
              <View style={{ flex: 1 }}><Text style={styles.meta}><Text style={styles.friendName}>{a.who}</Text> {a.what}</Text></View>
              <Text style={styles.meta}>{a.when}</Text>
            </View>
          ))}
        </Glass>
      </ScrollView>
    </View>
  );
}

function Big({ n, l, small }: { n: number; l: string; small?: boolean }) {
  return <View style={{ flex: 1 }}><Text style={[styles.bigN, small && { fontSize: 24 }]}>{n}</Text><Text style={styles.cardSub}>{l}</Text></View>;
}
function mode(xs: string[]) { const m = new Map<string, number>(); let best: string | undefined, bn = 0; for (const x of xs) { const n = (m.get(x) ?? 0) + 1; m.set(x, n); if (n > bn) { bn = n; best = x; } } return best; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 18, paddingTop: 66, gap: 12 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 28, letterSpacing: 4 },
  label: { color: C.yellow, fontWeight: '800', letterSpacing: 2, fontSize: 11, marginTop: 6 },
  cardWrap: { borderRadius: 24, overflow: 'hidden' },
  card: { padding: 20, gap: 16, borderRadius: 24 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#000', fontWeight: '900', fontSize: 18 },
  cardName: { color: '#fff', fontWeight: '900', fontSize: 20 },
  cardSub: { color: '#ffffffbb', fontSize: 12, fontWeight: '600' },
  cardBrand: { color: '#fff', fontWeight: '900', letterSpacing: 4, fontSize: 12 },
  cardStats: { flexDirection: 'row', gap: 12 },
  bigN: { color: '#fff', fontWeight: '900', fontSize: 40, letterSpacing: -1 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  cta: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  ctaText: { color: '#000', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  friendLine: { borderTopWidth: 1, borderTopColor: C.line },
  avatarSm: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { color: '#000', fontWeight: '900' },
  friendName: { color: '#fff', fontWeight: '800', fontSize: 14 },
  meta: { color: C.dim, fontSize: 12 },
  streak: { color: '#fff', fontWeight: '800', fontSize: 12 },
  stub: { color: C.faint, fontSize: 11, fontStyle: 'italic', marginTop: -4 },
});
