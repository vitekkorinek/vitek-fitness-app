// live-activity-push — the rest-end red flip for a LOCKED phone (Aug 2026).
// iOS never repaints a Live Activity at `staleDate`, so a locked phone keeps
// the white rest count-up until some opportunistic repaint. This function sends
// the APNs Live-Activity update at the exact second a rest ends, forcing that
// repaint. Driven by the `live-activity-rest-pushes` pg_cron job (every 5s, it
// only HTTP-posts when a `live_activity_rest_pushes` row is due within 7s);
// rows are written/deleted by the app (`lib/restActivityPush.ts`).
//
// Claim-then-send: due rows are DELETEd (returning) first, so overlapping cron
// runs can't double-send; a send failure after the claim is dropped — the same
// best-effort tradeoff as send-push, fine for a cosmetic repaint.
//
// APNs credentials: the raw .p8 signing key + key id live in Vault
// ('apns_key_p8' / 'apns_key_id'), read via the service-only RPC
// `get_service_secret`. Until they are set, this logs and no-ops.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY);

const TEAM_ID = 'SGZ83SR8YV';
const BUNDLE_ID = 'com.vitekfitness.trainer';
const APNS_TOPIC = `${BUNDLE_ID}.push-type.liveactivity`;

// Same three-shape service-role gate as send-push (legacy JWT key, the
// sb_secret_* key Supabase injects into edge function envs, own env key).
function isServiceRole(req: Request): boolean {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === SERVICE_KEY) return true;
  if (token.startsWith('sb_secret_')) return true;
  try {
    return JSON.parse(atob(token.split('.')[1])).role === 'service_role';
  } catch {
    return false;
  }
}

function b64url(input: Uint8Array | string): string {
  const bin = typeof input === 'string' ? input : String.fromCharCode(...input);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ES256 JWT for APNs, signed with the raw .p8 key. WebCrypto's ECDSA signature
// is already the JOSE r||s form APNs expects.
async function apnsJwt(pemKey: string, keyId: string): Promise<string> {
  const der = Uint8Array.from(
    atob(pemKey.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, '')),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const signingInput =
    b64url(JSON.stringify({ alg: 'ES256', kid: keyId })) + '.' +
    b64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${b64url(sig)}`;
}

async function sendApns(jwt: string, activityToken: string, contentState: unknown): Promise<string> {
  const body = JSON.stringify({
    aps: {
      timestamp: Math.floor(Date.now() / 1000),
      event: 'update',
      'content-state': contentState,
    },
  });
  const headers = {
    authorization: `bearer ${jwt}`,
    'apns-topic': APNS_TOPIC,
    'apns-push-type': 'liveactivity',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + 300),
  };
  let res = await fetch(`https://api.push.apple.com/3/device/${activityToken}`, { method: 'POST', headers, body });
  if (res.ok) return 'sent';
  const text = await res.text();
  // A dev-build (Xcode) activity registers a sandbox token — retry there once.
  if (res.status === 400 && text.includes('BadDeviceToken')) {
    res = await fetch(`https://api.sandbox.push.apple.com/3/device/${activityToken}`, { method: 'POST', headers, body });
    if (res.ok) return 'sent-sandbox';
    return `sandbox-${res.status}:${await res.text()}`;
  }
  return `${res.status}:${text}`;
}

Deno.serve(async (req: Request) => {
  if (!isServiceRole(req)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }

  // Claim everything due within the cron interval (+2s margin) — the exact
  // second is hit by the in-function wait below.
  const { data: rows, error } = await supabase
    .from('live_activity_rest_pushes')
    .delete()
    .lte('fire_at', new Date(Date.now() + 7000).toISOString())
    .select('activity_token, fire_at, content_state');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const [{ data: pem }, { data: keyId }] = await Promise.all([
    supabase.rpc('get_service_secret', { secret_name: 'apns_key_p8' }),
    supabase.rpc('get_service_secret', { secret_name: 'apns_key_id' }),
  ]);
  if (!pem || !keyId) {
    console.log('[live-activity-push] APNs key not configured — dropped', rows.length, 'row(s)');
    return new Response(JSON.stringify({ sent: 0, error: 'apns key not configured' }), { status: 200 });
  }

  let jwt: string;
  try {
    jwt = await apnsJwt(pem as string, keyId as string);
  } catch (e) {
    console.log('[live-activity-push] bad APNs key:', e);
    return new Response(JSON.stringify({ sent: 0, error: 'bad apns key' }), { status: 200 });
  }

  const results = await Promise.all(rows.map(async (row) => {
    const waitMs = new Date(row.fire_at as string).getTime() - Date.now();
    if (waitMs < -600_000) return 'stale'; // >10 min overdue (cron outage) — pointless now
    if (waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(waitMs, 8000)));
    try {
      return await sendApns(jwt, row.activity_token as string, row.content_state);
    } catch (e) {
      return `error:${e}`;
    }
  }));

  const sent = results.filter((r) => r === 'sent' || r === 'sent-sandbox').length;
  const failed = results.filter((r) => r !== 'sent' && r !== 'sent-sandbox');
  if (failed.length > 0) console.log('[live-activity-push] failures:', failed);
  return new Response(JSON.stringify({ sent, failed: failed.length, results }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
