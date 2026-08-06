import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from '@/components/BottomSheet';
import { PlainGraphCard, type MeasPoint } from '@/app/(trainer)/client/[id]/progress-tab';
import { TAPE_SITES, tapeSiteLabel, sortSiteKeys, parseTapeValue } from '@/lib/tapeSites';

const CARD   = '#ffffff';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const CORAL  = '#e05555';

// ⚠️ NOT the same thing as `MeasurementsSubTab` in progress-tab.tsx — that one IS
// Body composition (scale/BIA numbers) and only carries the name for historical
// reasons. This is the tape: girth at a named site, over time.

export type TapeRow = {
  id: string;
  date: string;
  site: string;
  value_cm: number;
  created_by: string;
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function TapeMeasurementsTab({
  clientId,
  viewerId,
  canAdd = true,
}: {
  clientId: string;
  /** Who is looking — decides the "you" vs "trainer" badge on each row. */
  viewerId: string;
  canAdd?: boolean;
}) {
  const [rows, setRows] = useState<TapeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSite, setOpenSite] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('body_tape_measurements')
      .select('id, date, site, value_cm, created_by')
      .eq('client_id', clientId)
      .order('date', { ascending: true });
    if (!error) setRows((data ?? []) as TapeRow[]);
    setLoading(false);
  }, [clientId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // site → its history, oldest first (the query already orders by date)
  const bySite = useMemo(() => {
    const m = new Map<string, TapeRow[]>();
    rows.forEach(r => {
      const list = m.get(r.site);
      if (list) list.push(r); else m.set(r.site, [r]);
    });
    return m;
  }, [rows]);

  const siteKeys = useMemo(() => sortSiteKeys([...bySite.keys()]), [bySite]);
  const latestDate = useMemo(
    () => rows.reduce<string | null>((acc, r) => (acc == null || r.date > acc ? r.date : acc), null),
    [rows]
  );

  const saveRow = async (site: string, value: number, date: string) => {
    // Upsert on the table's (client_id, date, site) key — measuring the same site
    // twice in a day corrects the value rather than stacking a second row.
    const { error } = await supabase
      .from('body_tape_measurements')
      .upsert(
        { client_id: clientId, site, value_cm: value, date, created_by: viewerId },
        { onConflict: 'client_id,date,site' }
      );
    if (error) { Alert.alert('Could not save', error.message); return false; }
    await load();
    return true;
  };

  if (loading) {
    return <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>;
  }

  return (
    <View>
      {siteKeys.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyMark}>
            <SymbolView name="ruler.fill" size={40} tintColor="rgba(36,78,67,0.30)" />
          </View>
          <Text style={s.emptyTitle}>Nothing measured yet</Text>
          <Text style={s.emptyBody}>
            Tape measurements — biceps, waist, chest, thigh, or anything else Vitek
            measures — recorded each time, so you can watch a single number move.
          </Text>
        </View>
      ) : (
        <>
          <View style={s.head}>
            <Text style={s.headDate}>{latestDate ? fmtDate(latestDate) : ''}</Text>
            <Text style={s.headSub}>{siteKeys.length} {siteKeys.length === 1 ? 'body part' : 'body parts'}</Text>
          </View>

          {siteKeys.map(site => {
            const hist = bySite.get(site)!;
            const latest = hist[hist.length - 1];
            const first = hist[0];
            // Change since the FIRST measurement, not the previous one — a tape
            // site moves slowly, and "since you started" is the number that means
            // something. The full trend is one tap away in the graph.
            const delta = hist.length > 1 ? latest.value_cm - first.value_cm : null;
            const isOpen = openSite === site;
            return (
              <View key={site} style={s.card}>
                <TouchableOpacity
                  style={s.row}
                  onPress={() => setOpenSite(isOpen ? null : site)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.siteName}>{tapeSiteLabel(site)}</Text>
                    <Text style={s.siteMeta}>
                      {hist.length} {hist.length === 1 ? 'entry' : 'entries'} · {fmtDate(latest.date)}
                    </Text>
                  </View>
                  <Text style={s.value}>{latest.value_cm.toFixed(1)}<Text style={s.unit}> cm</Text></Text>
                  {delta != null && Math.abs(delta) >= 0.05 && (
                    <View style={[s.delta, delta > 0 ? s.deltaUp : s.deltaDown]}>
                      <Text style={[s.deltaText, { color: delta > 0 ? ACCENT : CORAL }]}>
                        {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)}
                      </Text>
                    </View>
                  )}
                  <SymbolView
                    name={isOpen ? 'chevron.up' : 'chevron.down'}
                    size={13}
                    tintColor={MUTED}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={s.expand}>
                    {hist.length > 1 ? (
                      <PlainGraphCard
                        title={tapeSiteLabel(site)}
                        data={hist.map(h => ({ date: h.date, value: h.value_cm })) as MeasPoint[]}
                        unit="cm"
                      />
                    ) : (
                      <Text style={s.onePoint}>
                        One measurement so far — the graph appears from the second.
                      </Text>
                    )}
                    {[...hist].reverse().map(h => (
                      <View key={h.id} style={s.histRow}>
                        <Text style={s.histDate}>{fmtDate(h.date)}</Text>
                        <Text style={s.histVal}>{h.value_cm.toFixed(1)} cm</Text>
                        <View style={[s.by, h.created_by === viewerId ? s.byYou : s.byTrainer]}>
                          <Text style={[s.byText, h.created_by === viewerId ? s.byTextYou : s.byTextTrainer]}>
                            {h.created_by === viewerId ? 'You' : 'Trainer'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {canAdd && (
        <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)} activeOpacity={0.8}>
          <Text style={s.addBtnText}>Add measurement</Text>
        </TouchableOpacity>
      )}

      {addOpen && (
        <AddMeasurementSheet
          knownSites={siteKeys}
          onClose={() => setAddOpen(false)}
          onSave={saveRow}
        />
      )}
    </View>
  );
}

// ─── Add sheet ───────────────────────────────────────────────────────────────
// ⚠️ The site picker is INLINE pills, not a nested picker sheet. Presenting a
// second Modal from inside a presented one is the trap that froze Do Mode — iOS
// won't draw it but its overlay eats every tap. Same reason the date is a ‹ › row
// rather than a calendar.

function AddMeasurementSheet({
  knownSites, onClose, onSave,
}: {
  knownSites: string[];
  onClose: () => void;
  onSave: (site: string, value: number, date: string) => Promise<boolean>;
}) {
  const [site, setSite] = useState<string | null>(null);
  const [customOn, setCustomOn] = useState(false);
  const [custom, setCustom] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  // Presets, plus any custom site already used for this client so it can be
  // measured again with one tap instead of retyped.
  const pills = useMemo(() => {
    const preset = TAPE_SITES.map(x => x.key);
    const extras = knownSites.filter(k => !preset.includes(k));
    return [...preset, ...extras];
  }, [knownSites]);

  const resolvedSite = customOn ? custom.trim() : site;
  const parsed = parseTapeValue(value);
  const canSave = !!resolvedSite && parsed != null && !saving;

  return (
    <BottomSheet avoidKeyboard onClose={onClose}>
      {close => (
        <View style={sh.wrap}>
          <Text style={sh.title}>Add measurement</Text>

          <Text style={sh.label}>BODY PART</Text>
          <View style={sh.pills}>
            {pills.map(k => {
              const on = !customOn && site === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => { setCustomOn(false); setSite(k); }}
                  style={[sh.pill, on && sh.pillOn]}
                >
                  <Text style={[sh.pillText, on && sh.pillTextOn]}>{tapeSiteLabel(k)}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => { setCustomOn(true); setSite(null); }}
              style={[sh.pill, sh.pillOther, customOn && sh.pillOn]}
            >
              <Text style={[sh.pillText, customOn && sh.pillTextOn]}>+ Other</Text>
            </Pressable>
          </View>

          {customOn && (
            <TextInput
              style={sh.input}
              value={custom}
              onChangeText={setCustom}
              placeholder="Name it — shoulder, wrist, anything"
              placeholderTextColor="#bbb"
              autoFocus
              returnKeyType="done"
            />
          )}

          <Text style={sh.label}>VALUE</Text>
          <View style={sh.valueRow}>
            <TextInput
              style={[sh.input, sh.valueInput]}
              value={value}
              onChangeText={setValue}
              placeholder="0.0"
              placeholderTextColor="#bbb"
              keyboardType="decimal-pad"
            />
            <Text style={sh.cm}>cm</Text>
          </View>

          <Text style={sh.label}>DATE</Text>
          <View style={sh.dateRow}>
            <TouchableOpacity onPress={() => setDate(d => shiftIso(d, -1))} hitSlop={12} style={sh.dateBtn}>
              <SymbolView name="chevron.left" size={15} tintColor={HEADER} weight="semibold" />
            </TouchableOpacity>
            <Text style={sh.dateText}>{date === todayIso() ? 'Today' : fmtDate(date)}</Text>
            <TouchableOpacity
              onPress={() => setDate(d => (d >= todayIso() ? d : shiftIso(d, 1)))}
              hitSlop={12}
              style={sh.dateBtn}
              disabled={date >= todayIso()}
            >
              <SymbolView
                name="chevron.right"
                size={15}
                tintColor={date >= todayIso() ? '#ccc' : HEADER}
                weight="semibold"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[sh.save, !canSave && sh.saveOff]}
            disabled={!canSave}
            activeOpacity={0.85}
            onPress={async () => {
              if (!resolvedSite || parsed == null) return;
              setSaving(true);
              const ok = await onSave(resolvedSite, parsed, date);
              setSaving(false);
              if (ok) close();
            }}
          >
            <Text style={sh.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => close()} style={sh.cancel} activeOpacity={0.7}>
            <Text style={sh.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  loader: { paddingVertical: 40, alignItems: 'center' },

  empty:      { alignItems: 'center', paddingHorizontal: 18, paddingTop: 30, paddingBottom: 10 },
  emptyMark:  { width: 84, height: 84, borderRadius: 26, backgroundColor: '#e9efec', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 14, lineHeight: 21, color: MUTED, textAlign: 'center' },

  head:     { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  headDate: { fontSize: 15, fontWeight: '700', color: TEXT },
  headSub:  { fontSize: 12, color: MUTED },

  card: {
    backgroundColor: CARD, borderRadius: 14, marginBottom: 8, paddingHorizontal: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  siteName: { fontSize: 15, fontWeight: '600', color: TEXT },
  siteMeta: { fontSize: 11, color: MUTED, marginTop: 2 },
  value:    { fontSize: 17, fontWeight: '700', color: TEXT },
  unit:     { fontSize: 12, fontWeight: '600', color: MUTED },

  delta:     { borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  deltaUp:   { backgroundColor: 'rgba(36,172,136,0.12)' },
  deltaDown: { backgroundColor: 'rgba(224,85,85,0.10)' },
  deltaText: { fontSize: 11, fontWeight: '700' },

  expand:   { borderTopWidth: 1, borderTopColor: '#f0f0ee', paddingTop: 10, paddingBottom: 6 },
  onePoint: { fontSize: 13, color: MUTED, fontStyle: 'italic', paddingVertical: 8 },
  histRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f6f6f4' },
  histDate: { fontSize: 13, color: TEXT, flex: 1 },
  histVal:  { fontSize: 13, fontWeight: '700', color: TEXT },

  by:            { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  byYou:         { backgroundColor: '#f0f8f5' },
  byTrainer:     { backgroundColor: '#edf4ff' },
  byText:        { fontSize: 10, fontWeight: '700' },
  byTextYou:     { color: ACCENT },
  byTextTrainer: { color: '#4a6fa5' },

  addBtn:     { borderRadius: 100, backgroundColor: '#f5f5f3', paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  addBtnText: { color: ACCENT, fontWeight: '700', fontSize: 15 },
});

const sh = StyleSheet.create({
  wrap:  { paddingHorizontal: 20 },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', paddingTop: 2, paddingBottom: 14 },
  label: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },

  pills:       { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill:        { borderRadius: 100, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  pillOn:      { backgroundColor: ACCENT },
  pillOther:   { backgroundColor: '#f5f5f3' },
  pillText:    { fontSize: 13, fontWeight: '600', color: TEXT },
  pillTextOn:  { color: '#fff', fontWeight: '700' },

  input: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: TEXT, marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  valueRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valueInput: { flex: 1, marginTop: 0 },
  cm:         { fontSize: 15, fontWeight: '600', color: MUTED },

  dateRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  dateBtn:  { paddingHorizontal: 10, paddingVertical: 2 },
  dateText: { fontSize: 15, fontWeight: '600', color: TEXT },

  save:       { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  saveOff:    { opacity: 0.4 },
  saveText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel:     { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#414b45', fontSize: 14, fontWeight: '600' },
});
