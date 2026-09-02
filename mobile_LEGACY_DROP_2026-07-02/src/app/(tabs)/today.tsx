import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Colors, Radius, Spacing, Type, type Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Dashboard {
  greetingName: string;
  isAdmin: boolean;
  attendance: { checkedIn: string | null; checkedOut: string | null };
  tasks: { pending: number; overdue: number };
}

/** Greeting that tracks the local time of day. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c: Palette = Colors[scheme];
  const { profile } = useAuth();

  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.get<Dashboard>('/api/mobile/dashboard'));
    } catch {
      setError("Couldn't load your day. Pull to retry.");
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

  const name = data?.greetingName ?? profile?.name.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.red} />}
      >
        <Text style={[styles.greeting, { color: c.textSecondary }]}>{greeting()},</Text>
        <Text style={[styles.name, { color: c.text }]}>{name}.</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Brand.red} />
          </View>
        ) : error ? (
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[styles.errorText, { color: c.text }]}>{error}</Text>
          </View>
        ) : data ? (
          <>
            <AttendanceCard c={c} attendance={data.attendance} />
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>YOUR TASKS</Text>
            <View style={styles.statRow}>
              <StatCard
                c={c}
                label="Pending"
                value={data.tasks.pending}
                icon="time-outline"
                tint={c.text}
              />
              <StatCard
                c={c}
                label="Overdue"
                value={data.tasks.overdue}
                icon="alert-circle-outline"
                tint={data.tasks.overdue > 0 ? Brand.red : c.text}
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function AttendanceCard({ c, attendance }: { c: Palette; attendance: Dashboard['attendance'] }) {
  const { checkedIn, checkedOut } = attendance;
  const status = !checkedIn ? 'Not checked in yet' : checkedOut ? 'Checked out' : 'Checked in';
  const dot = !checkedIn ? c.textSecondary : checkedOut ? Brand.amber : Brand.green;

  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={styles.cardHead}>
        <Ionicons name="finger-print-outline" size={20} color={c.tint} />
        <Text style={[styles.cardTitle, { color: c.text }]}>Attendance</Text>
        <View style={[styles.dot, { backgroundColor: dot }]} />
      </View>
      <Text style={[styles.status, { color: c.text }]}>{status}</Text>
      <View style={styles.punchRow}>
        <Punch c={c} label="IN" time={checkedIn} />
        <Punch c={c} label="OUT" time={checkedOut} />
      </View>
    </View>
  );
}

function Punch({ c, label, time }: { c: Palette; label: string; time: string | null }) {
  return (
    <View style={styles.punch}>
      <Text style={[styles.punchLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.punchTime, { color: time ? c.text : c.textSecondary }]}>{time ?? '—'}</Text>
    </View>
  );
}

function StatCard({
  c,
  label,
  value,
  icon,
  tint,
}: {
  c: Palette;
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <View style={[styles.card, styles.statCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <Ionicons name={icon} size={22} color={tint} />
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.five, paddingBottom: Spacing.eight },
  greeting: { fontSize: Type.bodyLg, fontWeight: '500' },
  name: { fontSize: Type.h1, fontWeight: '800', letterSpacing: -0.5, marginTop: Spacing.half },
  loadingBox: { paddingVertical: Spacing.eight, alignItems: 'center' },
  card: {
    marginTop: Spacing.five,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.five,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { fontSize: Type.label, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: Radius.pill },
  status: { fontSize: Type.title, fontWeight: '700', marginTop: Spacing.three },
  punchRow: { flexDirection: 'row', marginTop: Spacing.four, gap: Spacing.six },
  punch: {},
  punchLabel: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1.5 },
  punchTime: { fontSize: Type.bodyLg, fontWeight: '700', marginTop: Spacing.one },
  sectionLabel: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1.5, marginTop: Spacing.six },
  statRow: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.one },
  statCard: { flex: 1, alignItems: 'flex-start' },
  statValue: { fontSize: Type.h1, fontWeight: '800', marginTop: Spacing.two },
  statLabel: { fontSize: Type.label, fontWeight: '600', marginTop: Spacing.half },
  errorText: { fontSize: Type.body, lineHeight: 22 },
});
