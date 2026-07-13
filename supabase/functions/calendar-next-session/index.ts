import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function getAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { clientFirstName, clientLastInitial } = await req.json();
    if (!clientFirstName) return json({ event: null });

    const accessToken = await getAccessToken();
    if (!accessToken) return json({ event: null });

    const now = new Date();
    const maxDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: maxDate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
      q: clientFirstName,
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!calRes.ok) return json({ event: null });

    const calData = await calRes.json();
    const events: any[] = calData.items ?? [];

    const firstName = clientFirstName.toLowerCase();
    const lastInitial = (clientLastInitial ?? "").toLowerCase();
    const patterns: string[] = [firstName];
    if (lastInitial) patterns.push(`${firstName} ${lastInitial}`);

    const matching = events.filter((e: any) => {
      const title = (e.summary ?? "").toLowerCase();
      return patterns.some((p) => title.includes(p));
    });

    if (matching.length === 0) return json({ event: null });

    const event = matching[0];
    const startAt: string = event.start?.dateTime ?? event.start?.date ?? "";
    return json({ event: { summary: event.summary, startAt } });
  } catch {
    return json({ event: null });
  }
});
