import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  Pressable,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  InputAccessoryView,
} from 'react-native';
import { GestureDetector, Gesture, ScrollView } from 'react-native-gesture-handler';
import { LightHeader, useHeaderHeight } from '@/components/LightHeader';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { VFIcon } from '@/components/VFIcon';
import { TrainerLogoButton } from '@/components/TrainerLogoButton';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { SymbolView } from 'expo-symbols';
import { BottomSheet } from '@/components/BottomSheet';
import { useCardVariant, type CoverCardVariant } from '@/lib/cardVariant';
import { DARK_CARD_FOOTER, DARK_CARD_GRADIENT } from '@/components/WorkoutPaperCover';
import { nameInitial } from '@/lib/utils';
import t from '@/i18n/en';

// ─── Constants ────────────────────────────────────────────────────────────────

const PREVIEW_HEIGHT = 220;

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TrainerSettings = {
  id?: string;
  full_name: string;
  address_street: string;
  address_city: string;
  address_postcode: string;
  phone: string;
  steuernummer: string;
  iban: string;
  bic: string;
  logo_url: string;
  invoice_number_start: string;
};

type FieldModal = {
  label: string;
  value: string;
  placeholder: string;
  keyboard: 'default' | 'phone-pad' | 'decimal-pad' | 'numeric';
  onSave: (v: string) => void;
};

