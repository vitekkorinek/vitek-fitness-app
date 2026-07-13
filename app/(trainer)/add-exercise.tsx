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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { launchImageLibrary } from 'react-native-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { VFIcon } from '@/components/VFIcon';
import t from '@/i18n/en';

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
    { group: 'Arms',      muscles: ['Biceps', 'Triceps', 'Forearms'] },
    { group: 'Core',      muscles: ['Upper Abs', 'Lower Abs', 'Obliques', 'Lower Back'] },
  ],
  lower: [
    { group: 'Lower Body', muscles: ['Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves'] },
  ],
};

const EQUIPMENT_OPTIONS = [
  'None', 'Barbell', 'Z Bar', 'Dumbbell', 'Kettlebell',
  'Machine', 'Bodyweight', 'Cable', 'Resistance Band', 'TRX',
];

type VideoItem = { videoUrl: string; thumbnailUri: string | null };
type PhotoItem = { displayUri: string; localUri: string | null };

export default function AddExerciseScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const isEdit = !!exerciseId;

  const [name, setName] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [secondaryMuscleGroups, setSecondaryMuscleGroups] = useState<string[]>([]);
  const [primarySection, setPrimarySection] = useState<BodySection>('upper');
  const [secondarySection, setSecondarySection] = useState<BodySection>('upper');
  const [equipment, setEquipment] = useState('None');
  const [notes, setNotes] = useState('');
  const [loadingExercise, setLoadingExercise] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [videoItems, setVideoItems] = useState<VideoItem[]>([]);
  const [uploadingNewVideo, setUploadingNewVideo] = useState(false);
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);

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
          setEquipment(e.equipment ?? 'None');
          setNotes(e.description ?? '');

          const videos: VideoItem[] = [];
          if (e.video_url) videos.push({ videoUrl: e.video_url, thumbnailUri: e.thumbnail_url ?? null });
          for (const u of (e.extra_video_urls ?? [])) videos.push({ videoUrl: u, thumbnailUri: null });
          setVideoItems(videos);

          const photos: PhotoItem[] = (e.extra_photo_urls ?? []).map((u: string) => ({ displayUri: u, localUri: null }));
          setPhotoItems(photos);
        }
        setLoadingExercise(false);
      });
  }, [exerciseId, isEdit]);

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

    // thumbnail_url: first uploaded photo if any, else first video's auto-thumbnail
    const autoThumbnail = videoItems[0]?.thumbnailUri ?? null;
    const finalThumbnail = finalPhotoUrls[0] ?? autoThumbnail;

    const payload = {
      name:                     name.trim(),
      muscle_groups:            muscleGroups,
      secondary_muscle_groups:  secondaryMuscleGroups,
      equipment:                equipment === 'None' ? null : equipment,
      description:              notes.trim() || null,
      video_url:                videoItems[0]?.videoUrl ?? null,
      extra_video_urls:         videoItems.slice(1).map(v => v.videoUrl),
      thumbnail_url:            finalThumbnail,
      extra_photo_urls:         finalPhotoUrls,
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
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEdit ? t.library.addExercise.editTitle : t.library.addExercise.title}
          </Text>
          <VFIcon size={24} color="#ffffff" />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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

          {/* Equipment */}
          <FormLabel title={t.library.addExercise.labelEquipment} />
          <View style={[styles.card, styles.pillCard]}>
            {EQUIPMENT_OPTIONS.map(eq => {
              const active = equipment === eq;
              return (
                <TouchableOpacity
                  key={eq}
                  style={[styles.selectPill, active && styles.selectPillActive]}
                  onPress={() => setEquipment(eq)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{eq}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
  root: { flex: 1, backgroundColor: HEADER },
  loadingRoot: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },

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
