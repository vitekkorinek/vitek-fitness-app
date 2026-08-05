import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import GlassPanel from '@/components/GlassPanel';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { launchImageLibrary } from 'react-native-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { VFIcon } from '@/components/VFIcon';
import { HeaderPhotoPositioner } from '@/components/HeaderPhoto';
import t from '@/i18n/en';

// The Do Mode header is full width × ~42% of screen height. The builder frames
// the header crop at that same aspect so what the trainer sets is what shows.
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Match the Do Mode header exactly (HEADER_MAX = SCREEN_HEIGHT * 0.38) so the framer
// shows the true crop the session header will use.
const HEADER_ASPECT = (SCREEN_H * 0.38) / SCREEN_W;

function makeUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

type BodySection = 'upper' | 'lower';
type MuscleGroupDef = { group: string; muscles: string[] };

const MUSCLE_HIERARCHY: Record<BodySection, MuscleGroupDef[]> = {
  upper: [
    { group: 'Chest',     muscles: ['Upper Chest', 'Mid Chest', 'Lower Chest'] },
    { group: 'Back',      muscles: ['Upper Traps', 'Mid Traps / Middle Back', 'Lats', 'Rear Delts', 'Lower Back'] },
    { group: 'Shoulders', muscles: ['Front Delts', 'Lateral Delts', 'Rear Delts'] },
    { group: 'Arms',      muscles: [
      'Biceps', 'Biceps (Long Head)', 'Biceps (Short Head)',
      'Triceps', 'Triceps (Long Head)', 'Triceps (Lateral Head)', 'Triceps (Medial Head)',
      'Forearms',
    ] },
    { group: 'Core',      muscles: ['Upper Abs', 'Lower Abs', 'Obliques', 'Lower Back'] },
  ],
  lower: [
    { group: 'Lower Body', muscles: ['Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves'] },
  ],
};

// `Dumbbell / Kettlebell` is one option, not two picks: it says "either implement
// works for this exercise" (walking lunges, rows), which is different from an
// exercise that needs both. The three machine kinds are separate implements the
// client has to find on the gym floor — Smith and plate-loaded look nothing like
// a selectorized stack. All three take the machine-brand selector in Do Mode
// (see usesMachineBrand in lib/exerciseFilters.ts).
const EQUIPMENT_OPTIONS = [
  'None', 'Barbell', 'Z Bar', 'Dumbbell', 'Kettlebell', 'Dumbbell / Kettlebell',
  'Machine', 'Smith Machine', 'Plate Loaded Machine',
  'Bodyweight', 'Cable', 'Resistance Band', 'TRX',
];

// Cable/machine attachments — selectable ALONGSIDE a main implement (multi-equipment,
// Aug 2026). They can never become the exercise's main `equipment`: at save, mains
// always order before attachments, so bar-weight / machine-brand detection keeps
// keying off a real implement.
const ATTACHMENT_OPTIONS = [
  'Wide Bar', 'Straight Bar', 'Short Bar', 'Triangle Grip',
  'Rope', 'Single Handle', 'Ankle Strap',
];

type VideoItem = { videoUrl: string; thumbnailUri: string | null };
type PhotoItem = { displayUri: string; localUri: string | null };
type CustomEquip = { name: string; kind: 'main' | 'attachment' };

