import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, Colors, PriorityMeta, Radius, Spacing, TouchTarget, Type, statusHex, type Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';

type StatusDisplay = Record<string, { label: string; color: string }>;
interface TaskDetail {
  id: string;
  taskNo: number | null;
  title: string;
  subject: string | null;
  client: string | null;
  description: string | null;
  notes: string | null;
  status: string;
  priority: string;
  approvalStatus: string | null;
  dueAt: string | null;
  revisedTargetDate: string | null;
  createdAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  doerName: string | null;
  initiatorName: string | null;
  creatorName: string | null;
}
interface TimelineEvent {
  id: string;
  actorName: string | null;
  eventType: string;
  note: string | null;
  fromValue: unknown;
  toValue: unknown;
  createdAt: string;
}
interface DetailResponse {
  task: TaskDetail;
  statusDisplay: StatusDisplay;
  allowedTransitions: string[];
  canComment: boolean;
  timeline: TimelineEvent[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TaskDetailScreen() {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c: Palette = Colors[scheme];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.get<DetailResponse>(`/api/mobile/tasks/${id}`));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "You don't have access to this task." : "Couldn't load this task.");
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function changeStatus(status: string) {
    if (!data?.task.updatedAt) return;
    setBusy(true);
    try {
      await api.post(`/api/mobile/tasks/${id}/status`, {
        status,
        expectedUpdatedAt: data.task.updatedAt,
        note: note.trim() || undefined,
      });
      setPicker(false);
      setNote('');
      setToast(`Moved to "${data.statusDisplay[status]?.label ?? status}"`);
      await load();
    } catch (e) {
      const err = e as ApiError;
      setToast(err.status === 409 ? 'Task changed elsewhere — refreshed.' : err.status === 403 ? "You can't make that change." : 'Update failed.');
      if (err.status === 409) {
        setPicker(false);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendComment() {
    const body = comment.trim();
    if (!body) return;
    setSending(true);
    try {
      await api.post(`/api/mobile/tasks/${id}/comment`, { body });
      setComment('');
      await load();
    } catch {
      setToast('Could not post comment.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]} edges={['top']}>
        <ActivityIndicator color={Brand.red} size="large" />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
        <TopBar c={c} title="" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={{ color: c.textSecondary, fontSize: Type.body, textAlign: 'center' }}>{error ?? 'Not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const t = data.task;
  const pri = PriorityMeta[t.priority] ?? PriorityMeta.not_imp_not_urgent;
  const st = data.statusDisplay[t.status] ?? { label: t.status, color: 'slate' };
  const stColor = statusHex(st.color);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <TopBar c={c} title={t.taskNo ? `#${t.taskNo}` : 'Task'} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {t.subject || t.client ? (
            <Text style={[styles.meta, { color: c.textSecondary }]}>{[t.subject, t.client].filter(Boolean).join('  ·  ')}</Text>
          ) : null}
          <Text style={[styles.title, { color: c.text }]}>{t.title}</Text>

          <View style={styles.badges}>
            <View style={[styles.pill, { backgroundColor: `${stColor}22` }]}>
              <View style={[styles.dot, { backgroundColor: stColor }]} />
              <Text style={[styles.pillText, { color: stColor }]}>{st.label}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: `${pri.color}22` }]}>
              <Text style={[styles.pillText, { color: pri.color }]}>{pri.label}</Text>
            </View>
            {t.approvalStatus ? (
              <View style={[styles.pill, { backgroundColor: c.backgroundSelected }]}>
                <Text style={[styles.pillText, { color: c.text }]}>{t.approvalStatus.replace('_', ' ')}</Text>
              </View>
            ) : null}
          </View>

          {data.allowedTransitions.length > 0 ? (
            <Pressable
              onPress={() => setPicker(true)}
              style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.9 : 1 }]}
            >
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
              <Text style={styles.ctaText}>Change status</Text>
            </Pressable>
          ) : null}

          {t.description ? (
            <Section c={c} label="DESCRIPTION">
              <Text style={[styles.body, { color: c.text }]}>{t.description}</Text>
            </Section>
          ) : null}
          {t.notes ? (
            <Section c={c} label="NOTES">
              <Text style={[styles.body, { color: c.text }]}>{t.notes}</Text>
            </Section>
          ) : null}

          <Section c={c} label="DETAILS">
            <Row c={c} k="Doer" v={t.doerName ?? '—'} />
            <Row c={c} k="Initiator" v={t.initiatorName ?? '—'} />
            {t.creatorName ? <Row c={c} k="Created by" v={t.creatorName} /> : null}
            <Row c={c} k="Due" v={fmtDate(t.dueAt)} />
            {t.revisedTargetDate ? <Row c={c} k="Revised target" v={fmtDate(t.revisedTargetDate)} /> : null}
            <Row c={c} k="Created" v={fmtDate(t.createdAt)} />
            {t.completedAt ? <Row c={c} k="Completed" v={fmtDate(t.completedAt)} /> : null}
          </Section>

          <Section c={c} label="ACTIVITY">
            {data.timeline.length === 0 ? (
              <Text style={[styles.body, { color: c.textSecondary }]}>No activity yet.</Text>
            ) : (
              data.timeline.map((e) => <EventRow key={e.id} c={c} e={e} display={data.statusDisplay} />)
            )}
          </Section>
        </ScrollView>

        {data.canComment ? (
          <View style={[styles.composer, { backgroundColor: c.backgroundElement, borderColor: c.border, paddingBottom: Spacing.three + insets.bottom }]}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add a comment…"
              placeholderTextColor={c.textSecondary}
              multiline
              style={[styles.composerInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
            />
            <Pressable
              onPress={sendComment}
              disabled={sending || !comment.trim()}
              style={({ pressed }) => [styles.send, { opacity: sending || !comment.trim() ? 0.4 : pressed ? 0.9 : 1 }]}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => !busy && setPicker(false)}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : () => setPicker(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.backgroundElement }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: c.border }]} />
            <Text style={[styles.sheetTitle, { color: c.text }]}>Change status</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={c.textSecondary}
              style={[styles.noteInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
            />
            {data.allowedTransitions.map((s) => {
              const d = data.statusDisplay[s] ?? { label: s, color: 'slate' };
              const color = statusHex(d.color);
              return (
                <Pressable
                  key={s}
                  disabled={busy}
                  onPress={() => changeStatus(s)}
                  style={({ pressed }) => [styles.option, { borderColor: c.border, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}
                >
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <Text style={[styles.optionText, { color: c.text }]}>{d.label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPicker(false)} disabled={busy} style={styles.cancel}>
              <Text style={[styles.cancelText, { color: c.textSecondary }]}>{busy ? 'Saving…' : 'Cancel'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {toast ? <Toast c={c} message={toast} onHide={() => setToast(null)} /> : null}
    </SafeAreaView>
  );
}

function TopBar({ c, title, onBack }: { c: Palette; title: string; onBack: () => void }) {
  return (
    <View style={[styles.topbar, { borderColor: c.border }]}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={c.text} />
      </Pressable>
      <Text style={[styles.topbarTitle, { color: c.text }]}>{title}</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function Section({ c, label, children }: { c: Palette; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function Row({ c, k, v }: { c: Palette; k: string; v: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.rowK, { color: c.textSecondary }]}>{k}</Text>
      <Text style={[styles.rowV, { color: c.text }]}>{v}</Text>
    </View>
  );
}

function EventRow({ c, e, display }: { c: Palette; e: TimelineEvent; display: StatusDisplay }) {
  const who = e.actorName ?? 'Someone';
  let line: string;
  if (e.eventType === 'commented') {
    const body = (e.toValue as { body?: string } | null)?.body ?? '';
    line = body;
  } else if (e.eventType === 'status_changed') {
    const from = (e.fromValue as { status?: string } | null)?.status;
    const to = (e.toValue as { status?: string } | null)?.status;
    const lbl = (s?: string) => (s ? display[s]?.label ?? s : '?');
    line = `Status: ${lbl(from)} → ${lbl(to)}${e.note ? ` — ${e.note}` : ''}`;
  } else if (e.eventType === 'created') {
    line = 'Created the task';
  } else {
    line = e.eventType.replace(/_/g, ' ');
  }
  return (
    <View style={styles.event}>
      <View style={[styles.eventDot, { backgroundColor: e.eventType === 'commented' ? Brand.blue : c.border }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.eventHead, { color: c.textSecondary }]}>
          {who} · {fmtDateTime(e.createdAt)}
        </Text>
        <Text style={[styles.eventBody, { color: c.text }]}>{line}</Text>
      </View>
    </View>
  );
}

function Toast({ c, message, onHide }: { c: Palette; message: string; onHide: () => void }) {
  useEffect(() => {
    const id = setTimeout(onHide, 2600);
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.six },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: 1 },
  topbarTitle: { fontSize: Type.body, fontWeight: '700' },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.eight },
  meta: { fontSize: Type.label, fontWeight: '600' },
  title: { fontSize: Type.h2, fontWeight: '800', letterSpacing: -0.5, marginTop: Spacing.one, lineHeight: 34 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.four },
  pill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: Radius.pill },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
  pillText: { fontSize: Type.label, fontWeight: '700' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, height: TouchTarget + 4, borderRadius: Radius.md, backgroundColor: Brand.red, marginTop: Spacing.five },
  ctaText: { color: '#fff', fontSize: Type.body, fontWeight: '800' },
  section: { marginTop: Spacing.six },
  sectionLabel: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1.5, marginBottom: Spacing.two },
  body: { fontSize: Type.body, lineHeight: 24 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.two, gap: Spacing.four },
  rowK: { fontSize: Type.body },
  rowV: { fontSize: Type.body, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  event: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.two },
  eventDot: { width: 10, height: 10, borderRadius: Radius.pill, marginTop: 5 },
  eventHead: { fontSize: Type.caption, fontWeight: '600' },
  eventBody: { fontSize: Type.body, lineHeight: 22, marginTop: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.three, borderTopWidth: 1 },
  composerInput: { flex: 1, minHeight: TouchTarget, maxHeight: 120, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, fontSize: Type.body },
  send: { width: TouchTarget, height: TouchTarget, borderRadius: Radius.pill, backgroundColor: Brand.red, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.five, paddingBottom: Spacing.eight },
  grabber: { width: 40, height: 4, borderRadius: Radius.pill, alignSelf: 'center', marginBottom: Spacing.four },
  sheetTitle: { fontSize: Type.title, fontWeight: '800', marginBottom: Spacing.three },
  noteInput: { height: TouchTarget + 4, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: Type.body, marginBottom: Spacing.four },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, height: TouchTarget + 6, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  optionText: { fontSize: Type.body, fontWeight: '700' },
  cancel: { height: TouchTarget, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
  cancelText: { fontSize: Type.body, fontWeight: '700' },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: Spacing.eight, alignItems: 'center' },
  toast: { paddingHorizontal: Spacing.five, paddingVertical: Spacing.three, borderRadius: Radius.pill, maxWidth: '90%' },
  toastText: { fontSize: Type.label, fontWeight: '700', textAlign: 'center' },
});
