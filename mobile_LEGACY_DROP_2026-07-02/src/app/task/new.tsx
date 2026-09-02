import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Colors, PriorityMeta, Radius, Spacing, TouchTarget, Type, type Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';

interface FormData {
  me: { id: string; name: string };
  employees: { id: string; name: string }[];
  subjects: string[];
  clients: string[];
  priorities: { value: string; label: string }[];
}

export default function NewTaskScreen() {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c: Palette = Colors[scheme];
  const router = useRouter();

  const [form, setForm] = useState<FormData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [doerId, setDoerId] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [priority, setPriority] = useState('imp_not_urgent');
  const [dueAt, setDueAt] = useState<Date>(() => new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [description, setDescription] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [picker, setPicker] = useState<'doer' | 'subject' | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FormData>('/api/mobile/task-form')
      .then((d) => {
        setForm(d);
        setDoerId(d.me.id); // default to a self-task
      })
      .catch(() => setLoadErr("Couldn't load the form. Go back and retry."));
  }, []);

  const doerName = useMemo(
    () => form?.employees.find((e) => e.id === doerId)?.name ?? null,
    [form, doerId],
  );

  async function submit() {
    setErr(null);
    if (!title.trim()) return setErr('Enter a client / title.');
    if (!doerId) return setErr('Pick a doer.');
    setSaving(true);
    try {
      await api.post('/api/mobile/tasks', {
        title: title.trim(),
        doerId,
        priority,
        dueAt: dueAt.toISOString(),
        subject,
        description: description.trim() || null,
      });
      router.back();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create the task.');
    } finally {
      setSaving(false);
    }
  }

  if (!form && !loadErr) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]} edges={['top']}>
        <ActivityIndicator color={Brand.red} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={[styles.topbar, { borderColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Cancel">
          <Ionicons name="close" size={26} color={c.text} />
        </Pressable>
        <Text style={[styles.topTitle, { color: c.text }]}>New task</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {loadErr ? <Text style={{ color: c.text }}>{loadErr}</Text> : null}

          <Field label="Client / title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Acme Corp"
              placeholderTextColor={c.textSecondary}
              style={[styles.input, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
            />
          </Field>

          <Field label="Doer">
            <Select c={c} value={doerName ?? 'Pick a person'} placeholder={!doerName} onPress={() => setPicker('doer')} />
          </Field>

          <Field label="Subject (optional)">
            <Select c={c} value={subject ?? 'None'} placeholder={!subject} onPress={() => setPicker('subject')} />
          </Field>

          <Field label="Priority">
            <View style={styles.segments}>
              {form!.priorities.map((p) => {
                const active = priority === p.value;
                const color = PriorityMeta[p.value]?.color ?? Brand.red;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setPriority(p.value)}
                    style={[
                      styles.segment,
                      { borderColor: active ? color : c.border, backgroundColor: active ? `${color}22` : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.segmentText, { color: active ? color : c.textSecondary }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Due date">
            {Platform.OS === 'web' ? (
              <TextInput
                value={dueAt.toISOString().slice(0, 10)}
                onChangeText={(t) => {
                  const d = new Date(t);
                  if (!Number.isNaN(d.getTime())) setDueAt(d);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.textSecondary}
                style={[styles.input, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
              />
            ) : (
              <>
                <Select
                  c={c}
                  value={dueAt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  onPress={() => setShowDate(true)}
                />
                {showDate ? (
                  <DateTimePicker
                    value={dueAt}
                    mode="date"
                    onChange={(_, d) => {
                      setShowDate(Platform.OS === 'ios');
                      if (d) setDueAt(d);
                    }}
                  />
                ) : null}
              </>
            )}
          </Field>

          <Field label="Description (optional)">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What needs doing?"
              placeholderTextColor={c.textSecondary}
              multiline
              style={[styles.input, styles.multiline, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
            />
          </Field>

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable
            onPress={submit}
            disabled={saving}
            style={({ pressed }) => [styles.cta, { opacity: saving ? 0.7 : pressed ? 0.9 : 1 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Create task</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <SelectModal
        c={c}
        visible={picker !== null}
        title={picker === 'doer' ? 'Pick a doer' : 'Pick a subject'}
        options={picker === 'doer' ? (form?.employees.map((e) => ({ key: e.id, label: e.name })) ?? []) : (form?.subjects.map((s) => ({ key: s, label: s })) ?? [])}
        allowNone={picker === 'subject'}
        onClose={() => setPicker(null)}
        onPick={(key) => {
          if (picker === 'doer') setDoerId(key);
          else setSubject(key);
          setPicker(null);
        }}
      />
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Select({ c, value, placeholder, onPress }: { c: Palette; value: string; placeholder?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.input, styles.select, { backgroundColor: c.backgroundElement, borderColor: c.border, opacity: pressed ? 0.9 : 1 }]}
    >
      <Text style={{ color: placeholder ? c.textSecondary : c.text, fontSize: Type.body }}>{value}</Text>
      <Ionicons name="chevron-down" size={18} color={c.textSecondary} />
    </Pressable>
  );
}

function SelectModal({
  c,
  visible,
  title,
  options,
  allowNone,
  onClose,
  onPick,
}: {
  c: Palette;
  visible: boolean;
  title: string;
  options: { key: string; label: string }[];
  allowNone?: boolean;
  onClose: () => void;
  onPick: (key: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.backgroundElement }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          <Text style={[styles.sheetTitle, { color: c.text }]}>{title}</Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search…"
            placeholderTextColor={c.textSecondary}
            style={[styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border, marginBottom: Spacing.three }]}
          />
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {allowNone ? (
              <Pressable onPress={() => onPick(null)} style={[styles.opt, { borderColor: c.border }]}>
                <Text style={{ color: c.textSecondary, fontSize: Type.body }}>None</Text>
              </Pressable>
            ) : null}
            {filtered.map((o) => (
              <Pressable key={o.key} onPress={() => onPick(o.key)} style={[styles.opt, { borderColor: c.border }]}>
                <Text style={{ color: c.text, fontSize: Type.body }}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: 1 },
  topTitle: { fontSize: Type.body, fontWeight: '700' },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.eight },
  field: { marginBottom: Spacing.four },
  fieldLabel: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1.2, marginBottom: Spacing.two },
  input: { minHeight: TouchTarget + 4, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, fontSize: Type.body },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  segment: { borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  segmentText: { fontSize: Type.label, fontWeight: '700' },
  err: { color: Brand.red, fontSize: Type.label, marginBottom: Spacing.three, fontWeight: '600' },
  cta: { height: TouchTarget + 8, borderRadius: Radius.md, backgroundColor: Brand.red, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.two },
  ctaText: { color: '#fff', fontSize: Type.bodyLg, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.five, paddingBottom: Spacing.eight },
  grabber: { width: 40, height: 4, borderRadius: Radius.pill, alignSelf: 'center', marginBottom: Spacing.four },
  sheetTitle: { fontSize: Type.title, fontWeight: '800', marginBottom: Spacing.three },
  opt: { paddingVertical: Spacing.three, borderBottomWidth: 1 },
});
