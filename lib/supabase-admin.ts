import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const serviceRoleKey  = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!;

// Uses the service role key — bypasses RLS and can manage auth users.
// Only import this in trainer-only screens. Never use in client-facing code.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
