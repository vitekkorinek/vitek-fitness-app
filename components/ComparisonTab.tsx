import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from '@/components/BottomSheet';
import GlassPanel from '@/components/GlassPanel';
import {
  PHOTO_SLOTS, photoSlotLabel, photoSlotHint, sortSlotKeys,
} from '@/lib/photoSlots';
import PoseIcon, { poseShapeFor } from '@/components/PoseIcon';

const CARD   = '#ffffff';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const CORAL  = '#e05555';

const SCREEN_W = Dimensions.get('window').width;
const PANE_W   = SCREEN_W - 32;          // the tab's content sits inside padding 16
const PANE_H   = Math.round(PANE_W * 4 / 3);
const HALF_W   = Math.floor((PANE_W - 8) / 2);
const HALF_H   = Math.round(HALF_W * 4 / 3);

const SIGNED_TTL = 60 * 60;              // 1h — long enough for a session on the tab

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * ⚠️ OPTIONAL REQUIRE, the same pattern as lib/appIcons.ts and lib/liveActivity.ts.
 * This JS reaches builds that do NOT contain the expo-sensors native module —
 * every existing TestFlight build, since the module was added Aug 6 2026 — and a
 * bare `import` would throw at load and take the whole tab with it. Where it is
 * missing there is simply no angle matching, which degrades to exactly the
 * behaviour before the feature existed.
 */
type DeviceMotionModule = {
  setUpdateInterval(ms: number): void;
  addListener(cb: (d: { rotation?: { alpha: number; beta: number; gamma: number } }) => void):
    { remove(): void };
};
let DeviceMotion: DeviceMotionModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DeviceMotion = require('expo-sensors').DeviceMotion ?? null;
} catch {
  DeviceMotion = null;
}
export const angleMatchSupported = DeviceMotion != null;

type PhotoRow = {
  id: string;
  slot: string;
  date: string;
  storage_path: string;
  shared_with_trainer: boolean;
  device_pitch: number | null;
  device_roll: number | null;
};

/** Degrees of slack before the angle stops counting as "the same". Tight enough
 *  that a matched pair really does line up, loose enough that a person can hit it
 *  holding a phone at arm's length. */
const ANGLE_TOL = 4;

type WeightPoint = { date: string; weight_kg: number | null };

/** One candidate alignment reference for the camera. */
type GhostRef = {
  id: string;
  date: string;
  url?: string;
  angle: { pitch: number; roll: number } | null;
};

function toGhostRef(p: PhotoRow, urls: Map<string, string>): GhostRef {
  return {
    id: p.id,
    date: p.date,
    url: urls.get(p.storage_path),
    angle: p.device_pitch != null && p.device_roll != null
      ? { pitch: Number(p.device_pitch), roll: Number(p.device_roll) }
      : null,
  };
}

