import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Colors, Radius, Spacing, TouchTarget, Type, type Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { getDeviceId } from '@/lib/device';

interface AttendanceState {
  today: { date: string; checkedIn: string | null; checkedOut: string | null };
  history: { date: string; in: string | null; out: string | null }[];
  geofence: { enabled: boolean; radiusM: number };
  devicesEnrolled: number;
  biometricExempt: boolean;
}

/** A controlled abort with a user-facing message (vs. an unexpected throw). */
class PunchAbort extends Error {}

function prettyDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AttendanceScreen() {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c: Palette = Colors[scheme];

  const [data, setData] = useState<AttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [punching, setPunching] = useState<'in' | 'out' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.get<AttendanceState>('/api/mobile/attendance'));
    } catch {
      setError("Couldn't load attendance. Pull to retry.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function acquireLocation(): Promise<{ lat: number; lng: number; accuracyM: number }> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new PunchAbort('Location access is needed to punch. Enable it for Altus in Settings, then try again.');
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? 9999 };
  }

  async function gateBiometric(exempt: boolean): Promise<void> {
    if (Platform.OS === 'web') return; // preview only — phone enforces it
    const [hasHw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHw || !enrolled) {
      if (exempt) return;
      throw new PunchAbort(
        'Set up fingerprint or Face ID on this phone to punch (or ask an admin to enable the exemption).',
      );
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm it's you to punch attendance",
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (!res.success) throw new PunchAbort('Biometric check cancelled.');
  }

  async function punch(kind: 'in' | 'out') {
    if (!data) return;
    setPunching(kind);
    try {
      const location = data.geofence.enabled ? await acquireLocation() : undefined;
      await gateBiometric(data.biometricExempt);
      const deviceId = await getDeviceId();
      const label = Device.modelName ?? Device.deviceName ?? `${Platform.OS} device`;
      const res = await api.post<{ ok: boolean; newDevice?: boolean }>(
        '/api/mobile/attendance/punch',
        { kind, location, deviceId, deviceLabel: label, platform: Platform.OS },
      );
      setToast(
        (kind === 'in' ? 'Checked in ✓' : 'Checked out ✓') +
          (res.newDevice ? ' · this phone is now registered' : ''),
      );
      await load();
    } catch (e) {
      setToast(messageFor(e));
    } finally {
      setPunching(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]} edges={['top']}>
        <ActivityIndicator color={Brand.red} size="large" />
      </SafeAreaView>
    );
  }

  const checkedIn = data?.today.checkedIn ?? null;
  const checkedOut = data?.today.checkedOut ?? null;
  const status = !checkedIn ? 'Not checked in' : checkedOut ? 'Day complete' : 'Checked in';
  const dot = !checkedIn ? c.textSecondary : checkedOut ? Brand.amber : Brand.green;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.red} />}
      >
        <Text style={[styles.header, { color: c.text }]}>Attendance</Text>

        {error ? (
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={{ color: c.text, fontSize: Type.body }}>{error}</Text>
          </View>
        ) : data ? (
          <>
            <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: dot }]} />
                <Text style={[styles.status, { color: c.text }]}>{status}</Text>
              </View>
              <View style={styles.punchRow}>
                <Punch c={c} label="IN" time={checkedIn} />
                <Punch c={c} label="OUT" time={checkedOut} />
              </View>

              <View style={styles.actions}>
                <PunchButton
                  label="Check in"
                  icon="log-in-outline"
                  busy={punching === 'in'}
                  disabled={!!checkedIn || punching !== null}
                  onPress={() => punch('in')}
                />
                <PunchButton
                  label="Check out"
                  icon="log-out-outline"
                  variant="outline"
                  c={c}
                  busy={punching === 'out'}
                  disabled={!checkedIn || !!checkedOut || punching !== null}
                  onPress={() => punch('out')}
                />
              </View>

              <Text style={[styles.hint, { color: c.textSecondary }]}>
                {data.geofence.enabled
                  ? `Punches register within ${data.geofence.radiusM}m of the office, confirmed by your device biometric.`
                  : 'Punches are confirmed by your device biometric.'}
                {data.devicesEnrolled === 0 ? ' Your first punch registers this phone.' : ''}
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>RECENT</Text>
            {data.history.length === 0 ? (
              <Text style={[styles.empty, { color: c.textSecondary }]}>No punches in the last two weeks.</Text>
            ) : (
              data.history.map((d) => (
                <View
                  key={d.date}
                  style={[styles.row, { backgroundColor: c.backgroundElement, borderColor: c.border }]}
                >
                  <Text style={[styles.rowDate, { color: c.text }]}>{prettyDate(d.date)}</Text>
                  <Text style={[styles.rowTimes, { color: c.textSecondary }]}>
                    {(d.in ?? '—') + '  →  ' + (d.out ?? '—')}
                  </Text>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      {toast ? <Toast c={c} message={toast} onHide={() => setToast(null)} /> : null}
    </SafeAreaView>
  );
}

function messageFor(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Punch failed. Try again.';
}

function Punch({ c, label, time }: { c: Palette; label: string; time: string | null }) {
  return (
    <View>
      <Text style={[styles.punchLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.punchTime, { color: time ? c.text : c.textSecondary }]}>{time ?? '—'}</Text>
    </View>
  );
}

function PunchButton({
  label,
  icon,
  onPress,
  busy,
  disabled,
  variant = 'solid',
  c,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  variant?: 'solid' | 'outline';
  c?: Palette;
}) {
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        solid
          ? { backgroundColor: Brand.red }
          : { borderWidth: 1.5, borderColor: disabled ? c?.border : Brand.red },
        { opacity: disabled ? 0.4 : pressed ? 0.9 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={solid ? '#fff' : Brand.red} />
      ) : (
        <>
          <Ionicons name={icon} size={20} color={solid ? '#fff' : Brand.red} />
          <Text style={[styles.btnText, { color: solid ? '#fff' : Brand.red }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function Toast({ c, message, onHide }: { c: Palette; message: string; onHide: () => void }) {
  useEffect(() => {
    const id = setTimeout(onHide, 3000);
    return () => clearTimeout(id);
  }, [onHide]);
  return (
    <View pointerEvents="none" style={styles.toastWrap}>
      <View style={[styles.toast, { backgroundColor: c.text }]}>
        <Text style={[styles.toastText, { color: c.background }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.eight },
  header: { fontSize: Type.h1, fontWeight: '800', letterSpacing: -0.5, marginBottom: Spacing.four },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.five },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 12, height: 12, borderRadius: Radius.pill },
  status: { fontSize: Type.title, fontWeight: '800' },
  punchRow: { flexDirection: 'row', gap: Spacing.eight, marginTop: Spacing.four },
  punchLabel: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1.5 },
  punchTime: { fontSize: Type.h2, fontWeight: '800', marginTop: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.five },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: TouchTarget + 8,
    borderRadius: Radius.md,
  },
  btnText: { fontSize: Type.body, fontWeight: '800' },
  hint: { fontSize: Type.label, lineHeight: 19, marginTop: Spacing.four },
  sectionLabel: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1.5, marginTop: Spacing.six, marginBottom: Spacing.two },
  empty: { fontSize: Type.body, marginTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.two,
  },
  rowDate: { fontSize: Type.body, fontWeight: '700' },
  rowTimes: { fontSize: Type.body, fontWeight: '600', fontVariant: ['tabular-nums'] },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: Spacing.six, alignItems: 'center' },
  toast: { paddingHorizontal: Spacing.five, paddingVertical: Spacing.three, borderRadius: Radius.pill, maxWidth: '90%' },
  toastText: { fontSize: Type.label, fontWeight: '700', textAlign: 'center' },
});
