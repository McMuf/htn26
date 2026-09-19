import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { ensurePainter } from '../data/sync';
import { useStore } from '../store';
import { PALETTE } from '../config';
import { Glass } from '../ui/Glass';
import { C } from '../ui/theme';

/**
 * One screen: handle + avatar colour + the three permissions. Identity is a Supabase
 * anonymous session (enable "Anonymous sign-ins" in Authentication → Providers); if the
 * project has that off, the same screen unfolds an email + password pair instead.
 */
export function OnboardingScreen({ session }: { session: { user: { id: string } } | null }) {
  const setPainter = useStore((s) => s.setPainter);
  const setSettings = useStore((s) => s.setSettings);
  const painter = useStore((s) => s.painter);
  const [name, setName] = useState(painter?.name ?? '');
  const [color, setColor] = useState(useStore.getState().settings.avatarColor);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [needEmail, setNeedEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [loc, setLoc] = useState<boolean | null>(null);
  const [motion, setMotion] = useState<boolean | null>(null);
  useEffect(() => { Location.getForegroundPermissionsAsync().then((p) => setLoc(p.granted)).catch(() => {}); DeviceMotion.getPermissionsAsync().then((p) => setMotion(p.granted)).catch(() => {}); }, []);

  const signIn = async (): Promise<string> => {
    if (session) return session.user.id;
    if (!needEmail) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (!error && data.user) return data.user.id;
      setNeedEmail(true);
      throw new Error('Anonymous sign-in is off for this project — add an email + password below.');
    }
    const e = email.trim().toLowerCase();
    if (!e || password.length < 6) throw new Error('Email and a 6+ character password, please.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
    if (!error && data.user) return data.user.id;
    if (error && !/invalid login/i.test(error.message)) throw new Error(error.message);
    const { data: d2, error: e2 } = await supabase.auth.signUp({ email: e, password });
    if (e2) throw new Error(e2.message);
    if (!d2.session) throw new Error('Account created — confirm the emailed link, then tap again.');
    return d2.session.user.id;
  };

  const go = async () => {
    const n = name.trim().slice(0, 20);
    if (!n) { setErr('Pick a handle first.'); return; }
    setBusy(true); setErr(null);
    try {
      const uid = await signIn();
      const p = await ensurePainter(uid, n);
      setPainter(p);
      setSettings({ avatarColor: color, onboarded: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { setErr(e?.message ?? 'Failed'); }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <LinearGradient colors={['#12081c', C.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>FRESCO</Text>
        <Text style={styles.sub}>Pick a handle. It signs every piece you paint.</Text>

        <Glass style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: color }]}><Text style={styles.avatarText}>{(name.trim()[0] ?? 'F').toUpperCase()}</Text></View>
            <TextInput value={name} onChangeText={setName} placeholder="YOUR_HANDLE" placeholderTextColor={C.faint} autoCapitalize="characters" autoCorrect={false} maxLength={20} style={styles.input} returnKeyType="done" />
          </View>
          <Text style={styles.label}>AVATAR COLOUR</Text>
          <View style={styles.swatches}>
            {PALETTE.filter((c) => c !== '#111111').map((c) => (
              <Pressable key={c} onPress={() => { setColor(c); Haptics.selectionAsync().catch(() => {}); }} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} />
            ))}
          </View>
        </Glass>

        <Glass style={styles.card}>
          <Text style={styles.label}>PERMISSIONS</Text>
          <PermRow label="Camera" hint="to paint on real walls" ok={!!camPerm?.granted} onPress={() => requestCam()} />
          <PermRow label="Location" hint="to pin pieces to a place" ok={!!loc} onPress={async () => setLoc((await Location.requestForegroundPermissionsAsync()).granted)} />
          <PermRow label="Motion" hint="to aim and shake the can" ok={!!motion} onPress={async () => setMotion((await DeviceMotion.requestPermissionsAsync()).granted)} />
        </Glass>

        {needEmail && (
          <Glass style={styles.card}>
            <Text style={styles.label}>ACCOUNT</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="you@uwaterloo.ca" placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.inputSm} />
            <TextInput value={password} onChangeText={setPassword} placeholder="password (6+)" placeholderTextColor={C.faint} secureTextEntry style={styles.inputSm} onSubmitEditing={go} />
          </Glass>
        )}

        {err && <Text style={styles.err}>{err}</Text>}
        <Pressable onPress={go} disabled={busy} style={[styles.btn, busy && { opacity: 0.5 }]}>
          <Text style={styles.btnText}>{busy ? '…' : 'START PAINTING'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PermRow({ label, hint, ok, onPress }: { label: string; hint: string; ok: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.perm}>
      <View style={{ flex: 1 }}>
        <Text style={styles.permLabel}>{label}</Text>
        <Text style={styles.permHint}>{hint}</Text>
      </View>
      <View style={[styles.permPill, ok && styles.permPillOn]}><Text style={styles.permPillText}>{ok ? 'ALLOWED' : 'ALLOW'}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 22, paddingTop: 84, paddingBottom: 60, gap: 14 },
  brand: { color: '#fff', fontWeight: '900', fontSize: 40, letterSpacing: 8 },
  sub: { color: C.dim, fontSize: 14, marginBottom: 8 },
  card: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#000', fontWeight: '900', fontSize: 22 },
  input: { flex: 1, color: '#fff', fontSize: 22, fontWeight: '800', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: C.pink },
  inputSm: { color: '#fff', fontSize: 16, fontWeight: '700', padding: 12, borderRadius: 12, backgroundColor: '#ffffff12' },
  label: { color: C.yellow, fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#ffffff22' },
  swatchOn: { borderColor: '#fff', borderWidth: 3, transform: [{ scale: 1.15 }] },
  perm: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  permLabel: { color: '#fff', fontWeight: '800', fontSize: 15 },
  permHint: { color: C.faint, fontSize: 12 },
  permPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: C.pink },
  permPillOn: { backgroundColor: '#ffffff22' },
  permPillText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  err: { color: C.orange, fontSize: 13 },
  btn: { backgroundColor: C.pink, borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '900', letterSpacing: 3 },
});