export default function ComparisonTab({
  clientId, onScrollLock,
}: {
  clientId: string;
  /** Freezes the PARENT ScrollView while the slider is being dragged. A JS
   *  PanResponder does not reliably stop a native ScrollView from also panning, so
   *  the only dependable fix is to disable scrolling outright for the drag —
   *  Vitek: "if i go a bit higher with the finger the screen moves as well". */
  onScrollLock?: (locked: boolean) => void;
}) {
  const [photos, setPhotos]   = useState<PhotoRow[]>([]);
  const [urls, setUrls]       = useState<Map<string, string>>(new Map());
  const [weights, setWeights] = useState<WeightPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [slot, setSlot]         = useState<string>('front');
  const [extraSlots, setExtraSlots] = useState<string[]>([]);
  const [mode, setMode]         = useState<'side' | 'slider'>('side');
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId]   = useState<string | null>(null);
  const [picking, setPicking]   = useState<'before' | 'after'>('after');

  const [addOpen, setAddOpen]       = useState(false);
  const [slotSheetOpen, setSlotSheetOpen] = useState(false);
  const [newSlotOpen, setNewSlotOpen] = useState(false);
  const [menuPhoto, setMenuPhoto]   = useState<PhotoRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PhotoRow | null>(null);
  const [camOpen, setCamOpen]       = useState(false);
  const [busy, setBusy]             = useState(false);

  // ── load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    const [{ data: rows }, { data: meas }] = await Promise.all([
      supabase
        .from('progress_photos')
        .select('id, slot, date, storage_path, shared_with_trainer, device_pitch, device_roll')
        .eq('client_id', clientId)
        .order('date', { ascending: true }),
      supabase
        .from('measurements')
        .select('date, weight_kg')
        .eq('client_id', clientId)
        .order('date', { ascending: true }),
    ]);
    const list = (rows ?? []) as PhotoRow[];
    setPhotos(list);
    setWeights((meas ?? []) as WeightPoint[]);

    // ⚠️ PRIVATE bucket — there is no public URL to build. Every read is a signed
    // URL, batched in one call rather than one round trip per thumbnail.
    if (list.length) {
      const { data: signed } = await supabase.storage
        .from('progress-photos')
        .createSignedUrls(list.map(p => p.storage_path), SIGNED_TTL);
      const m = new Map<string, string>();
      (signed ?? []).forEach(sg => {
        if (sg.signedUrl && sg.path) m.set(sg.path, sg.signedUrl);
      });
      setUrls(m);
    } else {
      setUrls(new Map());
    }
    setLoading(false);
  }, [clientId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── derived ────────────────────────────────────────────────────────────────
  const usedSlots = useMemo(
    () => sortSlotKeys([...new Set(photos.map(p => p.slot))]),
    [photos]
  );
  const slotKeys = useMemo(() => {
    const preset = PHOTO_SLOTS.map(sl => sl.key);
    return [...preset, ...sortSlotKeys([...new Set([...usedSlots, ...extraSlots])].filter(k => !preset.includes(k)))];
  }, [usedSlots, extraSlots]);

  const slotPhotos = useMemo(
    () => photos.filter(p => p.slot === slot),
    [photos, slot]
  );

  // Default the pair to first ↔ latest whenever the slot's contents change, but
  // never clobber a pick the user has already made in this slot.
  useEffect(() => {
    if (slotPhotos.length === 0) { setBeforeId(null); setAfterId(null); return; }
    const ids = new Set(slotPhotos.map(p => p.id));
    setBeforeId(prev => (prev && ids.has(prev) ? prev : slotPhotos[0].id));
    setAfterId(prev => (prev && ids.has(prev) ? prev : slotPhotos[slotPhotos.length - 1].id));
  }, [slotPhotos]);

  const before = slotPhotos.find(p => p.id === beforeId) ?? null;
  const after  = slotPhotos.find(p => p.id === afterId)  ?? null;
  const latest = slotPhotos.length ? slotPhotos[slotPhotos.length - 1] : null;

  // Weight recorded on or before a photo's date — ties Comparison to Body
  // composition, so the picture and the number tell the same story.
  const weightAt = useCallback((iso: string): string | null => {
    let found: number | null = null;
    for (const w of weights) {
      if (w.date <= iso && w.weight_kg != null) found = Number(w.weight_kg);
      else if (w.date > iso) break;
    }
    return found != null ? `${found} kg` : null;
  }, [weights]);

  // ── writes ─────────────────────────────────────────────────────────────────
  const uploadPhoto = async (uri: string, forSlot: string, angle?: { pitch: number; roll: number } | null) => {
    setBusy(true);
    try {
      const resp = await fetch(uri);
      // ⚠️ arrayBuffer(), never blob() — blob() crashes in React Native.
      const buf = await resp.arrayBuffer();
      const path = `${clientId}/${makeUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('progress-photos')
        .upload(path, buf, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      const { error: rowErr } = await supabase.from('progress_photos').insert({
        client_id: clientId,
        slot: forSlot,
        date: todayIso(),
        storage_path: path,
        // Library picks have no angle to record — NULL is a valid, expected value.
        device_pitch: angle ? Math.round(angle.pitch * 100) / 100 : null,
        device_roll:  angle ? Math.round(angle.roll  * 100) / 100 : null,
      });
      if (rowErr) throw rowErr;
      await load();
    } catch (e: any) {
      Alert.alert('Could not save photo', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async (forSlot: string) => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    await uploadPhoto(res.assets[0].uri, forSlot);
  };

  const toggleShare = async (p: PhotoRow) => {
    const next = !p.shared_with_trainer;
    setPhotos(list => list.map(x => (x.id === p.id ? { ...x, shared_with_trainer: next } : x)));
    setMenuPhoto(m => (m && m.id === p.id ? { ...m, shared_with_trainer: next } : m));
    const { error } = await supabase
      .from('progress_photos')
      .update({ shared_with_trainer: next })
      .eq('id', p.id);
    if (error) { Alert.alert('Could not change sharing', error.message); load(); }
  };

  const deletePhoto = async (p: PhotoRow) => {
    // Storage first: an orphaned OBJECT is invisible and un-deletable from the UI,
    // whereas an orphaned ROW is at least visible and fixable.
    const { error: sErr } = await supabase.storage.from('progress-photos').remove([p.storage_path]);
    if (sErr) { Alert.alert('Could not delete', sErr.message); return; }
    const { error } = await supabase.from('progress_photos').delete().eq('id', p.id);
    if (error) { Alert.alert('Could not delete', error.message); return; }
    await load();
  };

  if (loading) {
    return <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>;
  }

  const sharedCount = photos.filter(p => p.shared_with_trainer).length;

  return (
    <View>
      {/* ── privacy line — the first thing on the tab, deliberately ── */}
      <View style={s.privacy}>
        <SymbolView name="lock.fill" size={12} tintColor={HEADER} />
        <Text style={s.privacyText}>
          {sharedCount === 0
            ? 'Private to you. Vitek sees nothing until you share a photo.'
            : `${sharedCount} of ${photos.length} shared with Vitek. The rest stay private.`}
        </Text>
      </View>

      {/* ── pose slot — a dropdown, not a pill row ──
          Vitek: "the category can be drop down menu with also small silhouette in
          front of the title as a icon". A pill row also scaled badly: six presets
          plus custom poses ran off the edge, and the thing you are looking at
          deserves to be stated once, in full. */}
      <TouchableOpacity style={s.slotBtn} onPress={() => setSlotSheetOpen(true)} activeOpacity={0.75}>
        <PoseIcon shape={poseShapeFor(slot)} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={s.slotBtnLabel}>{photoSlotLabel(slot)}</Text>
          <Text style={s.slotBtnSub}>
            {slotPhotos.length === 0
              ? 'No photos yet'
              : `${slotPhotos.length} ${slotPhotos.length === 1 ? 'photo' : 'photos'}`}
          </Text>
        </View>
        <SymbolView name="chevron.down" size={13} tintColor={MUTED} />
      </TouchableOpacity>

      {slotPhotos.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyMark}>
            <SymbolView name="camera.fill" size={34} tintColor="rgba(36,78,67,0.30)" />
          </View>
          <Text style={s.emptyTitle}>No {photoSlotLabel(slot).toLowerCase()} photo yet</Text>
          <Text style={s.emptyBody}>{photoSlotHint(slot)}</Text>
        </View>
      ) : slotPhotos.length === 1 ? (
        /* ⚠️ ONE photo is not a comparison. With a single row `before` and `after`
           both resolve to it, so the side-by-side showed the same picture twice and
           read as a bug — Vitek: "it automatically did before and after picture but
           only one picture was saved". Nothing was wrong with the save; the compare
           UI simply must not appear until there are two. */
        <View>
          <View style={s.singleWrap}>
            {urls.get(slotPhotos[0].storage_path) ? (
              <Image source={{ uri: urls.get(slotPhotos[0].storage_path)! }} style={s.singleImg} resizeMode="cover" />
            ) : <View style={[s.singleImg, s.paneEmpty]} />}
            <TouchableOpacity style={s.paneMenu} onPress={() => setMenuPhoto(slotPhotos[0])} hitSlop={10}>
              <SymbolView name="ellipsis" size={15} tintColor="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={s.paneDate}>{fmtShort(slotPhotos[0].date)}</Text>
          {weightAt(slotPhotos[0].date) && <Text style={s.paneWeight}>{weightAt(slotPhotos[0].date)}</Text>}
          <Text style={s.singleHint}>
            Your first {photoSlotLabel(slot).toLowerCase()} photo. Take another one later and they
            appear here side by side.
          </Text>
        </View>
      ) : (
        <>
          {/* ── mode switcher (Type 1) ── */}
          <View style={s.modeBar}>
            {(['side', 'slider'] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[s.modeItem, mode === m && s.modeItemOn]}
                onPress={() => setMode(m)}
                activeOpacity={0.8}
              >
                <Text style={[s.modeText, mode === m && s.modeTextOn]}>
                  {m === 'side' ? 'Side by side' : 'Slider'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'side' ? (
            <View style={s.sideRow}>
              <SidePane
                label="BEFORE"
                photo={before}
                url={before ? urls.get(before.storage_path) : undefined}
                weight={before ? weightAt(before.date) : null}
                active={picking === 'before'}
                onPress={() => setPicking('before')}
              />
              <SidePane
                label="AFTER"
                photo={after}
                url={after ? urls.get(after.storage_path) : undefined}
                weight={after ? weightAt(after.date) : null}
                active={picking === 'after'}
                onPress={() => setPicking('after')}
                onMenu={after ? () => setMenuPhoto(after) : undefined}
              />
            </View>
          ) : (
            <SliderPane
              onLock={onScrollLock}
              beforeUrl={before ? urls.get(before.storage_path) : undefined}
              afterUrl={after ? urls.get(after.storage_path) : undefined}
              beforeLabel={before ? fmtShort(before.date) : '—'}
              afterLabel={after ? fmtShort(after.date) : '—'}
            />
          )}

          {/* ── filmstrip ── */}
          {/* ⚠️ Both ends must be choosable in BOTH modes. Side-by-side lets you
              tap a pane to switch ends, but the slider has no panes — so until
              this row existed you could only ever change the AFTER photo there.
              Vitek: "i can also want to compare first and last or last and before
              last". */}
          <View style={s.pickRow}>
            <TouchableOpacity
              style={[s.pickChip, picking === 'before' && s.pickChipOn]}
              onPress={() => setPicking('before')}
              activeOpacity={0.75}
            >
              <Text style={[s.pickChipLabel, picking === 'before' && s.pickChipLabelOn]}>BEFORE</Text>
              <Text style={[s.pickChipDate, picking === 'before' && s.pickChipDateOn]}>
                {before ? fmtShort(before.date) : '—'}
              </Text>
            </TouchableOpacity>
            <SymbolView name="arrow.left.arrow.right" size={13} tintColor={MUTED} />
            <TouchableOpacity
              style={[s.pickChip, picking === 'after' && s.pickChipOn]}
              onPress={() => setPicking('after')}
              activeOpacity={0.75}
            >
              <Text style={[s.pickChipLabel, picking === 'after' && s.pickChipLabelOn]}>AFTER</Text>
              <Text style={[s.pickChipDate, picking === 'after' && s.pickChipDateOn]}>
                {after ? fmtShort(after.date) : '—'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={s.stripLabel}>
            {picking === 'before' ? 'TAP A PHOTO TO SET THE BEFORE' : 'TAP A PHOTO TO SET THE AFTER'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ alignItems: 'center', gap: 8, paddingRight: 4, paddingVertical: 2 }}
          >
            {slotPhotos.map(p => {
              const sel = picking === 'before' ? p.id === beforeId : p.id === afterId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => (picking === 'before' ? setBeforeId(p.id) : setAfterId(p.id))}
                  onLongPress={() => setMenuPhoto(p)}
                  style={[s.thumb, sel && s.thumbOn]}
                >
                  {urls.get(p.storage_path) ? (
                    <Image source={{ uri: urls.get(p.storage_path)! }} style={s.thumbImg} />
                  ) : (
                    <View style={[s.thumbImg, s.thumbEmpty]} />
                  )}
                  <Text style={[s.thumbDate, sel && s.thumbDateOn]} numberOfLines={1}>
                    {fmtShort(p.date)}
                  </Text>
                  {p.shared_with_trainer && (
                    <View style={s.sharedDot}>
                      <SymbolView name="eye.fill" size={8} tintColor="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={s.stripHint}>Long-press a photo to share or delete it.</Text>
        </>
      )}

      <TouchableOpacity
        style={s.addBtn}
        onPress={() => setAddOpen(true)}
        activeOpacity={0.85}
        disabled={busy}
      >
        <Text style={s.addBtnText}>
          {busy ? 'Saving…' : `Add ${photoSlotLabel(slot).toLowerCase()} photo`}
        </Text>
      </TouchableOpacity>

      {/* ── add sheet ── */}
      {addOpen && (
        <BottomSheet onClose={() => setAddOpen(false)}>
          {close => (
            <View style={sh.wrap}>
              <Text style={sh.title}>{photoSlotLabel(slot)} photo</Text>
              <Text style={sh.hint}>{photoSlotHint(slot)}</Text>
              <TouchableOpacity
                style={sh.row}
                onPress={() => close(() => setCamOpen(true))}
                activeOpacity={0.7}
              >
                <SymbolView name="camera.fill" size={19} tintColor={HEADER} />
                <View style={{ flex: 1 }}>
                  <Text style={sh.rowText}>Take a photo</Text>
                  {latest && <Text style={sh.rowSub}>Your first one shows through, so you can line it up</Text>}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={sh.row}
                onPress={() => close(() => pickFromLibrary(slot))}
                activeOpacity={0.7}
              >
                <SymbolView name="photo.on.rectangle.angled" size={19} tintColor={HEADER} />
                <Text style={sh.rowText}>Choose from library</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* ── pose picker ── */}
      {slotSheetOpen && (
        <BottomSheet onClose={() => setSlotSheetOpen(false)}>
          {close => (
            <View style={sh.wrap}>
              <Text style={sh.title}>Pose</Text>
              {slotKeys.map(k => {
                const n = photos.filter(ph => ph.slot === k).length;
                const on = k === slot;
                return (
                  <TouchableOpacity
                    key={k}
                    style={sh.row}
                    onPress={() => close(() => setSlot(k))}
                    activeOpacity={0.7}
                  >
                    <PoseIcon shape={poseShapeFor(k)} size={22} color={on ? ACCENT : HEADER} />
                    <Text style={[sh.rowText, on && { color: ACCENT, fontWeight: '700' }]}>
                      {photoSlotLabel(k)}
                    </Text>
                    <Text style={sh.rowCount}>{n > 0 ? n : ''}</Text>
                    {on && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={sh.row}
                onPress={() => close(() => setNewSlotOpen(true))}
                activeOpacity={0.7}
              >
                <SymbolView name="plus" size={19} tintColor={HEADER} />
                <Text style={sh.rowText}>New pose…</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* ── custom pose sheet ── */}
      {newSlotOpen && (
        <NewPoseSheet
          onClose={() => setNewSlotOpen(false)}
          onCreate={name => {
            setExtraSlots(list => (list.includes(name) ? list : [...list, name]));
            setSlot(name);
          }}
        />
      )}

      {/* ── per-photo menu ── */}
      {menuPhoto && (
        <BottomSheet onClose={() => setMenuPhoto(null)}>
          {close => {
            const p = menuPhoto;
            return (
              <View style={sh.wrap}>
                <Text style={sh.title}>{photoSlotLabel(p.slot)} · {fmtDate(p.date)}</Text>
                <View style={sh.shareRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={sh.rowText}>Share with Vitek</Text>
                    <Text style={sh.rowSub}>
                      {p.shared_with_trainer
                        ? 'He can see this photo.'
                        : 'Only you can see this photo.'}
                    </Text>
                  </View>
                  <Switch
                    value={p.shared_with_trainer}
                    onValueChange={() => toggleShare(p)}
                    trackColor={{ false: '#d8d8d4', true: ACCENT }}
                    thumbColor="#fff"
                  />
                </View>
                <TouchableOpacity
                  style={sh.row}
                  onPress={() => close(() => setConfirmDelete(p))}
                  activeOpacity={0.7}
                >
                  <SymbolView name="trash.fill" size={18} tintColor={CORAL} />
                  <Text style={[sh.rowText, { color: CORAL }]}>Delete photo</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        </BottomSheet>
      )}

      {/* ── delete confirm (centred glass — a binary confirm) ── */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmDelete(null)} />
          <View style={s.glassShadow}>
            <GlassPanel style={s.glassBox}>
              <Text style={s.confirmTitle}>Delete this photo?</Text>
              <Text style={s.confirmMsg}>This can't be undone.</Text>
              <TouchableOpacity
                style={s.dangerBtn}
                activeOpacity={0.85}
                onPress={() => {
                  const p = confirmDelete;
                  setConfirmDelete(null);
                  if (p) deletePhoto(p);
                }}
              >
                <Text style={s.dangerBtnText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmDelete(null)} style={s.cancelLink} activeOpacity={0.7}>
                <Text style={s.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </GlassPanel>
          </View>
        </View>
      </Modal>

      {/* ── camera ── */}
      {camOpen && (
        <GhostCamera
          first={slotPhotos.length ? toGhostRef(slotPhotos[0], urls) : null}
          last={slotPhotos.length ? toGhostRef(slotPhotos[slotPhotos.length - 1], urls) : null}
          hint={photoSlotHint(slot)}
          slotLabel={photoSlotLabel(slot)}
          onClose={() => setCamOpen(false)}
          onShot={async (uri, angle) => { setCamOpen(false); await uploadPhoto(uri, slot, angle); }}
        />
      )}
    </View>
  );
}

// ─── Side-by-side pane ───────────────────────────────────────────────────────

function SidePane({
  label, photo, url, weight, active, onPress, onMenu,
}: {
  label: string;
  photo: PhotoRow | null;
  url?: string;
  weight: string | null;
  active: boolean;
  onPress: () => void;
  onMenu?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ width: HALF_W }}>
      <View style={[s.pane, active && s.paneActive]}>
        {url ? <Image source={{ uri: url }} style={s.paneImg} resizeMode="cover" />
             : <View style={[s.paneImg, s.paneEmpty]} />}
        <View style={s.paneTag}>
          <Text style={s.paneTagText}>{label}</Text>
        </View>
        {onMenu && (
          <TouchableOpacity style={s.paneMenu} onPress={onMenu} hitSlop={10}>
            <SymbolView name="ellipsis" size={15} tintColor="#fff" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={s.paneDate}>{photo ? fmtShort(photo.date) : '—'}</Text>
      {weight && <Text style={s.paneWeight}>{weight}</Text>}
    </Pressable>
  );
}

// ─── Slider pane ─────────────────────────────────────────────────────────────
// Called "Slider", not "Wipe" — Vitek, Aug 6: "wipe is not really good perhaps we
// can say something else?". He is right: wipe is video-editing jargon, and what
// the person actually does is drag a slider. The label names the CONTROL, which is
// the part they touch.
//
// Before sits on top, clipped to the divider; After is the full-size layer under
// it. The inner Image keeps the FULL pane width inside the clipping view, so the
// visible half is a crop rather than a squashed picture — getting that wrong is
// what makes most of these look broken.

function SliderPane({
  beforeUrl, afterUrl, beforeLabel, afterLabel, onLock,
}: {
  beforeUrl?: string;
  afterUrl?: string;
  beforeLabel: string;
  afterLabel: string;
  onLock?: (locked: boolean) => void;
}) {
  const lockRef = useRef(onLock);
  lockRef.current = onLock;
  const [divX, setDivX] = useState(Math.round(PANE_W / 2));
  // ⚠️ The PanResponder is built ONCE, so its callbacks close over the first
  // render's `divX` forever. Every value they read has to come from a ref, or the
  // divider jumps back to the middle at the start of the second drag.
  const divRef   = useRef(divX);
  const startX   = useRef(divX);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2,
      // The parent ScrollView will otherwise steal a drag that starts vertical-ish.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startX.current = divRef.current;
        lockRef.current?.(true);
      },
      onPanResponderRelease:  () => lockRef.current?.(false),
      onPanResponderTerminate: () => lockRef.current?.(false),
      onPanResponderMove: (_, g) => {
        const next = Math.max(0, Math.min(PANE_W, startX.current + g.dx));
        divRef.current = next;
        setDivX(next);
      },
    })
  ).current;

  return (
    <View>
      <View style={s.wipeWrap} {...pan.panHandlers}>
        {afterUrl ? <Image source={{ uri: afterUrl }} style={s.wipeImg} resizeMode="cover" />
                  : <View style={[s.wipeImg, s.paneEmpty]} />}
        <View style={[s.wipeClip, { width: divX }]}>
          {beforeUrl ? <Image source={{ uri: beforeUrl }} style={s.wipeImg} resizeMode="cover" />
                     : <View style={[s.wipeImg, s.paneEmpty]} />}
        </View>
        <View style={[s.wipeBar, { left: divX - 1 }]} />
        <View style={[s.wipeKnob, { left: divX - 18 }]}>
          <SymbolView name="arrow.left.and.right" size={15} tintColor={HEADER} />
        </View>
        <View style={[s.paneTag, { left: 10 }]}><Text style={s.paneTagText}>{beforeLabel}</Text></View>
        <View style={s.paneTagRight}><Text style={s.paneTagText}>{afterLabel}</Text></View>
      </View>
      <Text style={s.wipeHint}>Drag across the photo to compare.</Text>
    </View>
  );
}

// ─── Ghost camera ────────────────────────────────────────────────────────────
// The previous photo in this slot sits over the live preview at low opacity. This
// is the whole feature: two photos are only comparable if they were framed the
// same way, and nobody can do that from memory a month later.
//
// ⚠️ The dashed framing guide that briefly lived here is GONE — Vitek, Aug 6:
// "the guide you made now is not helping and is distracting". Do not re-add a
// static overlay; the ghost is the guide.
//
// The red→green he asked for is done on DEVICE ANGLE, not on the body. Nothing
// here can see whether the PERSON is in position — `expo-camera` hands us no
// frames and there is no on-device vision — and colouring an outline green on a
// guess is a lie the user would line up to. What the phone genuinely knows is how
// it is being HELD, and camera tilt is what actually ruins a before/after: the
// pitch/roll are stored with each shot and the next one in that slot goes green
// when it matches within ANGLE_TOL. No reference angle (first photo in a slot, or
// a library pick) means NO red/green at all, rather than a fake one.

function GhostCamera({
  first, last, hint, slotLabel, onClose, onShot,
}: {
  first: GhostRef | null;
  last: GhostRef | null;
  hint: string;
  slotLabel: string;
  onClose: () => void;
  onShot: (uri: string, angle: { pitch: number; roll: number } | null) => void;
}) {
  // ⚠️ Defaults to the FIRST photo, not the latest. Aligning each shot to the one
  // before it lets error COMPOUND — #2 is a little off #1, #3 a little off #2 —
  // so by #10 the series has walked away from its own starting frame, which is
  // precisely the pair everyone actually looks at. A fixed anchor is the standard
  // move in time-lapse work for exactly this reason. The switch exists because a
  // badly framed first photo would otherwise lock the whole slot to a bad anchor.
  const [refMode, setRefMode] = useState<'first' | 'last'>('first');
  const ref = refMode === 'first' ? first : last;
  const ghostUrl = ref?.url;
  const refAngle = ref?.angle ?? null;
  const canSwitch = !!first && !!last && first.id !== last.id;
  const [perm, requestPerm] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ghostOn, setGhostOn] = useState(true);
  const [shooting, setShooting] = useState(false);
  const [angle, setAngle] = useState<{ pitch: number; roll: number } | null>(null);
  const camRef = useRef<CameraView>(null);
  const angleRef = useRef<{ pitch: number; roll: number } | null>(null);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) requestPerm();
  }, [perm, requestPerm]);

  useEffect(() => {
    if (!DeviceMotion) return;
    DeviceMotion.setUpdateInterval(120);
    const sub = DeviceMotion.addListener(d => {
      if (!d?.rotation) return;
      const next = {
        pitch: d.rotation.beta  * 180 / Math.PI,
        roll:  d.rotation.gamma * 180 / Math.PI,
      };
      angleRef.current = next;
      setAngle(next);
    });
    return () => sub.remove();
  }, []);

  const canMatch = angleMatchSupported && refAngle != null;
  const dPitch = canMatch && angle ? angle.pitch - refAngle!.pitch : null;
  const dRoll  = canMatch && angle ? angle.roll  - refAngle!.roll  : null;
  const matched =
    dPitch != null && dRoll != null &&
    Math.abs(dPitch) <= ANGLE_TOL && Math.abs(dRoll) <= ANGLE_TOL;

  // ⚠️ NO direction words and NO arrows — both were tried Aug 8 2026 and
  // retired the same day. "Tilt right" as praise read as an instruction, and
  // the arrows pointed the wrong way depending on grip (pitch/roll signs don't
  // map cleanly to up/down in every hand position): "the arrows dont work
  // correctly, its confusing". Vitek's call: one neutral adjusting state, one
  // matched state. The sensor still decides WHEN the angle is right; it just
  // no longer pretends to know which way the wrist should move.
  const guidance = (): { icon: string; text: string } => {
    if (matched) return { icon: 'checkmark', text: 'Angle matches — line up with the faded photo' };
    return { icon: 'gyroscope', text: 'Adjust the angle of your phone for the best accuracy' };
  };

  const shoot = async () => {
    if (shooting) return;
    setShooting(true);
    try {
      const pic = await camRef.current?.takePictureAsync({ quality: 0.75 });
      if (pic?.uri) onShot(pic.uri, angleRef.current);
      else setShooting(false);
    } catch {
      setShooting(false);
      Alert.alert('Could not take the photo', 'Please try again.');
    }
  };

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={cam.root}>
        {perm?.granted ? (
          <>
            <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing={facing} />
            {ghostOn && ghostUrl && (
              // `pointerEvents` lives on the wrapper — Image has no such prop.
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Image
                  source={{ uri: ghostUrl }}
                  // 0.25 → 0.35 (Aug 8 2026): Vitek — the ghost was LESS visible
                  // than the angle cue, and the ghost is the actual guide.
                  style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
                  resizeMode="cover"
                />
              </View>
            )}
          </>
        ) : (
          <View style={cam.denied}>
            <Text style={cam.deniedText}>
              Camera access is off. Turn it on in Settings to take a progress photo — or add one
              from your library instead.
            </Text>
          </View>
        )}

        {/* ⚠️ NO full-screen angle frame any more (Aug 8 2026). A screen-wide
            red/green border read as a verdict on the WHOLE shot — "it says
            correct tilt of the camera which somehow seems like you are doing
            everything correctly" — and out-shouted the ghost, which is the real
            guide. The tilt cue lives only in the quiet chip below. */}

        <View style={cam.top}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={cam.topBtn}>
            <SymbolView name="xmark" size={20} tintColor="#fff" weight="semibold" />
          </TouchableOpacity>
          <Text style={cam.title}>{slotLabel}</Text>
          <TouchableOpacity
            onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}
            hitSlop={12}
            style={cam.topBtn}
          >
            <SymbolView name="arrow.triangle.2.circlepath.camera" size={20} tintColor="#fff" />
          </TouchableOpacity>
        </View>

        <View style={cam.bottom}>
          {canMatch && (
            // Quiet dark chip in both states — colour only in the small icon
            // (ACCENT tick / amber adjust), so the cue can never compete with
            // the ghost. It speaks about TILT only, and on a match it hands
            // attention straight back to the ghost.
            <View style={cam.angleChip}>
              <SymbolView
                name={guidance().icon as any}
                size={13}
                weight="bold"
                tintColor={matched ? ACCENT : '#f5a623'}
              />
              <Text style={cam.angleChipText}>{guidance().text}</Text>
            </View>
          )}
          <Text style={cam.hint}>
            {ghostUrl && ghostOn
              ? `Line yourself up with the faded photo — your ${refMode === 'first' ? 'first' : 'latest'}, ${fmtShort(ref!.date)}.`
              : hint}
          </Text>
          <View style={cam.controls}>
            <View style={cam.sideSlot}>
              {ghostUrl && (
                <TouchableOpacity onPress={() => setGhostOn(g => !g)} style={cam.ghostBtn} activeOpacity={0.8}>
                  <SymbolView
                    name={ghostOn ? 'eye.fill' : 'eye.slash.fill'}
                    size={17}
                    tintColor="#fff"
                  />
                  <Text style={cam.ghostText}>Guide</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={shoot}
              disabled={!perm?.granted || shooting}
              style={[cam.shutter, (!perm?.granted || shooting) && { opacity: 0.4 }]}
              activeOpacity={0.8}
            >
              <View style={cam.shutterInner} />
            </TouchableOpacity>
            <View style={cam.sideSlot}>
              {canSwitch && (
                <TouchableOpacity
                  onPress={() => setRefMode(m => (m === 'first' ? 'last' : 'first'))}
                  style={cam.ghostBtn}
                  activeOpacity={0.8}
                >
                  <SymbolView name="arrow.triangle.2.circlepath" size={17} tintColor="#fff" />
                  <Text style={cam.ghostText}>{refMode === 'first' ? 'First' : 'Last'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── New pose sheet ──────────────────────────────────────────────────────────

function NewPoseSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const ok = name.trim().length > 1;
  return (
    <BottomSheet avoidKeyboard onClose={onClose}>
      {close => (
        <View style={sh.wrap}>
          <Text style={sh.title}>New pose</Text>
          <Text style={sh.hint}>
            Anything you want to track the same way each time — a stretch, a hold, a lift position.
          </Text>
          <TextInput
            style={sh.input}
            value={name}
            onChangeText={setName}
            placeholder="Name it — deep squat, bridge, anything"
            placeholderTextColor="#bbb"
            autoFocus
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[sh.save, !ok && sh.saveOff]}
            disabled={!ok}
            activeOpacity={0.85}
            onPress={() => close(() => onCreate(name.trim()))}
          >
            <Text style={sh.saveText}>Add pose</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => close()} style={sh.cancel} activeOpacity={0.7}>
            <Text style={sh.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  loader: { paddingVertical: 40, alignItems: 'center' },

  privacy: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(36,78,67,0.06)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14,
  },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 17, color: HEADER },

  slotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  slotBtnLabel: { fontSize: 15, fontWeight: '700', color: TEXT },
  slotBtnSub:   { fontSize: 11.5, color: MUTED, marginTop: 1 },

  singleWrap: {
    width: PANE_W, height: PANE_H, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#e9efec',
  },
  singleImg:  { width: '100%', height: '100%' },
  singleHint: { fontSize: 13, lineHeight: 19, color: MUTED, textAlign: 'center', marginTop: 12, paddingHorizontal: 10 },

  empty:      { alignItems: 'center', paddingHorizontal: 18, paddingTop: 24, paddingBottom: 10 },
  emptyMark:  { width: 72, height: 72, borderRadius: 24, backgroundColor: '#e9efec', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 6, textAlign: 'center' },
  emptyBody:  { fontSize: 13.5, lineHeight: 20, color: MUTED, textAlign: 'center' },

  modeBar:    { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3, marginBottom: 12 },
  modeItem:   { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 100 },
  modeItemOn: { backgroundColor: CARD },
  modeText:   { fontSize: 13, fontWeight: '600', color: MUTED },
  modeTextOn: { color: TEXT, fontWeight: '700' },

  sideRow: { flexDirection: 'row', gap: 8 },
  pane: {
    width: HALF_W, height: HALF_H, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#e9efec',
  },
  paneActive: { borderWidth: 2, borderColor: ACCENT },
  paneImg:    { width: '100%', height: '100%' },
  paneEmpty:  { backgroundColor: '#e9efec' },
  paneTag: {
    position: 'absolute', left: 8, top: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  paneTagRight: {
    position: 'absolute', right: 10, top: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  paneTagText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  paneMenu: {
    position: 'absolute', right: 6, top: 6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  paneDate:   { fontSize: 12, fontWeight: '600', color: TEXT, marginTop: 6, textAlign: 'center' },
  paneWeight: { fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 1 },

  wipeWrap: {
    width: PANE_W, height: PANE_H, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#e9efec',
  },
  wipeImg:  { width: PANE_W, height: PANE_H },
  wipeClip: { position: 'absolute', left: 0, top: 0, height: PANE_H, overflow: 'hidden' },
  wipeBar:  { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  wipeKnob: {
    position: 'absolute', top: PANE_H / 2 - 18,
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  wipeHint: { fontSize: 11.5, color: MUTED, textAlign: 'center', marginTop: 7 },

  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  pickChip: {
    flex: 1, alignItems: 'center', backgroundColor: CARD, borderRadius: 12,
    paddingVertical: 8, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  pickChipOn:       { borderColor: ACCENT },
  pickChipLabel:    { fontSize: 9.5, fontWeight: '700', color: MUTED, letterSpacing: 0.7 },
  pickChipLabelOn:  { color: ACCENT },
  pickChipDate:     { fontSize: 13, fontWeight: '700', color: TEXT, marginTop: 2 },
  pickChipDateOn:   { color: TEXT },
  stripLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },
  thumb:      { width: 58, alignItems: 'center' },
  thumbOn:    {},
  thumbImg:   { width: 58, height: 76, borderRadius: 9, backgroundColor: '#e9efec' },
  thumbEmpty: { backgroundColor: '#e9efec' },
  thumbDate:  { fontSize: 10, color: MUTED, marginTop: 4 },
  thumbDateOn:{ color: ACCENT, fontWeight: '700' },
  sharedDot: {
    position: 'absolute', top: 4, right: 4,
    width: 15, height: 15, borderRadius: 8, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  stripHint: { fontSize: 11, color: '#bbb', marginTop: 8 },

  addBtn:     { borderRadius: 100, backgroundColor: '#f5f5f3', paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  addBtnText: { color: ACCENT, fontWeight: '700', fontSize: 15 },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  glassShadow: { width: '100%', borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox:    { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center' },
  confirmTitle:{ fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 6, textAlign: 'center' },
  confirmMsg:  { fontSize: 14, fontWeight: '600', color: '#1f2823', marginBottom: 18, textAlign: 'center' },
  dangerBtn:   { backgroundColor: CORAL, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  dangerBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelLink:  { paddingTop: 14, paddingBottom: 2 },
  cancelLinkText: { color: '#414b45', fontSize: 14, fontWeight: '600' },
});

const sh = StyleSheet.create({
  wrap:  { paddingHorizontal: 20 },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', paddingTop: 2, paddingBottom: 10 },
  hint:  { fontSize: 13, lineHeight: 19, color: MUTED, textAlign: 'center', marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f0f0ee',
  },
  rowText: { fontSize: 15, fontWeight: '600', color: TEXT },
  rowSub:  { fontSize: 12, color: MUTED, marginTop: 2 },
  rowCount:{ flex: 1, fontSize: 12, color: MUTED, textAlign: 'right' },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f0f0ee',
  },
  input: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: TEXT,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  save:     { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  saveOff:  { opacity: 0.4 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel:     { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#414b45', fontSize: 14, fontWeight: '600' },
});

const cam = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  deniedText: { color: '#fff', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  top: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 18, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  title:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingBottom: 42, paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  angleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12,
  },
  angleChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  hint:     { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 16, paddingHorizontal: 30 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26 },
  sideSlot: { width: 70, alignItems: 'center' },
  ghostBtn: { alignItems: 'center', gap: 3 },
  ghostText:{ color: '#fff', fontSize: 11, fontWeight: '600' },
  shutter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
});