const EMPTY: TrainerSettings = {
  full_name: '',
  address_street: '',
  address_city: '',
  address_postcode: '',
  phone: '',
  steuernummer: '',
  iban: '',
  bic: '',
  logo_url: '',
  invoice_number_start: '1',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const { profile, signOut } = useAuth();
  const initial = nameInitial(profile?.name ?? 'V');
  const tabBarH = useTabBarHeight();
  const headerH = useHeaderHeight();

  const [settings, setSettings] = useState<TrainerSettings>(EMPTY);
  const [savedSettings, setSavedSettings] = useState<TrainerSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fieldModal, setFieldModal] = useState<FieldModal | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');
  // Workout card style (lib/cardVariant.ts) — device-local, applies instantly; shown in
  // the TRAINER CARDS APPEARANCE section below (after the client-home-banner section)
  // and deliberately OUTSIDE the Save flow (it's not part of trainer_settings).
  const [cardStyleOpen, setCardStyleOpen] = useState(false);
  const cardVariant    = useCardVariant(s => s.variant);
  const setCardVariant = useCardVariant(s => s.setVariant);

  // Banner photo state — saved to users table, not trainer_settings
  const [bannerPhotoUrl, setBannerPhotoUrl] = useState('');
  const [savedBannerPhotoUrl, setSavedBannerPhotoUrl] = useState('');
  const [bannerPhotoOffsetY, setBannerPhotoOffsetY] = useState(40);
  const [savedBannerPhotoOffsetY, setSavedBannerPhotoOffsetY] = useState(40);
  const [bannerPhotoZoom, setBannerPhotoZoom] = useState(1.5);
  const [savedBannerPhotoZoom, setSavedBannerPhotoZoom] = useState(1.5);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerNaturalDims, setBannerNaturalDims] = useState<{w:number,h:number}|null>(null);
  const [previewContainerW, setPreviewContainerW] = useState(0);
  const [vfIconPosX, setVfIconPosX] = useState(0.88);
  const [savedVfIconPosX, setSavedVfIconPosX] = useState(0.88);
  const [vfIconPosY, setVfIconPosY] = useState(0.06);
  const [savedVfIconPosY, setSavedVfIconPosY] = useState(0.06);


  const bannerOffsetYRef = useRef(40);
  bannerOffsetYRef.current = bannerPhotoOffsetY;
  const bannerZoomRef = useRef(1.5);
  bannerZoomRef.current = bannerPhotoZoom;
  const bannerBaseHRef = useRef(PREVIEW_HEIGHT);
  const dragStartOffsetY = useRef(40);
  const vfIconPosXRef = useRef(0.88);
  vfIconPosXRef.current = vfIconPosX;
  const vfIconPosYRef = useRef(0.06);
  vfIconPosYRef.current = vfIconPosY;
  const iconDragStartX = useRef(0.88);
  const iconDragStartY = useRef(0.06);


  const panGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin(() => {
        dragStartOffsetY.current = bannerOffsetYRef.current;
      })
      .onUpdate(({ translationY }) => {
        const overflow = Math.max(Math.round(bannerBaseHRef.current * bannerZoomRef.current) - PREVIEW_HEIGHT, 0);
        const range = Math.min(Math.max(overflow, 1), PREVIEW_HEIGHT);
        const newY = Math.max(0, Math.min(100,
          dragStartOffsetY.current - (translationY / range) * 100
        ));
        setBannerPhotoOffsetY(Math.round(newY));
      }),
    []
  );

  const iconDragGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin(() => {
        iconDragStartX.current = vfIconPosXRef.current;
        iconDragStartY.current = vfIconPosYRef.current;
      })
      .onUpdate(({ translationX, translationY }) => {
        const w = Math.max(previewContainerW, 1);
        setVfIconPosX(Math.max(0, Math.min(1, iconDragStartX.current + translationX / w)));
        setVfIconPosY(Math.max(0, Math.min(1, iconDragStartY.current + translationY / PREVIEW_HEIGHT)));
      }),
    [previewContainerW]
  );

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
    || bannerPhotoUrl !== savedBannerPhotoUrl
    || bannerPhotoOffsetY !== savedBannerPhotoOffsetY
    || bannerPhotoZoom !== savedBannerPhotoZoom
    || vfIconPosX !== savedVfIconPosX
    || vfIconPosY !== savedVfIconPosY;

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [{ data: settingsData }, { data: userData }] = await Promise.all([
      supabase.from('trainer_settings').select('*').eq('trainer_id', profile.id).single(),
      supabase.from('users').select('banner_photo_url, banner_photo_offset_y, banner_photo_zoom, vf_icon_pos_x, vf_icon_pos_y').eq('id', profile.id).single(),
    ]);
    if (settingsData) {
      const loaded: TrainerSettings = {
        id: settingsData.id,
        full_name: settingsData.full_name ?? '',
        address_street: settingsData.address_street ?? '',
        address_city: settingsData.address_city ?? '',
        address_postcode: settingsData.address_postcode ?? '',
        phone: settingsData.phone ?? '',
        steuernummer: settingsData.steuernummer ?? '',
        iban: settingsData.iban ?? '',
        bic: settingsData.bic ?? '',
        logo_url: settingsData.logo_url ?? '',
        invoice_number_start: settingsData.invoice_number_start != null ? String(settingsData.invoice_number_start) : '1',
      };
      setSettings(loaded);
      setSavedSettings(loaded);
    }
    if (userData) {
      const url = userData.banner_photo_url ?? '';
      const offset = userData.banner_photo_offset_y ?? 40;
      const zoom = userData.banner_photo_zoom ?? 1.5;
      setBannerPhotoUrl(url);
      setSavedBannerPhotoUrl(url);
      setBannerPhotoOffsetY(offset);
      setSavedBannerPhotoOffsetY(offset);
      setBannerPhotoZoom(zoom);
      setSavedBannerPhotoZoom(zoom);
      const iconX = userData.vf_icon_pos_x ?? 0.88;
      const iconY = userData.vf_icon_pos_y ?? 0.06;
      setVfIconPosX(iconX); setSavedVfIconPosX(iconX);
      setVfIconPosY(iconY); setSavedVfIconPosY(iconY);
      if (url) Image.getSize(url, (w, h) => setBannerNaturalDims({w, h}), () => {});
    }
  }, [profile?.id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const patchField = (patch: Partial<TrainerSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  const saveAll = async (overrideSettings?: TrainerSettings) => {
    if (!profile?.id) return;
    const current = overrideSettings ?? settings;
    setSaving(true);
    try {
      const dbPatch: Record<string, unknown> = {
        trainer_id: profile.id,
        updated_at: new Date().toISOString(),
      };
      for (const key of Object.keys(current) as (keyof TrainerSettings)[]) {
        if (key === 'invoice_number_start') {
          const n = parseInt((current[key] as string) ?? '1', 10);
          dbPatch.invoice_number_start = isNaN(n) ? 1 : n;
        } else if (key !== 'id') {
          dbPatch[key] = (current[key] as string) || null;
        }
      }
      const [{ error: settingsError }, { error: userError }] = await Promise.all([
        supabase.from('trainer_settings').upsert(dbPatch, { onConflict: 'trainer_id' }),
        supabase.from('users').update({
          banner_photo_url: bannerPhotoUrl || null,
          banner_photo_offset_y: bannerPhotoOffsetY,
          banner_photo_zoom: bannerPhotoZoom,
          vf_icon_pos_x: vfIconPosX,
          vf_icon_pos_y: vfIconPosY,
        }).eq('id', profile.id),
      ]);
      if (settingsError || userError) {
        Alert.alert(t.common.error, (settingsError ?? userError)!.message);
      } else {
        setSavedSettings(current);
        setSavedBannerPhotoUrl(bannerPhotoUrl);
        setSavedBannerPhotoOffsetY(bannerPhotoOffsetY);
        setSavedBannerPhotoZoom(bannerPhotoZoom);
        setSavedVfIconPosX(vfIconPosX);
        setSavedVfIconPosY(vfIconPosY);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const openField = (f: FieldModal) => {
    setFieldDraft(f.value);
    setFieldModal(f);
  };

  const pickBanner = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingBanner(true);
    try {
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `banner-${makeUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('client-banners')
        .upload(fileName, buffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (error) {
        Alert.alert(t.account.uploadError, error.message);
        return;
      }
      const { data: { publicUrl } } = supabase.storage
        .from('client-banners')
        .getPublicUrl(fileName);
      setBannerPhotoUrl(publicUrl);
      setBannerPhotoOffsetY(50);
      setBannerPhotoZoom(1.0);
      Image.getSize(publicUrl, (w, h) => setBannerNaturalDims({w, h}), () => {});
    } catch (e: any) {
      Alert.alert(t.account.uploadError, e?.message ?? '');
    } finally {
      setUploadingBanner(false);
    }
  };

  const pickLogo = () => {
    Alert.alert('Not available', 'Logo upload is available in the full app build.');
  };

  const baseH = (bannerNaturalDims && previewContainerW > 0)
    ? Math.round(bannerNaturalDims.h * previewContainerW / bannerNaturalDims.w)
    : PREVIEW_HEIGHT;
  bannerBaseHRef.current = baseH;
  // Scale both dimensions uniformly — width grows beyond container and is clipped on both sides
  const imageW = previewContainerW > 0 ? Math.round(previewContainerW * bannerPhotoZoom) : undefined;
  const imageL = previewContainerW > 0 ? Math.round(-(previewContainerW * (bannerPhotoZoom - 1) / 2)) : undefined;
  const previewImageH = Math.max(PREVIEW_HEIGHT, Math.round(baseH * bannerPhotoZoom));
  const imageTop = -(bannerPhotoOffsetY / 100) * (previewImageH - PREVIEW_HEIGHT);
  const canZoomOut = bannerPhotoZoom > 1.0;
  const canZoomIn  = bannerPhotoZoom < 2.5;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.outerSafe}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: headerH + 8, paddingBottom: tabBarH }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Profile card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>{initial}</Text>
            </View>
            <Text style={styles.profileName}>{profile?.name ?? '—'}</Text>
            <Text style={styles.profileEmail}>{profile?.email ?? '—'}</Text>
            <View style={styles.trainerBadge}>
              <Text style={styles.trainerBadgeText}>Trainer</Text>
            </View>
          </View>

          {/* Banner photo */}
          <Text style={styles.sectionLabel}>{t.account.bannerPhotoSection}</Text>
          <View style={styles.bannerCard}>
            <TouchableOpacity
              style={styles.bannerPickRow}
              onPress={pickBanner}
              activeOpacity={0.7}
              disabled={uploadingBanner}
            >
              <Text style={styles.bizLabel}>{t.account.bannerPhoto}</Text>
              <View style={styles.logoRight}>
                {uploadingBanner ? (
                  <ActivityIndicator color="#24ac88" size="small" />
                ) : bannerPhotoUrl ? (
                  <Image source={{ uri: bannerPhotoUrl }} style={styles.bannerThumb} />
                ) : (
                  <Text style={styles.bizMuted}>{t.account.tapToUpload}</Text>
                )}
              </View>
            </TouchableOpacity>

            {bannerPhotoUrl ? (
              <>
                <View style={styles.sep} />
                <View style={styles.bannerPreviewSection}>
                  <Text style={styles.bannerPreviewLabel}>{t.account.bannerPreviewLabel}</Text>
                  <GestureDetector gesture={panGesture}>
                  <View style={styles.bannerPreviewFrame}>
                    <View
                      style={styles.bannerPreviewClip}
                      onLayout={e => setPreviewContainerW(Math.round(e.nativeEvent.layout.width))}
                    >
                      <Image
                        source={{ uri: bannerPhotoUrl }}
                        style={[styles.bannerPreviewImage, { width: imageW, left: imageL, height: previewImageH, top: imageTop }]}
                        resizeMode="stretch"
                      />
                      <LinearGradient
                        colors={['rgba(0,0,0,0.55)', 'transparent']}
                        locations={[0, 1]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 0.35 }}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />
                      {/* Dynamic island indicator */}
                      <View style={styles.islandBar} pointerEvents="none">
                        <View style={styles.islandPill} />
                      </View>
                      {/* Greeting text overlay */}
                      <View style={styles.greetingOverlay} pointerEvents="none">
                        <Text style={styles.greetingHi}>Hi [client name],</Text>
                        <Text style={styles.greetingSlogan} numberOfLines={2}>ready to be better than yesterday?</Text>
                      </View>
                      {/* Draggable VF icon */}
                      {previewContainerW > 0 && (
                        <GestureDetector gesture={iconDragGesture}>
                          <View style={[styles.iconDragHandle, {
                            left: Math.round(vfIconPosX * previewContainerW) - 22,
                            top: Math.round(vfIconPosY * PREVIEW_HEIGHT) - 22,
                          }]}>
                            <VFIcon size={20} color="#fff" />
                          </View>
                        </GestureDetector>
                      )}
                    </View>
                    <View style={styles.dragHintRow} pointerEvents="none">
                      <Text style={styles.dragHintText}>{t.account.bannerDragHint}</Text>
                    </View>
                  </View>
                  </GestureDetector>
                  {/* Zoom controls */}
                  <View style={styles.zoomRow}>
                    <Text style={styles.zoomLabel}>Zoom</Text>
                    <View style={styles.zoomBtns}>
                      <TouchableOpacity
                        style={[styles.zoomBtn, !canZoomOut && styles.zoomBtnDisabled]}
                        onPress={() => {
                          if (!canZoomOut) return;
                          const newZoom = Math.max(1.0, parseFloat((bannerPhotoZoom - 0.1).toFixed(1)));
                          const oldOverflow = Math.max(Math.round(baseH * bannerPhotoZoom) - PREVIEW_HEIGHT, 1);
                          const newOverflow = Math.max(Math.round(baseH * newZoom) - PREVIEW_HEIGHT, 1);
                          const newOffsetY = Math.max(0, Math.min(100, Math.round(bannerPhotoOffsetY * oldOverflow / newOverflow)));
                          setBannerPhotoZoom(newZoom);
                          setBannerPhotoOffsetY(newOffsetY);
                        }}
                        activeOpacity={0.7}
                        disabled={!canZoomOut}
                      >
                        <Text style={[styles.zoomBtnText, !canZoomOut && styles.zoomBtnTextDisabled]}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.zoomValue}>{bannerPhotoZoom.toFixed(1)}×</Text>
                      <TouchableOpacity
                        style={[styles.zoomBtn, !canZoomIn && styles.zoomBtnDisabled]}
                        onPress={() => {
                          if (!canZoomIn) return;
                          const newZoom = Math.min(2.5, parseFloat((bannerPhotoZoom + 0.1).toFixed(1)));
                          const oldOverflow = Math.max(Math.round(baseH * bannerPhotoZoom) - PREVIEW_HEIGHT, 1);
                          const newOverflow = Math.max(Math.round(baseH * newZoom) - PREVIEW_HEIGHT, 1);
                          const newOffsetY = Math.max(0, Math.min(100, Math.round(bannerPhotoOffsetY * oldOverflow / newOverflow)));
                          setBannerPhotoZoom(newZoom);
                          setBannerPhotoOffsetY(newOffsetY);
                        }}
                        activeOpacity={0.7}
                        disabled={!canZoomIn}
                      >
                        <Text style={[styles.zoomBtnText, !canZoomIn && styles.zoomBtnTextDisabled]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                </View>
                <View style={styles.sep} />
                <TouchableOpacity
                  style={styles.removePhotoRow}
                  onPress={() => { setBannerPhotoUrl(''); setBannerNaturalDims(null); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.removePhotoText}>Remove photo</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          {/* Trainer cards appearance — device-local, applies instantly; deliberately
              outside the Save flow (it's not part of trainer_settings). */}
          <Text style={styles.sectionLabel}>{t.account.appearance}</Text>
          <View style={styles.card}>
            <BizRow
              label={t.account.workoutCardStyle}
              value={cardVariant === 'dark' ? t.account.cardStyleDark : t.account.cardStyleLight}
              onPress={() => setCardStyleOpen(true)}
            />
          </View>

          {/* Business Details */}
          <Text style={styles.sectionLabel}>{t.account.businessDetails}</Text>
          <View style={styles.card}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#24ac88" />
              </View>
            ) : (
              <>
                <BizRow
                  label={t.account.fullName}
                  value={settings.full_name}
                  onPress={() => openField({
                    label: t.account.fullName,
                    value: settings.full_name,
                    placeholder: 'e.g. Vitek Korinek',
                    keyboard: 'default',
                    onSave: v => patchField({ full_name: v }),
                  })}
                />
                <Sep />
                <BizRow
                  label={t.account.streetAddress}
                  value={settings.address_street}
                  onPress={() => openField({
                    label: t.account.streetAddress,
                    value: settings.address_street,
                    placeholder: 'e.g. Musterstraße 12',
                    keyboard: 'default',
                    onSave: v => patchField({ address_street: v }),
                  })}
                />
                <Sep />
                <BizRow
                  label={t.account.city}
                  value={settings.address_city}
                  onPress={() => openField({
                    label: t.account.city,
                    value: settings.address_city,
                    placeholder: 'e.g. Berlin',
                    keyboard: 'default',
                    onSave: v => patchField({ address_city: v }),
                  })}
                />
                <Sep />
                <BizRow
                  label={t.account.postcode}
                  value={settings.address_postcode}
                  onPress={() => openField({
                    label: t.account.postcode,
                    value: settings.address_postcode,
                    placeholder: 'e.g. 10115',
                    keyboard: 'numeric',
                    onSave: v => patchField({ address_postcode: v }),
                  })}
                />
                <Sep />
                <BizRow
                  label={t.account.phone}
                  value={settings.phone}
                  onPress={() => openField({
                    label: t.account.phone,
                    value: settings.phone,
                    placeholder: 'e.g. +49 170 1234567',
                    keyboard: 'phone-pad',
                    onSave: v => patchField({ phone: v }),
                  })}
                />
                <Sep />
                <BizRow
                  label={t.account.steuernummer}
                  value={settings.steuernummer}
                  onPress={() => openField({
                    label: t.account.steuernummer,
                    value: settings.steuernummer,
                    placeholder: 'e.g. 12/345/67890',
                    keyboard: 'default',
                    onSave: v => patchField({ steuernummer: v }),
                  })}
                />
                <Sep />
                <BizRow
                  label={t.account.iban}
                  value={settings.iban}
                  onPress={() => openField({
                    label: t.account.iban,
                    value: settings.iban,
                    placeholder: 'e.g. DE89 3704 0044 0532 0130 00',
                    keyboard: 'default',
                    onSave: v => patchField({ iban: v }),
                  })}
                />
                <Sep />
                <BizRow
                  label={t.account.bic}
                  value={settings.bic}
                  onPress={() => openField({
                    label: t.account.bic,
                    value: settings.bic,
                    placeholder: 'e.g. COBADEFFXXX',
                    keyboard: 'default',
                    onSave: v => patchField({ bic: v }),
                  })}
                />
                <Sep />
                {/* Logo row — stubbed until production build */}
                <TouchableOpacity style={styles.bizRow} onPress={pickLogo} activeOpacity={0.7}>
                  <Text style={styles.bizLabel}>{t.account.logo}</Text>
                  <View style={styles.logoRight}>
                    {settings.logo_url ? (
                      <Image source={{ uri: settings.logo_url }} style={styles.logoThumb} />
                    ) : (
                      <Text style={styles.bizMuted}>{t.account.tapToUpload}</Text>
                    )}
                  </View>
                </TouchableOpacity>
                <Sep />
                <BizRow
                  label={t.account.invoiceNumberStart}
                  value={settings.invoice_number_start}
                  onPress={() => openField({
                    label: t.account.invoiceNumberStart,
                    value: settings.invoice_number_start,
                    placeholder: 'e.g. 48',
                    keyboard: 'numeric',
                    onSave: v => patchField({ invoice_number_start: v }),
                  })}
                />
              </>
            )}
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveButton, (!isDirty || saving) && styles.saveButtonDimmed]}
            onPress={() => saveAll()}
            disabled={!isDirty || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>
                {saveSuccess ? '✓  Saved' : t.common.save}
              </Text>
            )}
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={signOut}
            activeOpacity={0.8}
          >
            <Text style={styles.signOutText}>{t.common.signOut}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Field edit modal */}
      {fieldModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setFieldModal(null)} statusBarTranslucent>
          <View style={modalStyles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setFieldModal(null)} />
            <View style={modalStyles.box}>
              <Text style={modalStyles.title}>{fieldModal.label}</Text>
              <TextInput
                style={modalStyles.input}
                value={fieldDraft}
                onChangeText={setFieldDraft}
                keyboardType={fieldModal.keyboard}
                placeholder={fieldModal.placeholder}
                placeholderTextColor="#ccc"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                inputAccessoryViewID={Platform.OS === 'ios' ? 'account-field-input' : undefined}
                onSubmitEditing={() => { fieldModal.onSave(fieldDraft); setFieldModal(null); }}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={modalStyles.confirmBtn}
                onPress={() => { fieldModal.onSave(fieldDraft); setFieldModal(null); }}
                activeOpacity={0.85}
              >
                <Text style={modalStyles.confirmBtnText}>{t.common.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFieldModal(null)} hitSlop={8}>
                <Text style={modalStyles.cancel}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID="account-field-input">
              <View style={{ height: 0 }} />
            </InputAccessoryView>
          )}
        </Modal>
      )}

      {/* ── Workout card style sheet (mirrors the client Me tab picker) ── */}
      {cardStyleOpen && (
        <BottomSheet onClose={() => setCardStyleOpen(false)}>
          {close => (
            <View style={{ paddingHorizontal: 20, paddingBottom: 4, gap: 12, alignItems: 'stretch' }}>
              <Text style={[modalStyles.title, { textAlign: 'center' }]}>{t.account.workoutCardStyle}</Text>
              <Text style={cardStyleSt.sub}>{t.account.workoutCardStyleSub}</Text>
              {([
                ['dark', t.account.cardStyleDark],
                ['light', t.account.cardStyleLight],
              ] as [CoverCardVariant, string][]).map(([v, label]) => (
                <TouchableOpacity
                  key={v}
                  style={[cardStyleSt.option, cardVariant === v && cardStyleSt.optionActive]}
                  onPress={() => { setCardVariant(v); close(); }}
                  activeOpacity={0.85}
                >
                  {/* Miniature of the card anatomy — footer is always the OPPOSITE of
                      the cover: dark cover + white footer, or white cover + dark footer. */}
                  <View style={cardStyleSt.swatch}>
                    <View style={[cardStyleSt.swatchCover, v === 'light' && cardStyleSt.swatchCoverLight]}>
                      <View style={[cardStyleSt.swatchLine, { width: 22 }, v === 'light' && cardStyleSt.swatchLineLight]} />
                      <View style={[cardStyleSt.swatchLine, { width: 15 }, v === 'light' && cardStyleSt.swatchLineLight]} />
                    </View>
                    <View style={[cardStyleSt.swatchFooter, v === 'dark' && cardStyleSt.swatchFooterLight]} />
                  </View>
                  <Text style={[cardStyleSt.optionLabel, cardVariant === v && cardStyleSt.optionLabelActive]}>{label}</Text>
                  {cardVariant === v && <SymbolView name="checkmark" size={15} tintColor="#24ac88" weight="semibold" />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => close()} hitSlop={8} style={{ alignSelf: 'center', paddingTop: 4 }}>
                <Text style={modalStyles.cancel}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* Solid light header (rendered last so it overlays the content) */}
      <LightHeader solid left={<TrainerLogoButton light />} title={t.account.title} />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BizRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.bizRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.bizLabel}>{label}</Text>
      <Text style={[styles.bizValue, !value && styles.bizMuted]} numberOfLines={1}>
        {value || t.account.notSet}
      </Text>
    </TouchableOpacity>
  );
}

function Sep() {
  return <View style={styles.sep} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#faf9f7' },
  outerSafe: { flex: 1, backgroundColor: '#faf9f7' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },

  profileCard: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#24ac88',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarLargeText: { color: '#ffffff', fontSize: 28, fontWeight: '700' },
  profileName: { fontSize: 20, fontWeight: '700', color: '#244e43', marginBottom: 4 },
  profileEmail: { fontSize: 14, color: '#999', marginBottom: 12 },
  trainerBadge: {
    backgroundColor: '#e6f7f3',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#24ac88',
  },
  trainerBadgeText: { color: '#24ac88', fontSize: 12, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  loadingRow: { paddingVertical: 24, alignItems: 'center' },
  bizRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  bizLabel: { fontSize: 14, color: '#999', flex: 1 },
  bizValue: { fontSize: 14, fontWeight: '500', color: '#1a1a1a', maxWidth: '60%', textAlign: 'right' },
  bizMuted: { color: '#ccc' },
  sep: { height: 1, backgroundColor: '#e8e8e4', marginHorizontal: 16 },

  logoRight: { flexDirection: 'row', alignItems: 'center' },
  logoThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f0f0ed',
  },

  // Banner photo section
  bannerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  bannerPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  bannerThumb: {
    width: 60,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#f0f0ed',
  },
  removePhotoRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  removePhotoText: {
    fontSize: 14,
    color: '#e85d4a',
  },
  bannerPreviewSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  bannerPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bannerPreviewFrame: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  bannerPreviewClip: {
    height: PREVIEW_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bannerPreviewImage: {
    position: 'absolute',
    width: '100%',
  },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  zoomLabel: { fontSize: 12, color: '#999', fontWeight: '500' },
  zoomBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoomBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: '#24ac88', alignItems: 'center', justifyContent: 'center' },
  zoomBtnDisabled: { borderColor: '#ddd' },
  zoomBtnText: { fontSize: 18, fontWeight: '600', color: '#24ac88', lineHeight: 22 },
  zoomBtnTextDisabled: { color: '#ddd' },
  zoomValue: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', minWidth: 36, textAlign: 'center' },
  iconDragHandle: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  islandBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 20, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 },
  islandPill: { width: 100, height: 9, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 5 },
  greetingOverlay: { position: 'absolute', bottom: 14, left: 14, right: 14 },
  greetingHi: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 3 },
  greetingSlogan: { fontSize: 15, color: '#fff', fontWeight: '700', lineHeight: 20 },
  dragHintRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dragHintText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    letterSpacing: 0.2,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
  },

  saveButton: {
    backgroundColor: '#24ac88',
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonDimmed: { backgroundColor: '#a8d9cc' },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  signOutButton: {
    backgroundColor: '#f5f5f3',
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#e53935' },
});

// Workout card style picker — option rows with a miniature of the card anatomy
// (footer strip always the opposite of the cover: dark/white or white/dark).
// Mirrors cardStyleSt in the client Me tab.
const cardStyleSt = StyleSheet.create({
  sub:    { fontSize: 12, color: '#999', textAlign: 'center', marginTop: -6, marginBottom: 2 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  optionActive:      { backgroundColor: '#E9F7F2' },
  optionLabel:       { flex: 1, fontSize: 15, color: '#1a1a1a' },
  optionLabelActive: { fontWeight: '700', color: '#244e43' },
  swatch: {
    width: 48, height: 40, borderRadius: 9, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
  },
  swatchCover:      { flex: 1, backgroundColor: DARK_CARD_GRADIENT[1], padding: 6, gap: 3, justifyContent: 'center' },
  swatchCoverLight: { backgroundColor: '#fff' },
  swatchLine:       { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  swatchLineLight:  { backgroundColor: 'rgba(0,0,0,0.35)' },
  swatchFooter:      { height: 12, backgroundColor: DARK_CARD_FOOTER },
  swatchFooterLight: { backgroundColor: '#fff' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 32 },
  box: { backgroundColor: '#ffffff', borderRadius: 16, padding: 24, alignItems: 'center', gap: 14 },
  title: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  input: {
    alignSelf: 'stretch',
    backgroundColor: '#f5f5f3',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#1a1a1a',
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: '#24ac88',
    borderRadius: 100,
    paddingVertical: 13,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel: { fontSize: 14, color: '#999' },
});