export default function AddExerciseScreen() {
  const headerH = useHeaderHeight();
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const isEdit = !!exerciseId;

  const [name, setName] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [secondaryMuscleGroups, setSecondaryMuscleGroups] = useState<string[]>([]);
  const [primarySection, setPrimarySection] = useState<BodySection>('upper');
  const [secondarySection, setSecondarySection] = useState<BodySection>('upper');
  // Multi-equipment: selection order preserved; first MAIN option = the exercise's
  // `equipment` column, everything else goes to `extra_equipment`. Empty = None.
  const [equipmentSel, setEquipmentSel] = useState<string[]>([]);
  // Custom equipment (Aug 2026, reworked same day per Vitek): PERSISTENT
  // per-trainer options stored in trainer_settings.custom_equipment, shown as
  // permanent pills in their section ('main' row or attachments row). Tap
  // selects like any pill; LONG-PRESS opens the popup in edit mode (rename /
  // delete). A rename does not rewrite other exercises' already-saved text.
  const [customOptions, setCustomOptions] = useState<CustomEquip[]>([]);
  const [customEquipOpen, setCustomEquipOpen] = useState(false);
  const [customEquipKind, setCustomEquipKind] = useState<'main' | 'attachment'>('attachment');
  const [customEquipEditing, setCustomEquipEditing] = useState<string | null>(null);
  const [customEquipText, setCustomEquipText] = useState('');
  // A thumbnail that came with the exercise but was NOT derived from its own
  // photos/videos (library-seeded exercises carry one). Preserved on save so an
  // edit doesn't silently wipe it — the old chain photo ?? videoThumb yields null.
  const [libraryThumbUrl, setLibraryThumbUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loadingExercise, setLoadingExercise] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [videoItems, setVideoItems] = useState<VideoItem[]>([]);
  const [uploadingNewVideo, setUploadingNewVideo] = useState(false);
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const [headerFocusY, setHeaderFocusY] = useState(0.5);
  const [scrollLocked, setScrollLocked] = useState(false); // freeze scroll while framing the header photo

  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('trainer_settings').select('custom_equipment').eq('trainer_id', profile.id).maybeSingle()
      .then(({ data }) => {
        const raw = (data as any)?.custom_equipment;
        if (Array.isArray(raw)) {
          setCustomOptions(raw.filter((x: any) =>
            x && typeof x.name === 'string' && (x.kind === 'main' || x.kind === 'attachment')));
        }
      });
  }, [profile?.id]);

  useEffect(() => {
    if (!isEdit) return;
    supabase
      .from('exercises')
      .select('*')
      .eq('id', exerciseId)
      .single()
      .then(({ data }) => {
        if (data) {
          const e = data as any;
          setName(e.name);
          setMuscleGroups(e.muscle_groups ?? []);
          setSecondaryMuscleGroups(e.secondary_muscle_groups ?? []);
          setEquipmentSel([e.equipment, ...((e.extra_equipment ?? []) as string[])].filter(Boolean));
          setNotes(e.description ?? '');
          if (e.thumbnail_url && !e.video_url && (e.extra_photo_urls ?? []).length === 0) {
            setLibraryThumbUrl(e.thumbnail_url);
          }

          const videos: VideoItem[] = [];
          if (e.video_url) videos.push({ videoUrl: e.video_url, thumbnailUri: e.thumbnail_url ?? null });
          for (const u of (e.extra_video_urls ?? [])) videos.push({ videoUrl: u, thumbnailUri: null });
          setVideoItems(videos);

          const photos: PhotoItem[] = (e.extra_photo_urls ?? []).map((u: string) => ({ displayUri: u, localUri: null }));
          setPhotoItems(photos);
          setHeaderFocusY(typeof e.header_focus_y === 'number' ? e.header_focus_y : 0.5);
        }
        setLoadingExercise(false);
      });
  }, [exerciseId, isEdit]);

  const toggleEquipment = (eq: string) => {
    if (eq === 'None') { setEquipmentSel([]); return; }
    setEquipmentSel(prev =>
      prev.includes(eq) ? prev.filter(e => e !== eq) : [...prev, eq]
    );
  };

  const persistCustomOptions = (next: CustomEquip[]) => {
    setCustomOptions(next);
    if (profile?.id) {
      supabase.from('trainer_settings')
        .upsert({ trainer_id: profile.id, custom_equipment: next }, { onConflict: 'trainer_id' })
        .then(({ error }) => { if (error) console.warn('custom equipment save failed:', error.message); });
    }
  };

  const openAddCustom = (kind: 'main' | 'attachment') => {
    setCustomEquipKind(kind); setCustomEquipEditing(null); setCustomEquipText(''); setCustomEquipOpen(true);
  };
  const openEditCustom = (opt: CustomEquip) => {
    setCustomEquipKind(opt.kind); setCustomEquipEditing(opt.name); setCustomEquipText(opt.name); setCustomEquipOpen(true);
  };

  const confirmCustomEquip = () => {
    const v = customEquipText.trim();
    setCustomEquipOpen(false);
    if (!v) return;
    if (customEquipEditing) {
      if (v === customEquipEditing) return;
      persistCustomOptions(customOptions.map(o => o.name === customEquipEditing ? { ...o, name: v } : o));
      setEquipmentSel(prev => prev.map(e => e === customEquipEditing ? v : e));
      return;
    }
    const taken = customOptions.some(o => o.name.toLowerCase() === v.toLowerCase())
      || EQUIPMENT_OPTIONS.some(o => o.toLowerCase() === v.toLowerCase())
      || ATTACHMENT_OPTIONS.some(o => o.toLowerCase() === v.toLowerCase());
    if (!taken) persistCustomOptions([...customOptions, { name: v, kind: customEquipKind }]);
  };

  const deleteCustomEquip = () => {
    if (!customEquipEditing) return;
    setCustomEquipOpen(false);
    persistCustomOptions(customOptions.filter(o => o.name !== customEquipEditing));
    setEquipmentSel(prev => prev.filter(e => e !== customEquipEditing));
  };

  const toggleMuscle = (mg: string) => {
    setMuscleGroups(prev =>
      prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg]
    );
    setSecondaryMuscleGroups(prev => prev.filter(m => m !== mg));
  };

  const toggleSecondaryMuscle = (mg: string) => {
    setSecondaryMuscleGroups(prev =>
      prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg]
    );
    setMuscleGroups(prev => prev.filter(m => m !== mg));
  };

  const handlePickVideo = () => {
    launchImageLibrary({ mediaType: 'video', formatAsMp4: true }, async (response) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert(t.common.error, t.library.addExercise.videoErrorUpload);
        return;
      }
      const asset = response.assets?.[0];
      if (!asset?.uri) return;
      const localUri = asset.uri;
      setUploadingNewVideo(true);
      try {
        const videoPath = `${makeUUID()}.mp4`;
        const videoBuffer = await (await fetch(localUri)).arrayBuffer();
        const { error: ve } = await supabase.storage
          .from('exercise-videos')
          .upload(videoPath, videoBuffer, { contentType: 'video/mp4', upsert: false });
        if (ve) throw ve;
        const { data: { publicUrl: uploadedVideoUrl } } = supabase.storage
          .from('exercise-videos')
          .getPublicUrl(videoPath);
        // Append immediately (no thumbnail yet); generate thumbnail async
        setVideoItems(prev => [...prev, { videoUrl: uploadedVideoUrl, thumbnailUri: null }]);
        setUploadingNewVideo(false);
        VideoThumbnails.getThumbnailAsync(localUri, { time: 0 })
          .then(async ({ uri: thumbUri }) => {
            const thumbPath = `${makeUUID()}.jpg`;
            const thumbBuffer = await (await fetch(thumbUri)).arrayBuffer();
            const { error: te } = await supabase.storage
              .from('exercise-thumbnails')
              .upload(thumbPath, thumbBuffer, { contentType: 'image/jpeg', upsert: false });
            if (!te) {
              const { data: { publicUrl } } = supabase.storage
                .from('exercise-thumbnails')
                .getPublicUrl(thumbPath);
              setVideoItems(prev => prev.map(v =>
                v.videoUrl === uploadedVideoUrl ? { ...v, thumbnailUri: publicUrl } : v
              ));
            }
          })
          .catch(() => {});
      } catch {
        Alert.alert(t.common.error, t.library.addExercise.videoErrorUpload);
        setUploadingNewVideo(false);
      }
    });
  };

  const handleRemoveVideo = (idx: number) => {
    setVideoItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePickPhoto = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 1 }, (response) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert(t.common.error, 'Failed to pick photo.');
        return;
      }
      const asset = response.assets?.[0];
      if (!asset?.uri) return;
      setPhotoItems(prev => [...prev, { displayUri: asset.uri!, localUri: asset.uri! }]);
    });
  };

  const handleRemovePhoto = (idx: number) => {
    setPhotoItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim())         { setError(t.library.addExercise.errorName);         return; }
    if (!muscleGroups.length) { setError(t.library.addExercise.errorMuscleGroups); return; }
    setSaving(true);

    // Upload any newly picked photos (localUri !== null means freshly picked)
    const finalPhotoUrls: string[] = [];
    try {
      const folder = exerciseId ?? makeUUID();
      for (const photo of photoItems) {
        if (photo.localUri) {
          const filePath = `exercise-photos/${folder}/${makeUUID()}.jpg`;
          const photoBuffer = await (await fetch(photo.localUri)).arrayBuffer();
          const { error: pe } = await supabase.storage
            .from('workout-covers')
            .upload(filePath, photoBuffer, { contentType: 'image/jpeg', upsert: true });
          if (pe) throw pe;
          const { data: { publicUrl } } = supabase.storage
            .from('workout-covers')
            .getPublicUrl(filePath);
          finalPhotoUrls.push(publicUrl);
        } else {
          finalPhotoUrls.push(photo.displayUri);
        }
      }
    } catch {
      setSaving(false);
      setError('Failed to upload photo.');
      return;
    }

    // thumbnail_url: first uploaded photo if any, else first video's auto-thumbnail,
    // else a pre-existing library thumbnail (seeded exercises — see libraryThumbUrl).
    const autoThumbnail = videoItems[0]?.thumbnailUri ?? null;
    const finalThumbnail = finalPhotoUrls[0] ?? autoThumbnail ?? libraryThumbUrl;

    // Mains before attachments, tap order preserved within each — the first main
    // is the `equipment` column every existing read keys off. Custom options
    // count as their own kind.
    const isAttachmentPick = (e: string) =>
      ATTACHMENT_OPTIONS.includes(e) || customOptions.some(o => o.name === e && o.kind === 'attachment');
    const orderedEquipment = [
      ...equipmentSel.filter(e => !isAttachmentPick(e)),
      ...equipmentSel.filter(e => isAttachmentPick(e)),
    ];

    const payload = {
      name:                     name.trim(),
      muscle_groups:            muscleGroups,
      secondary_muscle_groups:  secondaryMuscleGroups,
      equipment:                orderedEquipment[0] ?? null,
      extra_equipment:          orderedEquipment.slice(1),
      description:              notes.trim() || null,
      video_url:                videoItems[0]?.videoUrl ?? null,
      extra_video_urls:         videoItems.slice(1).map(v => v.videoUrl),
      thumbnail_url:            finalThumbnail,
      extra_photo_urls:         finalPhotoUrls,
      header_focus_y:           headerFocusY,
    };

    const { error: err } = isEdit
      ? await supabase.from('exercises').update(payload).eq('id', exerciseId!)
      : await supabase.from('exercises').insert({ ...payload, created_by: profile!.id });

    setSaving(false);
    if (err) { setError(err.message); return; }
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Exercise', 'This exercise will be permanently removed.', [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('exercises').delete().eq('id', exerciseId!);
          router.back();
        },
      },
    ]);
  };

  if (loadingExercise) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.formContent, { paddingTop: headerH + 20 }]}
          scrollIndicatorInsets={{ top: headerH }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!scrollLocked}
        >
          {/* Name */}
          <FormLabel title={t.library.addExercise.labelName} />
          <View style={styles.card}>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={t.library.addExercise.placeholderName}
              placeholderTextColor="#bbb"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>

          {/* Primary muscles */}
          <FormLabel title={t.library.addExercise.labelPrimaryMuscles} />
          <View style={styles.card}>
            <View style={styles.bodySectionToggle}>
              {(['upper', 'lower'] as BodySection[]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.bodySectionBtn, primarySection === s && styles.bodySectionBtnActive]}
                  onPress={() => setPrimarySection(s)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.bodySectionBtnText, primarySection === s && styles.bodySectionBtnTextActive]}>
                    {s === 'upper' ? 'Upper Body' : 'Lower Body'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {MUSCLE_HIERARCHY[primarySection].map(({ group, muscles }) => (
              <View key={group} style={styles.muscleGroupSection}>
                <Text style={styles.muscleGroupHeader}>{group.toUpperCase()}</Text>
                <View style={styles.muscleGroupPills}>
                  {muscles.map(mg => {
                    const active = muscleGroups.includes(mg);
                    return (
                      <TouchableOpacity
                        key={mg}
                        style={[styles.selectPill, active && styles.selectPillActive]}
                        onPress={() => toggleMuscle(mg)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{mg}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          {/* Secondary muscles */}
          <FormLabel title={t.library.addExercise.labelSecondaryMuscles} />
          <View style={styles.card}>
            <View style={styles.bodySectionToggle}>
              {(['upper', 'lower'] as BodySection[]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.bodySectionBtn, secondarySection === s && styles.bodySectionBtnActive]}
                  onPress={() => setSecondarySection(s)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.bodySectionBtnText, secondarySection === s && styles.bodySectionBtnTextActive]}>
                    {s === 'upper' ? 'Upper Body' : 'Lower Body'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {MUSCLE_HIERARCHY[secondarySection].map(({ group, muscles }) => (
              <View key={group} style={styles.muscleGroupSection}>
                <Text style={styles.muscleGroupHeader}>{group.toUpperCase()}</Text>
                <View style={styles.muscleGroupPills}>
                  {muscles.map(mg => {
                    const active = secondaryMuscleGroups.includes(mg);
                    return (
                      <TouchableOpacity
                        key={mg}
                        style={[styles.selectPill, active && styles.selectPillActive]}
                        onPress={() => toggleSecondaryMuscle(mg)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{mg}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          {/* Equipment — multi-select; first main pick = main equipment.
              Custom options are permanent pills: tap selects, long-press edits. */}
          <FormLabel title={t.library.addExercise.labelEquipment} />
          <View style={styles.card}>
            <View style={[styles.pillCard, { paddingBottom: 4 }]}>
              {EQUIPMENT_OPTIONS.map(eq => {
                const active = eq === 'None' ? equipmentSel.length === 0 : equipmentSel.includes(eq);
                return (
                  <TouchableOpacity
                    key={eq}
                    style={[styles.selectPill, active && styles.selectPillActive]}
                    onPress={() => toggleEquipment(eq)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{eq}</Text>
                  </TouchableOpacity>
                );
              })}
              {customOptions.filter(o => o.kind === 'main').map(opt => {
                const active = equipmentSel.includes(opt.name);
                return (
                  <TouchableOpacity
                    key={opt.name}
                    style={[styles.selectPill, active && styles.selectPillActive]}
                    onPress={() => toggleEquipment(opt.name)}
                    onLongPress={() => openEditCustom(opt)}
                    delayLongPress={350}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{opt.name}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.selectPill, styles.customEquipPill]}
                onPress={() => openAddCustom('main')}
                activeOpacity={0.7}
              >
                <Text style={styles.customEquipPillText}>{t.library.addExercise.customEquipPill}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.muscleGroupSection}>
              <Text style={styles.muscleGroupHeader}>{t.library.addExercise.attachmentsHeader.toUpperCase()}</Text>
              <View style={styles.muscleGroupPills}>
                {ATTACHMENT_OPTIONS.map(eq => {
                  const active = equipmentSel.includes(eq);
                  return (
                    <TouchableOpacity
                      key={eq}
                      style={[styles.selectPill, active && styles.selectPillActive]}
                      onPress={() => toggleEquipment(eq)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{eq}</Text>
                    </TouchableOpacity>
                  );
                })}
                {customOptions.filter(o => o.kind === 'attachment').map(opt => {
                  const active = equipmentSel.includes(opt.name);
                  return (
                    <TouchableOpacity
                      key={opt.name}
                      style={[styles.selectPill, active && styles.selectPillActive]}
                      onPress={() => toggleEquipment(opt.name)}
                      onLongPress={() => openEditCustom(opt)}
                      delayLongPress={350}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{opt.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Selected values that exist in no list (option deleted later, or
                    saved before the persistent list existed) — stay visible while
                    selected so they can at least be deselected. */}
                {equipmentSel
                  .filter(eq => !EQUIPMENT_OPTIONS.includes(eq) && !ATTACHMENT_OPTIONS.includes(eq)
                    && !customOptions.some(o => o.name === eq))
                  .map(eq => (
                    <TouchableOpacity
                      key={eq}
                      style={[styles.selectPill, styles.selectPillActive]}
                      onPress={() => toggleEquipment(eq)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.selectPillText, styles.selectPillTextActive]}>{eq}</Text>
                    </TouchableOpacity>
                  ))}
                <TouchableOpacity
                  style={[styles.selectPill, styles.customEquipPill]}
                  onPress={() => openAddCustom('attachment')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.customEquipPillText}>{t.library.addExercise.customEquipPill}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <Text style={styles.equipmentHint}>{t.library.addExercise.equipmentHint}</Text>

          {/* Notes */}
          <FormLabel title={t.library.addExercise.labelNotes} />
          <View style={styles.card}>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder={t.library.addExercise.notesPlaceholder}
              placeholderTextColor="#bbb"
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
          </View>

          {/* Videos */}
          <FormLabel title={t.library.addExercise.videoLabel} />
          {videoItems.map((item, idx) => (
            <View key={idx} style={[styles.card, styles.mediaCard]}>
              <View style={styles.videoPreviewWrapper}>
                {item.thumbnailUri ? (
                  <Image
                    source={{ uri: item.thumbnailUri }}
                    style={styles.videoThumbnail}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.videoThumbnail, styles.videoPlaceholderFill]}>
                    <SymbolView name="video.fill" size={28} tintColor="#555" />
                    <Text style={styles.videoPlaceholderLabel}>
                      {idx === 0 ? 'Primary angle' : `Angle ${idx + 1}`}
                    </Text>
                  </View>
                )}
                {item.thumbnailUri && (
                  <View style={styles.videoPlayOverlay} pointerEvents="none">
                    <View style={styles.playCircle}>
                      <SymbolView name="play.fill" size={18} tintColor="#fff" />
                    </View>
                    <Text style={styles.videoAngleLabel}>
                      {idx === 0 ? 'Primary angle' : `Angle ${idx + 1}`}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.mediaRemoveBtn}
                  onPress={() => handleRemoveVideo(idx)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.mediaRemoveCircle}>
                    <SymbolView name="xmark" size={10} tintColor="#fff" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {uploadingNewVideo && (
            <View style={[styles.card, styles.mediaCard]}>
              <View style={[styles.videoThumbnail, styles.videoPlaceholderFill]}>
                <ActivityIndicator color={ACCENT} />
                <Text style={styles.videoPlaceholderLabel}>Uploading…</Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={[styles.mediaEmptyCard, uploadingNewVideo && { opacity: 0.6 }]}
            onPress={handlePickVideo}
            disabled={uploadingNewVideo}
            activeOpacity={0.75}
          >
            <SymbolView name="video.badge.plus" size={26} tintColor="#bbb" />
            <Text style={styles.mediaEmptyText}>
              {videoItems.length === 0 ? t.library.addExercise.addVideo : 'Add another angle'}
            </Text>
          </TouchableOpacity>

          {/* Photos */}
          <FormLabel title="PHOTOS" />
          {photoItems.map((item, idx) => (
            <View key={idx} style={[styles.card, styles.mediaCard]}>
              <Image
                source={{ uri: item.displayUri }}
                style={styles.photoThumbnail}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.mediaRemoveBtn}
                onPress={() => handleRemovePhoto(idx)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={styles.mediaRemoveCircle}>
                  <SymbolView name="xmark" size={10} tintColor="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.mediaEmptyCard}
            onPress={handlePickPhoto}
            activeOpacity={0.75}
          >
            <SymbolView name="photo.badge.plus" size={26} tintColor="#bbb" />
            <Text style={styles.mediaEmptyText}>
              {photoItems.length === 0 ? 'Add photo' : 'Add another photo'}
            </Text>
          </TouchableOpacity>

          {/* Header framing — position the first photo for the Do Mode header */}
          {photoItems.length > 0 && (
            <>
              <FormLabel title="HEADER FRAMING" />
              <Text style={styles.headerFrameHint}>
                Drag the photo to set what shows in the session header.
              </Text>
              <HeaderPhotoPositioner
                uri={photoItems[0].displayUri}
                focusY={headerFocusY}
                onChange={setHeaderFocusY}
                boxW={SCREEN_W - 40}
                boxH={Math.round((SCREEN_W - 40) * HEADER_ASPECT)}
                exerciseName={name}
                onDragStart={() => setScrollLocked(true)}
                onDragEnd={() => setScrollLocked(false)}
              />
            </>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.saveButton, (saving || uploadingNewVideo) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving || uploadingNewVideo}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveButtonText}>{t.library.addExercise.saveButton}</Text>
            }
          </TouchableOpacity>

          {isEdit && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.8}>
              <Text style={styles.deleteText}>Delete Exercise</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Custom equipment — centered glass text-entry (the app-wide popup family).
          KeyboardAvoidingView keeps the input above the keyboard per the
          centered-text-entry rule in CLAUDE.md §2. */}
      <Modal visible={customEquipOpen} transparent animationType="fade" onRequestClose={() => setCustomEquipOpen(false)}>
        <KeyboardAvoidingView style={styles.customEquipOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setCustomEquipOpen(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.customEquipShadow}>
            <GlassPanel style={styles.customEquipBox}>
              <Text style={styles.customEquipTitle}>
                {customEquipEditing ? t.library.addExercise.customEquipEditTitle : t.library.addExercise.customEquipTitle}
              </Text>
              <TextInput
                style={styles.customEquipInput}
                value={customEquipText}
                onChangeText={setCustomEquipText}
                placeholder={t.library.addExercise.customEquipPlaceholder}
                placeholderTextColor="#9aa39e"
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={confirmCustomEquip}
              />
              <TouchableOpacity style={styles.customEquipConfirm} onPress={confirmCustomEquip} activeOpacity={0.85}>
                <Text style={styles.customEquipConfirmText}>
                  {customEquipEditing ? t.library.addExercise.customEquipSave : t.library.addExercise.customEquipAdd}
                </Text>
              </TouchableOpacity>
              {customEquipEditing != null && (
                <TouchableOpacity style={styles.customEquipCancel} onPress={deleteCustomEquip} activeOpacity={0.7}>
                  <Text style={styles.customEquipDeleteText}>{t.library.addExercise.customEquipDelete}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.customEquipCancel} onPress={() => setCustomEquipOpen(false)} activeOpacity={0.7}>
                <Text style={styles.customEquipCancelText}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </GlassPanel>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Glass header — rendered last so it overlays the form. Carried the old
          dark-green SafeAreaView bar until July 26. */}
      <LightHeader
        left={
          <HeaderIcon onPress={() => router.back()}>
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title={isEdit ? t.library.addExercise.editTitle : t.library.addExercise.title}
        right={<VFIcon size={26} color={HEADER_ICON} />}
      />
    </View>
  );
}

function FormLabel({ title }: { title: string }) {
  return <Text style={styles.formLabel}>{title}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  loadingRoot: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },

  formContent: {
    backgroundColor: BG, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48, flexGrow: 1,
  },
  formLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 20,
  },

  card: {
    backgroundColor: CARD, borderRadius: RADIUS, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  mediaCard: { marginBottom: 8 },
  pillCard: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },

  nameInput: {
    fontSize: 17, fontWeight: '600', color: TEXT,
    paddingHorizontal: 16, paddingVertical: 14,
  },

  selectPill: {
    borderRadius: 100, backgroundColor: '#f5f5f3',
    paddingHorizontal: 13, paddingVertical: 7,
  },
  selectPillActive: { backgroundColor: ACCENT },
  selectPillText: { fontSize: 13, fontWeight: '600', color: '#555' },
  selectPillTextActive: { color: '#fff' },

  bodySectionToggle: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  bodySectionBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  bodySectionBtnActive: {
    borderBottomWidth: 2, borderBottomColor: HEADER,
  },
  bodySectionBtnText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  bodySectionBtnTextActive: { color: HEADER },

  muscleGroupSection: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  muscleGroupHeader: {
    fontSize: 10, fontWeight: '800', color: '#bbb', letterSpacing: 0.8, marginBottom: 8,
  },
  muscleGroupPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },

  equipmentHint: { fontSize: 12, color: '#999', marginTop: 8 },

  customEquipPill: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#d0d0cc', borderStyle: 'dashed' },
  customEquipPillText: { fontSize: 13, fontWeight: '600', color: '#999' },
  // Centered glass text-entry (app-wide popup family: radius-38 shadow wrapper
  // + GlassPanel, muted grays darkened on glass).
  customEquipOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  customEquipShadow: {
    alignSelf: 'stretch', borderRadius: 38,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22, shadowRadius: 28, elevation: 12,
  },
  customEquipBox: { borderRadius: 38, overflow: 'hidden', padding: 24 },
  customEquipTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 14 },
  customEquipInput: {
    backgroundColor: '#f5f5f3', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: TEXT, marginBottom: 16,
  },
  customEquipConfirm: {
    backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 13, alignItems: 'center',
  },
  customEquipConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  customEquipCancel: { paddingVertical: 12, alignItems: 'center' },
  customEquipCancelText: { fontSize: 14, fontWeight: '600', color: '#414b45' },
  customEquipDeleteText: { fontSize: 14, fontWeight: '600', color: '#e53935' },

  notesInput: {
    fontSize: 15, color: TEXT,
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 90,
  },

  // Shared empty-state dashed card for video and photo
  mediaEmptyCard: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD, borderRadius: RADIUS,
    borderWidth: 1.5, borderColor: '#d0d0cc', borderStyle: 'dashed',
    paddingVertical: 32, gap: 10,
  },
  mediaEmptyText: { fontSize: 14, color: '#bbb', fontWeight: '500' },

  // Video preview
  videoPreviewWrapper: { position: 'relative', backgroundColor: '#111' },
  videoThumbnail: { width: '100%', height: 200 },
  videoPlaceholderFill: { alignItems: 'center', justifyContent: 'center' },
  videoPlaceholderLabel: { color: '#888', fontSize: 12, fontWeight: '500', marginTop: 8 },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  videoAngleLabel: {
    position: 'absolute', bottom: 8, left: 8,
    color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600',
  },
  playCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(36,172,136,0.85)',
    alignItems: 'center', justifyContent: 'center',
    paddingLeft: 3,
  },

  // Photo preview
  photoThumbnail: { width: '100%', height: 200 },
  headerFrameHint: { fontSize: 12, color: '#999', marginBottom: 10, marginTop: -2 },

  // Shared remove button (top-right of each media card)
  mediaRemoveBtn: { position: 'absolute', top: 10, right: 10 },
  mediaRemoveCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  errorText: { color: '#e53935', fontSize: 14, marginTop: 12, lineHeight: 20 },

  saveButton: {
    backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 15, alignItems: 'center', marginTop: 28,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  deleteButton: { paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  deleteText: { color: '#e53935', fontSize: 15, fontWeight: '600' },
});
