import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { SymbolView } from 'expo-symbols';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { VFIcon } from '@/components/VFIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const CORAL  = '#e05555';

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

interface GroceryItem {
  id: string;
  client_id: string;
  name: string;
  quantity: string | null;
  is_checked: boolean;
  checked_at: string | null;
  created_at: string;
}

function formatCheckedDate(iso: string | null): string {
  if (!iso) return 'Today';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const ds = (x: Date) => x.toDateString();
  if (ds(d) === ds(today)) return 'Today';
  if (ds(d) === ds(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function groupByDate(items: GroceryItem[]): { label: string; items: GroceryItem[] }[] {
  const map = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const label = formatCheckedDate(item.checked_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(item);
  }
  // Sort groups: Today first, Yesterday second, then oldest-first
  const order = (label: string) => {
    if (label === 'Today') return 0;
    if (label === 'Yesterday') return 1;
    return 2;
  };
  return [...map.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([label, items]) => ({ label, items }));
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function GroceryRow({
  item,
  onCheck,
  onUncheck,
  onDeleteRequest,
}: {
  item: GroceryItem;
  onCheck: (item: GroceryItem) => void;
  onUncheck: (item: GroceryItem) => void;
  onDeleteRequest: (item: GroceryItem) => void;
}) {
  const swipeRef = useRef<any>(null);

  const close = () => swipeRef.current?.close();

  const renderLeftActions = () => (
    <TouchableOpacity
      style={[st.swipeAction, st.swipeActionGreen]}
      onPress={() => { close(); item.is_checked ? onUncheck(item) : onCheck(item); }}
      activeOpacity={0.85}
    >
      <SymbolView
        name={item.is_checked ? 'arrow.uturn.backward' : 'checkmark'}
        size={18}
        tintColor="#fff"
      />
      <Text style={st.swipeActionText}>{item.is_checked ? 'Uncheck' : 'Bought'}</Text>
    </TouchableOpacity>
  );

  const renderRightActions = () => (
    <TouchableOpacity
      style={[st.swipeAction, st.swipeActionRed]}
      onPress={() => { close(); onDeleteRequest(item); }}
      activeOpacity={0.85}
    >
      <SymbolView name="trash.fill" size={18} tintColor="#fff" />
      <Text style={st.swipeActionText}>Delete</Text>
    </TouchableOpacity>
  );

  return (
    <View style={st.wrap}>
      <Swipeable
        ref={swipeRef}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        overshootLeft={false}
        overshootRight={false}
        containerStyle={{ overflow: 'hidden', borderRadius: 12 }}
      >
        <View style={[st.row, item.is_checked && st.rowChecked]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.name, item.is_checked && st.nameChecked]} numberOfLines={2}>
              {item.name}
            </Text>
            {item.quantity ? <Text style={st.qty}>{item.quantity}</Text> : null}
          </View>
          {/* Circle on right */}
          <TouchableOpacity
            style={[st.circle, item.is_checked && st.circleFilled]}
            onPress={() => item.is_checked ? onUncheck(item) : onCheck(item)}
            hitSlop={8}
          >
            {item.is_checked && <SymbolView name="checkmark" size={13} tintColor="#fff" weight="semibold" />}
          </TouchableOpacity>
        </View>
      </Swipeable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:             { marginBottom: 8, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  row:              { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  rowChecked:       { backgroundColor: '#f7f7f4' },
  name:             { fontSize: 15, fontWeight: '500', color: TEXT },
  nameChecked:      { color: MUTED, textDecorationLine: 'line-through' },
  qty:              { fontSize: 12, color: MUTED, marginTop: 2 },
  circle:           { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#d0d0cc', alignItems: 'center', justifyContent: 'center' },
  circleFilled:     { backgroundColor: ACCENT, borderColor: ACCENT },
  swipeAction:      { width: 80, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeActionGreen: { backgroundColor: ACCENT, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  swipeActionRed:   { backgroundColor: CORAL, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  swipeActionText:  { fontSize: 11, fontWeight: '600', color: '#fff' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GroceryListScreen() {
  const { profile } = useAuth();
  const router      = useRouter();
  const headerH     = useHeaderHeight();
  const tabBarH     = useTabBarHeight();
  const clientId    = profile?.id ?? '';

  const [items, setItems]     = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add item modal
  const [addModal, setAddModal]       = useState(false);
  const [addName, setAddName]         = useState('');
  const [addQuantity, setAddQuantity] = useState('');
  const [adding, setAdding]           = useState(false);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<GroceryItem | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from('grocery_list_items')
      .select('*')
      .eq('client_id', clientId)
      .order('is_checked', { ascending: true })
      .order('checked_at', { ascending: false })
      .order('created_at', { ascending: true });
    setItems((data ?? []) as GroceryItem[]);
  }, [clientId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const checkItem = async (item: GroceryItem) => {
    const now = new Date().toISOString();
    setItems(prev => {
      const updated = prev.map(i =>
        i.id === item.id ? { ...i, is_checked: true, checked_at: now } : i
      );
      return [...updated.filter(i => !i.is_checked), ...updated.filter(i => i.is_checked)];
    });
    await supabase.from('grocery_list_items')
      .update({ is_checked: true, checked_at: now })
      .eq('id', item.id);
  };

  const uncheckItem = async (item: GroceryItem) => {
    setItems(prev => {
      const updated = prev.map(i =>
        i.id === item.id ? { ...i, is_checked: false, checked_at: null } : i
      );
      return [...updated.filter(i => !i.is_checked), ...updated.filter(i => i.is_checked)];
    });
    await supabase.from('grocery_list_items')
      .update({ is_checked: false, checked_at: null })
      .eq('id', item.id);
  };

  const confirmDelete = (item: GroceryItem) => setDeleteTarget(item);

  const deleteItem = async () => {
    if (!deleteTarget) return;
    setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
    await supabase.from('grocery_list_items').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null);
  };

  const addItem = async () => {
    const name = addName.trim();
    if (!name || adding) return;
    setAdding(true);
    const row: GroceryItem = {
      id: makeUUID(),
      client_id: clientId,
      name,
      quantity: addQuantity.trim() || null,
      is_checked: false,
      checked_at: null,
      created_at: new Date().toISOString(),
    };
    setItems(prev => [row, ...prev.filter(i => !i.is_checked), ...prev.filter(i => i.is_checked)]);
    setAddModal(false);
    setAddName('');
    setAddQuantity('');
    setAdding(false);
    await supabase.from('grocery_list_items').insert({
      id: row.id, client_id: clientId, name: row.name,
      quantity: row.quantity, is_checked: false,
    });
  };

  const unchecked = items.filter(i => !i.is_checked);
  const checked   = items.filter(i => i.is_checked);
  const boughtGroups = groupByDate(checked);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <View style={[s.toolbar, { paddingTop: headerH + 8 }]}>
        <TouchableOpacity style={s.addBtn} onPress={() => setAddModal(true)} activeOpacity={0.8}>
          <SymbolView name="plus" size={15} tintColor="#fff" />
          <Text style={s.addBtnText}>Add item</Text>
        </TouchableOpacity>
        <Text style={s.hint}>{unchecked.length} to buy · {checked.length} bought</Text>
      </View>

      {loading ? (
        <View style={s.loader}><ActivityIndicator color={ACCENT} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <SymbolView name="cart" size={52} tintColor={MUTED} />
          <Text style={s.emptyTitle}>Your grocery list is empty</Text>
          <Text style={s.emptySub}>Add items manually or from the food log</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setAddModal(true)} activeOpacity={0.8}>
            <Text style={s.emptyBtnText}>Add first item</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[s.list, { paddingBottom: tabBarH + 16 }]}
          scrollIndicatorInsets={{ bottom: tabBarH }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── To buy ────────────────────────────────────────────── */}
          {unchecked.length > 0 && (
            <>
              <Text style={s.sectionLabel}>TO BUY ({unchecked.length})</Text>
              {unchecked.map(item => (
                <GroceryRow
                  key={item.id}
                  item={item}
                  onCheck={checkItem}
                  onUncheck={uncheckItem}
                  onDeleteRequest={confirmDelete}
                />
              ))}
            </>
          )}

          {/* ── Bought items grouped by date ───────────────────── */}
          {boughtGroups.map(group => (
            <View key={group.label}>
              <Text style={s.sectionLabel}>BOUGHT — {group.label.toUpperCase()}</Text>
              {group.items.map(item => (
                <GroceryRow
                  key={item.id}
                  item={item}
                  onCheck={checkItem}
                  onUncheck={uncheckItem}
                  onDeleteRequest={confirmDelete}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Add item modal ──────────────────────────────────────────── */}
      {addModal && (
        <BottomSheet onClose={() => setAddModal(false)} avoidKeyboard>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={s.modalTitle}>Add item</Text>
              <TextInput
                style={s.input}
                value={addName}
                onChangeText={setAddName}
                placeholder="Item name"
                placeholderTextColor={MUTED}
                autoFocus
                returnKeyType="next"
              />
              <TextInput
                style={[s.input, { marginTop: 10 }]}
                value={addQuantity}
                onChangeText={setAddQuantity}
                placeholder="Quantity (optional) — e.g. 500g"
                placeholderTextColor={MUTED}
                returnKeyType="done"
                onSubmitEditing={addItem}
              />
              <TouchableOpacity
                style={[s.confirmBtn, (!addName.trim() || adding) && { opacity: 0.45 }]}
                onPress={addItem}
                disabled={!addName.trim() || adding}
                activeOpacity={0.8}
              >
                <Text style={s.confirmBtnText}>Add to list</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelLink} onPress={() => close()}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* ── Delete confirmation modal ───────────────────────────────── */}
      <Modal visible={deleteTarget !== null} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <TouchableOpacity style={s.overlay} onPress={() => setDeleteTarget(null)} activeOpacity={1}>
          <TouchableOpacity style={s.modal} activeOpacity={1}>
            <Text style={s.modalTitle}>Remove item?</Text>
            <Text style={s.modalSub}>"{deleteTarget?.name}" will be removed from your grocery list.</Text>
            <TouchableOpacity style={[s.confirmBtn, { backgroundColor: CORAL }]} onPress={deleteItem} activeOpacity={0.8}>
              <Text style={s.confirmBtnText}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelLink} onPress={() => setDeleteTarget(null)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <LightHeader
        plain
        left={<HeaderIcon onPress={() => smartBack(router)}><SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" /></HeaderIcon>}
        title="Grocery List"
        right={<HeaderIcon onPress={() => router.navigate('/(client)' as any)}><VFIcon size={26} color={HEADER_ICON} /></HeaderIcon>}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  toolbar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  hint:       { fontSize: 12, color: MUTED },

  list:         { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, gap: 8 },
  emptyTitle:   { fontSize: 16, fontWeight: '600', color: TEXT, marginTop: 12 },
  emptySub:     { fontSize: 13, color: MUTED, textAlign: 'center', paddingHorizontal: 32 },
  emptyBtn:     { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 20, paddingVertical: 10, marginTop: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal:      { backgroundColor: CARD, borderRadius: 16, padding: 24, width: '82%', maxWidth: 340 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 6 },
  modalSub:   { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16, lineHeight: 19 },

  input:          { backgroundColor: BG, borderRadius: 10, padding: 12, fontSize: 15, color: TEXT },
  confirmBtn:     { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelLink:     { alignSelf: 'center', marginTop: 12 },
  cancelText:     { fontSize: 14, color: MUTED },
});
