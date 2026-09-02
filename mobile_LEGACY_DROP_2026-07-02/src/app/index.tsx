import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { Brand, Colors, Radius, Spacing, TouchTarget, Type, type Palette } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

/**
 * Entry route + auth gate. While the persisted session restores we show a
 * splash; signed-out → Login; signed-in + enrolled → the tabbed app at
 * "/(tabs)".
 */
export default function Index() {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c: Palette = Colors[scheme];
  const { initializing, user, profile, signIn } = useAuth();

  if (initializing) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={Brand.red} size="large" />
      </View>
    );
  }

  if (!user || !profile) {
    return <LoginScreen c={c} signIn={signIn} />;
  }

  return <Redirect href="/(tabs)/today" />;
}

function LoginScreen({ c, signIn }: { c: Palette; signIn: (e: string, p: string) => Promise<void> }) {
  const dark = useColorScheme() === 'dark';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    setError(null);
    setPending(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError((e as Error).message || "Email or password didn't match. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.mark}>
          <View style={styles.triangle} />
        </View>
        <Text style={[styles.wordmark, { color: c.textSecondary }]}>ALTUS · CORP</Text>
        <Text style={[styles.h1, { color: c.text }]}>Welcome back</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>Sign in to your Altus workspace.</Text>

        <View style={{ height: Spacing.six }} />

        <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@altuscorp.com" keyboardType="email-address" c={c} />
        <View style={{ height: Spacing.four }} />
        <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry c={c} />

        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, { color: dark ? '#FECACA' : Brand.redDeep }]}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          style={({ pressed }) => [styles.cta, { opacity: pending ? 0.7 : pressed ? 0.92 : 1 }]}
        >
          <Text style={styles.ctaText}>{pending ? 'Signing you in…' : 'Sign in'}</Text>
        </Pressable>

        <Text style={[styles.legal, { color: c.textSecondary }]}>
          By continuing you agree to our Terms and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  c,
  ...input
}: {
  label: string;
  c: Palette;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>{label.toUpperCase()}</Text>
      <TextInput
        {...input}
        placeholderTextColor={c.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.eight,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  mark: { alignItems: 'center' },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 22,
    borderRightWidth: 22,
    borderBottomWidth: 38,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Brand.red,
  },
  wordmark: { textAlign: 'center', marginTop: Spacing.three, fontSize: Type.label, letterSpacing: 3, fontWeight: '700' },
  h1: { textAlign: 'center', marginTop: Spacing.five, fontSize: Type.h1, fontWeight: '700', letterSpacing: -0.5 },
  sub: { textAlign: 'center', marginTop: Spacing.two, fontSize: Type.body },
  fieldLabel: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1.5, marginBottom: Spacing.two },
  input: { height: TouchTarget + 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.four, fontSize: Type.body },
  errorBox: { marginTop: Spacing.four, backgroundColor: 'rgba(225,6,0,0.12)', borderWidth: 1, borderColor: 'rgba(225,6,0,0.4)', borderRadius: Radius.md, padding: Spacing.four },
  errorText: { fontSize: Type.label, lineHeight: 20, fontWeight: '600' },
  cta: {
    marginTop: Spacing.six,
    height: TouchTarget + 8,
    borderRadius: Radius.md,
    backgroundColor: Brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontSize: Type.bodyLg, fontWeight: '700' },
  legal: { textAlign: 'center', marginTop: Spacing.five, fontSize: Type.caption, lineHeight: 18 },
});
