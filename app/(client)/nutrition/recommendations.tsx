import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { VFIcon } from '@/components/VFIcon';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const AMBER  = '#f5a623';

interface Recommendation {
  id: string;
  title: string;
  body: string | null;
  cover_photo_url: string | null;
  link_url: string | null;
  created_at: string;
}

export default function RecommendationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems]               = useState<Recommendation[]>([]);
  const [loading, setLoading]           = useState(true);
  const [query, setQuery]               = useState('');
  const [selected, setSelected]         = useState<Recommendation | null>(null);

  useFocusEffect(useCallback(() => {
    load();
  }, []));

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('nutrition_tips')
      .select('id, title, body, cover_photo_url, link_url, created_at')
      .eq('category', 'supplement')
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    setItems((data ?? []) as Recommendation[]);
    setLoading(false);
  }

  const filtered = query.trim()
    ? items.filter(r => r.title.toLowerCase().includes(query.toLowerCase()))
    : items;

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.hdrSide} onPress={() => smartBack(router)} hitSlop={8}>
            <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <Text style={s.hdrTitle}>Recommendations</Text>
          <TouchableOpacity
            style={[s.hdrSide, s.hdrRight]}
            onPress={() => router.navigate('/(client)' as any)}
            hitSlop={8}
          >
            <VFIcon size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={s.toolbar}>
        <View style={s.searchBar}>
          <SymbolView name="magnifyingglass" size={15} tintColor={MUTED} />
          <TextInput
            style={s.searchInput}
            placeholder="Search recommendations…"
            placeholderTextColor={MUTED}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <SymbolView name="xmark.circle.fill" size={15} tintColor={MUTED} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={s.loader}><ActivityIndicator color={ACCENT} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <SymbolView name="pills.fill" size={44} tintColor={MUTED} />
          <Text style={s.emptyTitle}>No recommendations yet</Text>
          <Text style={s.emptySub}>Your trainer will add supplements and tips here</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map(r => (
            <TouchableOpacity
              key={r.id}
              style={s.card}
              onPress={() => setSelected(r)}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#c87820', '#e89840']} style={s.thumb}>
                <SymbolView name="pills.fill" size={20} tintColor="rgba(255,255,255,0.9)" />
              </LinearGradient>
              <View style={s.info}>
                <Text style={s.name} numberOfLines={1}>{r.title}</Text>
                {!!r.body && <Text style={s.body} numberOfLines={2}>{r.body}</Text>}
              </View>
              <SymbolView name="chevron.right" size={14} tintColor={MUTED} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.overlay} onPress={() => setSelected(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <LinearGradient colors={['#c87820', '#e89840']} style={s.modalTop}>
              <SymbolView name="pills.fill" size={28} tintColor="rgba(255,255,255,0.9)" />
            </LinearGradient>
            <View style={{ height: 4, backgroundColor: AMBER }} />
            <View style={s.modalBody}>
              <Text style={s.modalTitle}>{selected?.title}</Text>
              {!!selected?.link_url && (
                <Text style={s.modalLink} numberOfLines={1}>{selected.link_url}</Text>
              )}
              {!!selected?.body && (
                <Text style={s.modalText}>{selected.body}</Text>
              )}
            </View>
            <TouchableOpacity style={s.modalClose} onPress={() => setSelected(null)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:    { backgroundColor: HEADER },
  headerRow: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  hdrSide:   { width: 48, alignItems: 'flex-start', justifyContent: 'center' },
  hdrRight:  { alignItems: 'flex-end' },
  hdrTitle:  { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },

  toolbar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  searchBar:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  searchInput:{ flex: 1, fontSize: 14, color: TEXT },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: TEXT, marginTop: 8 },
  emptySub:   { fontSize: 13, color: MUTED, textAlign: 'center', paddingHorizontal: 32 },

  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

  card:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 14, padding: 12, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  thumb: { width: 52, height: 52, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  info:  { flex: 1 },
  name:  { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 3 },
  body:  { fontSize: 11, color: MUTED, lineHeight: 15 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal:   { backgroundColor: CARD, borderRadius: 16, width: '85%', maxWidth: 340, overflow: 'hidden' },
  modalTop:  { height: 100, justifyContent: 'center', alignItems: 'center' },
  modalBody: { padding: 20, gap: 8 },
  modalTitle:{ fontSize: 17, fontWeight: '700', color: TEXT },
  modalLink: { fontSize: 13, color: ACCENT },
  modalText: { fontSize: 14, color: MUTED, lineHeight: 20 },
  modalClose:{ borderTopWidth: 1, borderTopColor: BORDER, paddingVertical: 14, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '600', color: MUTED },
});
