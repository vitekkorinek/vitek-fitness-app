import t from '@/i18n/en';

/**
 * Alternate app icons (Aug 2026) — the Appearance picker on client Me and
 * trainer Account. Icons live in `assets/app-icons/` (1024 PNGs + SVG sources,
 * previews for the picker rows) and are registered with iOS via the
 * `expo-alternate-app-icons` config plugin in app.json.
 *
 * ⚠️ Optional-require ON PURPOSE, like lib/liveActivity.ts: this JS reaches
 * builds without the native module over the air (same runtimeVersion), and a
 * bare import would throw at load. On those builds `appIconsSupported` is
 * false and the Appearance row is hidden.
 *
 * iOS itself shows a system "changed the icon" alert on switch — that is
 * Apple's, not ours, and cannot be suppressed. The current selection is stored
 * by iOS (getAppIconName), so nothing is persisted app-side.
 */

type AlternateIconsModule = {
  supportsAlternateIcons: boolean;
  setAlternateAppIcon(name: string | null): Promise<string | null>;
  getAppIconName(): string | null;
};

let native: AlternateIconsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = require('expo-alternate-app-icons');
} catch {
  // Build without the module (pre-icon-picker builds, Expo Go) — row hidden.
}

/** Keys match the plugin's PascalCase icon names; null = the default icon. */
export type AppIconKey =
  | null | 'Dark' | 'Bright' | 'Shadow' | 'Ghost' | 'Mint'
  | 'Paper' | 'Ink' | 'InkWhite' | 'AccentWhite' | 'AccentPaper';

export const APP_ICON_OPTIONS: { key: AppIconKey; label: string; preview: number }[] = [
  { key: null,     label: t.appIcon.classic, preview: require('@/assets/app-icons/preview-classic.png') },
  { key: 'Dark',   label: t.appIcon.dark,    preview: require('@/assets/app-icons/preview-dark.png') },
  { key: 'Bright', label: t.appIcon.bright,  preview: require('@/assets/app-icons/preview-bright.png') },
  { key: 'Shadow', label: t.appIcon.shadow,  preview: require('@/assets/app-icons/preview-shadow.png') },
  { key: 'Ghost',  label: t.appIcon.ghost,   preview: require('@/assets/app-icons/preview-ghost.png') },
  { key: 'Mint',   label: t.appIcon.mint,    preview: require('@/assets/app-icons/preview-mint.png') },
  { key: 'Paper',  label: t.appIcon.paper,   preview: require('@/assets/app-icons/preview-paper.png') },
  { key: 'Ink',    label: t.appIcon.ink,     preview: require('@/assets/app-icons/preview-ink.png') },
  { key: 'InkWhite', label: t.appIcon.inkWhite, preview: require('@/assets/app-icons/preview-inkwhite.png') },
  { key: 'AccentWhite', label: t.appIcon.accentWhite, preview: require('@/assets/app-icons/preview-accentwhite.png') },
  { key: 'AccentPaper', label: t.appIcon.accentPaper, preview: require('@/assets/app-icons/preview-accentpaper.png') },
];

export const appIconsSupported: boolean = !!native?.supportsAlternateIcons;

export function currentAppIcon(): AppIconKey {
  try {
    return (native?.getAppIconName() ?? null) as AppIconKey;
  } catch {
    return null;
  }
}

export function appIconLabel(key: AppIconKey): string {
  return APP_ICON_OPTIONS.find(o => o.key === key)?.label ?? t.appIcon.classic;
}

export async function setAppIcon(key: AppIconKey): Promise<void> {
  try {
    await native?.setAlternateAppIcon(key);
  } catch {
    // Refusal (backgrounded, unsupported) — the picker re-reads the real value.
  }
}
