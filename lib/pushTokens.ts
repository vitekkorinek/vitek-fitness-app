import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';

/**
 * Expo push token registration (Phase 4 notifications, Aug 2026).
 *
 * `registerPushToken` runs once per signed-in user per app run — called from an
 * AuthContext effect on `profile?.id`, OFF the auth callback stack (an awaited
 * query inside onAuthStateChange wedges the auth lock — see CLAUDE-infra.md).
 * It asks for notification permission on first run (the same permission the
 * rest-over notification uses, so whichever comes first shows the ONE iOS
 * dialog) and upserts the device token into `push_tokens`.
 *
 * `unregisterPushToken` removes the row on sign-out — one phone runs both
 * Vitek's trainer account and a client account, and a push for account A must
 * not reach the phone while account B is signed in. Must run BEFORE
 * `auth.signOut()` (the delete needs the authenticated client for RLS).
 */
let registered: { userId: string; token: string } | null = null;

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (registered?.userId === userId) return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;
    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: 'ios', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );
    registered = { userId, token };
  } catch {
    // Expo Go / no permission / offline — next launch tries again.
  }
}

export async function unregisterPushToken(): Promise<void> {
  const reg = registered;
  registered = null;
  if (!reg) return;
  try {
    await supabase.from('push_tokens').delete().eq('user_id', reg.userId).eq('token', reg.token);
  } catch {
    // Offline sign-out — the row stays; a dead token is pruned by send-push
    // when Expo reports DeviceNotRegistered.
  }
}
