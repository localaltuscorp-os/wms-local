import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Colors, Radius, Spacing, TouchTarget, Type, type Palette } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function MoreScreen() {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c: Palette = Colors[scheme];
  const { profile, signOutUser } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const initials = (profile?.name ?? 'A')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOutUser();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.text }]}>{profile?.name ?? '—'}</Text>
            <Text style={[styles.email, { color: c.textSecondary }]}>{profile?.email ?? ''}</Text>
            {profile?.department ? (
              <Text style={[styles.dept, { color: c.textSecondary }]}>{profile.department}</Text>
            ) : null}
          </View>
          {profile?.isAdmin ? (
            <View style={styles.adminTag}>
              <Text style={styles.adminTagText}>ADMIN</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={onSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signOut, { borderColor: c.border, opacity: signingOut ? 0.6 : pressed ? 0.9 : 1 }]}
        >
          <Ionicons name="log-out-outline" size={20} color={Brand.red} />
          <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>

        <Text style={[styles.version, { color: c.textSecondary }]}>Altus Corp · mobile</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: Spacing.five },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
  },
  avatar: { width: 56, height: 56, borderRadius: Radius.pill, backgroundColor: Brand.red, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: Type.bodyLg, fontWeight: '800' },
  name: { fontSize: Type.bodyLg, fontWeight: '700' },
  email: { fontSize: Type.label, marginTop: Spacing.half },
  dept: { fontSize: Type.caption, marginTop: Spacing.half },
  adminTag: { backgroundColor: 'rgba(225,6,0,0.12)', borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  adminTagText: { color: Brand.red, fontSize: Type.caption, fontWeight: '800', letterSpacing: 1 },
  signOut: {
    marginTop: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: TouchTarget + 4,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  signOutText: { color: Brand.red, fontSize: Type.body, fontWeight: '700' },
  version: { textAlign: 'center', marginTop: 'auto', fontSize: Type.caption },
});
