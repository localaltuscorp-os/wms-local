import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Colors, PriorityMeta, Radius, Spacing, Type, statusHex, type Palette } from '@/constants/theme';
import { api } from '@/lib/api';

interface Task {
  id: string;
  taskNo: number | null;
  title: string;
  subject: string | null;
  client: string | null;
  status: string;
  priority: string;
  dueAt: string;
  completedAt: string | null;
}
type StatusDisplay = Record<string, { label: string; color: string }>;
interface TasksResponse {
  statusDisplay: StatusDisplay;
  tasks: Task[];
}

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function TasksScreen() {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c: Palette = Colors[scheme];
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [display, setDisplay] = useState<StatusDisplay>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get<TasksResponse>('/api/mobile/tasks');
      setTasks(data.tasks);
      setDisplay(data.statusDisplay);
    } catch {
      setError("Couldn't load your tasks. Pull to retry.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Refetch when returning to the tab (e.g. after creating a task).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]} edges={['top']}>
        <ActivityIndicator color={Brand.red} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: c.text }]}>Tasks</Text>
        <Pressable
          onPress={() => router.push('/task/new' as Href)}
          accessibilityLabel="New task"
          style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={tasks.length === 0 ? styles.emptyWrap : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.red} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={c.textSecondary} />
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>
              {error ?? 'No tasks assigned to you right now.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TaskCard c={c} task={item} display={display} onPress={() => router.push(`/task/${item.id}` as Href)} />
        )}
      />
    </SafeAreaView>
  );
}

function TaskCard({
  c,
  task,
  display,
  onPress,
}: {
  c: Palette;
  task: Task;
  display: StatusDisplay;
  onPress: () => void;
}) {
  const pri = PriorityMeta[task.priority] ?? PriorityMeta.not_imp_not_urgent;
  const st = display[task.status] ?? { label: task.status, color: 'slate' };
  const stColor = statusHex(st.color);
  const overdue = !task.completedAt && new Date(task.dueAt).getTime() < Date.now();
  const meta = [task.taskNo ? `#${task.taskNo}` : null, task.subject, task.client].filter(Boolean).join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.backgroundElement, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.priBar, { backgroundColor: pri.color }]} />
      <View style={{ flex: 1 }}>
        {meta ? <Text style={[styles.cardMeta, { color: c.textSecondary }]}>{meta}</Text> : null}
        <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={styles.cardFooter}>
          <View style={[styles.pill, { backgroundColor: `${stColor}22` }]}>
            <View style={[styles.pillDot, { backgroundColor: stColor }]} />
            <Text style={[styles.pillText, { color: stColor }]}>{st.label}</Text>
          </View>
          <Text style={[styles.due, { color: overdue ? Brand.red : c.textSecondary }]}>
            {overdue ? 'Overdue · ' : 'Due '}
            {formatDue(task.dueAt)}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.six },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.five, paddingTop: Spacing.five, paddingBottom: Spacing.four },
  header: { fontSize: Type.h1, fontWeight: '800', letterSpacing: -0.5 },
  addBtn: { width: 40, height: 40, borderRadius: Radius.pill, backgroundColor: Brand.red, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: Spacing.five, paddingBottom: Spacing.eight },
  emptyWrap: { flexGrow: 1 },
  emptyText: { fontSize: Type.body, textAlign: 'center', marginTop: Spacing.four, lineHeight: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.four,
    marginBottom: Spacing.three,
  },
  priBar: { width: 4, alignSelf: 'stretch', borderRadius: Radius.pill },
  cardMeta: { fontSize: Type.caption, fontWeight: '600', marginBottom: Spacing.one },
  cardTitle: { fontSize: Type.bodyLg, fontWeight: '700', lineHeight: 24 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three },
  pill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: Radius.pill },
  pillDot: { width: 8, height: 8, borderRadius: Radius.pill },
  pillText: { fontSize: Type.label, fontWeight: '700' },
  due: { fontSize: Type.label, fontWeight: '600' },
});
