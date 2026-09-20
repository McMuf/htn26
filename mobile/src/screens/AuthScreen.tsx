import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Email + password, one button. "Sign in" tries to sign in; if the account doesn't exist it
 * creates it and signs in. If the project has "Confirm email" on, sign-up returns no session
 * and we tell the user to tap the link in their inbox and press the button again.
 */
export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const go = async () => {
    const e = email.trim().toLowerCase();
    if (!e || password.length < 6) { setMsg('Enter your email and a password (6+ characters).'); return; }
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (!error) return; // onAuthStateChange takes over
      if (/not confirmed/i.test(error.message)) { setMsg('Confirm the link we emailed you, then tap Sign in again.'); return; }
      if (!/invalid login/i.test(error.message)) { setMsg(error.message); return; }
      const { data, error: e2 } = await supabase.auth.signUp({ email: e, password });
      if (e2) { setMsg(e2.message); return; }
      if (!data.session) setMsg('Account created — confirm the link we emailed you, then tap Sign in again.');
    } catch (err: any) {
      setMsg(err?.message ?? 'Network error');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.box}>
        <Text style={styles.brand}>TAGGED</Text>
        <Text style={styles.sub}>r/place, but graffiti in the real world.</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} placeholder="you@uwaterloo.ca" placeholderTextColor="#ffffff44" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" style={styles.input} />
        <Text style={styles.label}>Password</Text>
        <TextInput value={password} onChangeText={setPassword} placeholder="••••••" placeholderTextColor="#ffffff44" secureTextEntry textContentType="password" style={styles.input} onSubmitEditing={go} returnKeyType="go" />
        {msg && <Text style={styles.msg}>{msg}</Text>}
        <Pressable onPress={go} disabled={busy} style={[styles.btn, busy && { opacity: 0.5 }]}>
          <Text style={styles.btnText}>{busy ? '…' : 'SIGN IN'}</Text>
        </Pressable>
        <Text style={styles.hint}>No account yet? Same button — it creates one.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f', justifyContent: 'center', padding: 28 },
  box: { gap: 10 },
  brand: { color: '#fff', fontWeight: '900', fontSize: 44, letterSpacing: 6 },
  sub: { color: '#ffffffaa', fontSize: 14, marginBottom: 20 },
  label: { color: '#ffe600', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  input: { borderWidth: 2, borderColor: '#19e6ff', borderRadius: 14, color: '#fff', fontSize: 18, fontWeight: '700', padding: 14 },
  msg: { color: '#ffe600', fontSize: 13 },
  btn: { backgroundColor: '#ff2d95', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '900', letterSpacing: 2 },
  hint: { color: '#ffffff66', fontSize: 12, textAlign: 'center' },
});
