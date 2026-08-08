import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import BodyMap from '@/components/BodyMap';
import {
  fetchMuscleScan, fetchVolumeTrend, MUSCLE_LABEL, PART_SLUGS,
  type BodyPart, type MuscleScan, type ScanPeriod, type VolumeTrend,
} from '@/lib/muscleVolume';

type Sel =
  | { kind: 'part'; part: BodyPart }
  | { kind: 'muscle'; slug: string }
  | null;

const ACCENT = '#24ac88';
const HEADER = '#244e43';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

// German grouping, matching Consistency's identical helper — these two lines sit
// on sibling screens and must format a weight the same way.
const fmtWeight = (kg: number): string => `${Math.round(kg).toLocaleString('de-DE')} kg`;

/**
 * Progress → Strength: the body is SCANNED and the muscles the client actually
 * trained light up, hottest first (Aug 7 2026).
 *
 * ⚠️ THIS is what the scan is for. The Progress landing used to run the same
 * animation and had it taken away on Vitek's own argument — a scan should mean a
 * reading is being TAKEN off the body, and on the landing nothing was measured.
 * Here it is: the line crosses the figure and each muscle lights at the moment
 * the line reaches it. If a second surface ever wants this animation, the
 * question to ask first is whether that surface is measuring anything.
 *
 * ⚠️ The body carries the HEAT, the list carries the NUMBERS — do not put the
 * numbers on the figure. Vitek's sketch had lines shooting off each muscle to a
 * label at the side; a live week lit 22 distinct muscles (9 body parts), and 22
 * leader lines around a 250pt figure is a medical diagram. Tapping a row lights
 * that one part on the body instead, which is the same connection made on demand
 * and costs no space. Leader lines for the top two or three are still open if the
 * list turns out to read as disconnected on device.
 */

// ─── Figure ──────────────────────────────────────────────────────────────────
// Grown from 0.62 (Aug 7 2026) because tapping a muscle was unreliable — Vitek:
// *"not responsive sometimes to the tap, i feel it a lot in the legs calves"*. An
// SVG path only registers a hit inside its exact outline, and a calf at the old
// size was a few points across. ⚠️ Two figures plus the gap have to stay inside the
// card's ~326pt of content: 2 × 144 + 22 = 310. Do not grow this further without
// re-checking that sum, or the back view clips.
const FIG_SCALE = 0.72;                    // BodyMap renders 200×400 at scale 1
const FIG_W = 200 * FIG_SCALE;             // 144
const FIG_H = 400 * FIG_SCALE;             // 288
const FIG_GAP = 22;

// ⚠️ TAPS GO THROUGH THESE RECTANGLES, NOT THROUGH THE SVG SHAPES (Aug 7 2026).
// A muscle path only registers a hit inside its exact outline, so at this size the
// finger keeps landing in the gaps between shapes — Vitek, twice: *"not responsive
// sometimes to the tap, i feel it a lot in the legs calves especially"*, then *"yes
// its still hard to tap"* after the figures were merely made bigger. Growing the
// drawing was never going to fix a hit area shaped like a calf.
//
// Boxes are percentages of the figure, deliberately coarser than the anatomy, and
// LATER entries win where they overlap (react-native draws siblings in order), so
// the more specific muscle is listed last. Do not reshape these to follow the
// silhouette — the whole point is that they do not.
type TapZone = { slug: string; left: string; top: string; width: string; height: string };

const FRONT_ZONES: TapZone[] = [
  { slug: 'deltoids',   left: '6%',  top: '16%', width: '26%', height: '12%' },
  { slug: 'deltoids',   left: '68%', top: '16%', width: '26%', height: '12%' },
  { slug: 'chest',      left: '30%', top: '19%', width: '40%', height: '13%' },
  { slug: 'biceps',     left: '9%',  top: '28%', width: '22%', height: '13%' },
  { slug: 'biceps',     left: '69%', top: '28%', width: '22%', height: '13%' },
  { slug: 'abs',        left: '33%', top: '32%', width: '34%', height: '16%' },
  { slug: 'forearm',    left: '3%',  top: '41%', width: '22%', height: '15%' },
  { slug: 'forearm',    left: '75%', top: '41%', width: '22%', height: '15%' },
  { slug: 'quadriceps', left: '25%', top: '55%', width: '25%', height: '24%' },
  { slug: 'quadriceps', left: '50%', top: '55%', width: '25%', height: '24%' },
  { slug: 'calves',     left: '27%', top: '79%', width: '21%', height: '18%' },
  { slug: 'calves',     left: '52%', top: '79%', width: '21%', height: '18%' },
];

const BACK_ZONES: TapZone[] = [
  { slug: 'deltoids',   left: '6%',  top: '16%', width: '26%', height: '12%' },
  { slug: 'deltoids',   left: '68%', top: '16%', width: '26%', height: '12%' },
  { slug: 'trapezius',  left: '32%', top: '15%', width: '36%', height: '13%' },
  { slug: 'triceps',    left: '9%',  top: '28%', width: '22%', height: '13%' },
  { slug: 'triceps',    left: '69%', top: '28%', width: '22%', height: '13%' },
  { slug: 'upper-back', left: '28%', top: '28%', width: '44%', height: '15%' },
  { slug: 'lower-back', left: '34%', top: '43%', width: '32%', height: '8%' },
  { slug: 'forearm',    left: '3%',  top: '41%', width: '22%', height: '15%' },
  { slug: 'forearm',    left: '75%', top: '41%', width: '22%', height: '15%' },
  { slug: 'gluteal',    left: '29%', top: '51%', width: '42%', height: '10%' },
  { slug: 'hamstring',  left: '25%', top: '61%', width: '25%', height: '18%' },
  { slug: 'hamstring',  left: '50%', top: '61%', width: '25%', height: '18%' },
  { slug: 'calves',     left: '27%', top: '79%', width: '21%', height: '18%' },
  { slug: 'calves',     left: '52%', top: '79%', width: '21%', height: '18%' },
];
// The line starts clear of the crown and ends clear of the feet.
// ⚠️ Same rule the landing hub learned on device: a sweep that stops level with
// the feet leaves them lit — Vitek, "like shoes haha".
const LINE_PAD = 26;

const SCAN_MS = 1150;
const SCAN_DELAY = 120;

// Five heat steps, coldest → hottest, landing on ACCENT. Deliberately all in the
// brand green: amber and red already mean bonus and danger everywhere else in the
// app, so a hot-cold ramp through them would be saying something it doesn't mean.
const HEAT_RAMP = ['#cfeae1', '#a5dcc9', '#72c9ab', '#45b795', ACCENT];

// One step past the ramp, for a muscle the reader tapped that has NO work in the
// window. Reusing the app's existing red (the imbalance dots) rather than a new
// hue. It is only ever reachable by tapping, so nothing on the resting card is red.
const MISSING = '#ef4444';
const MISSING_LEVEL = HEAT_RAMP.length + 1;
const RAMP_WITH_MISSING = [...HEAT_RAMP, MISSING];

export default function MuscleScanCard({ clientId }: { clientId: string }) {
  const [period, setPeriod] = useState<ScanPeriod>('week');
  const [scan, setScan] = useState<MuscleScan | null>(null);
  const [loading, setLoading] = useState(true);
  // What the reader has asked about: a body part (tapped its row) or one muscle
  // (tapped it on the figure). Both answer in the same place — the strip above the
  // figures — so the answer always appears where the eyes already are.
  const [sel, setSel] = useState<Sel>(null);
  // How the weight moved compares with the same span of the period before.
  const [trend, setTrend] = useState<VolumeTrend | null>(null);

  // How far down the figure the scan has reached, 0..1. Starts "finished" so a
  // re-render before the animation runs never shows a half-lit body.
  const [revealY, setRevealY] = useState(1);
  const sweep = useRef(new Animated.Value(1)).current;
  const crossedRef = useRef(0);
  // The numbers below the figures — held back until the sweep has finished. See
  // the note in `runScan`.
  const listAnim = useRef(new Animated.Value(1)).current;

  // ── Data ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSel(null);
    setTrend(null);
    fetchMuscleScan(clientId, period)
      .then(result => { if (!cancelled) { setScan(result); setLoading(false); } })
      .catch(() => { if (!cancelled) { setScan(null); setLoading(false); } });
    // ⚠️ Its own request, deliberately NOT folded into the scan's. Sets and weight
    // are different questions — the scan asks WHAT was trained, this asks how HARD
    // — and they come off different RPCs. A failure here must leave the card
    // working, so it fails to null and the line simply does not appear.
    fetchVolumeTrend(clientId, period)
      .then(v => { if (!cancelled) setTrend(v); })
      .catch(() => { if (!cancelled) setTrend(null); });
    return () => { cancelled = true; };
  }, [clientId, period]);

  // ── The sweep ──────────────────────────────────────────────────────────────
  // The line is native-driven; the muscles are not, because "lit" is a change of
  // WHICH regions BodyMap renders, not of any style on them. A listener on the
  // same value keeps the two exactly in step, and state is only set when a muscle
  // actually crosses — for a typical week that is ~8 renders over the whole sweep,
  // not one per frame.
  const thresholds = useMemo(
    () => [...new Set((scan?.regions ?? []).map(r => r.y))].sort((a, b) => a - b),
    [scan],
  );

  const runScan = useCallback(() => {
    if (!thresholds.length) { listAnim.setValue(1); return; }
    crossedRef.current = 0;
    setRevealY(-1);
    sweep.setValue(0);
    listAnim.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: SCAN_MS,
      delay: SCAN_DELAY,
      easing: Easing.bezier(0.35, 0, 0.25, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setRevealY(1);
      // ⚠️ THE NUMBERS ARRIVE AFTER THE SCAN, NOT WITH IT (Aug 8 2026). They used
      // to render the instant the data landed, so the list was already sitting
      // there while the line was still crossing the chest — the card appeared to
      // report its findings before it had taken them. Vitek: *"the scan happen
      // slightly after the values appear under it, can we have first scan and then
      // the values? makes more sense"*. The list is MOUNTED the whole time at
      // opacity 0, so the card is its full height from the start and nothing jumps
      // when it fades in — do not swap this for conditional rendering.
      Animated.timing(listAnim, {
        toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }).start();
    });
  }, [sweep, listAnim, thresholds]);

  useEffect(() => {
    const id = sweep.addListener(({ value }) => {
      // Value 0..1 spans crown-minus-pad → feet-plus-pad; convert to a fraction of
      // the FIGURE so it can be compared against each muscle's own y.
      const figY = (value * (FIG_H + LINE_PAD * 2) - LINE_PAD) / FIG_H;
      let crossed = 0;
      while (crossed < thresholds.length && thresholds[crossed] <= figY) crossed++;
      if (crossed !== crossedRef.current) {
        crossedRef.current = crossed;
        setRevealY(figY);
      }
    });
    return () => sweep.removeListener(id);
  }, [sweep, thresholds]);

  // ⚠️ Plays ONCE per loaded window, and nothing re-triggers it by hand. Tapping
  // the figure used to replay it — Vitek, Aug 7: "tapping on the silhouette it
  // makes scan again which is weird, once is enough in this scenario". The tap on
  // the body now selects the muscle under it, same as tapping its row. Switching
  // Week/Month reloads, which is a genuinely new reading and does scan again.
  useEffect(() => { if (scan && thresholds.length) runScan(); }, [scan, thresholds, runScan]);

  // Which body part a lit muscle belongs to — used only to highlight the matching
  // row when a muscle is tapped, so the tap and the list stay visibly connected.
  const partBySlug = useMemo(() => {
    const m = new Map<string, BodyPart>();
    for (const r of scan?.regions ?? []) if (!m.has(r.slug)) m.set(r.slug, r.part);
    return m;
  }, [scan]);

  // ⚠️ A tap on the body answers about the MUSCLE, not its body part. Vitek, Aug 7:
  // *"if i click on core and it wasnt worked or calfves btw! it should say not
  // trained"*. Calves sits inside Legs, which was the hottest part of his week —
  // answering at part level would have said "Legs · 39 sets" for a muscle that got
  // nothing at all. Muscles the body draws but nobody trains (head, hands, feet)
  // have no label and are ignored, so tapping them does not clear the reader's
  // selection by accident.
  // ⚠️ A SECOND TAP ON THE SAME MUSCLE DOES NOTHING — it does not toggle back to
  // the baseline (Aug 8 2026). Tapping a muscle is asking a question about it, and
  // asking twice should not undo the answer; the old toggle meant a mis-registered
  // second tap silently threw you back to the whole-body view. Vitek: *"typing on
  // it again doesnt do anything just stay as is, and typing outside of the
  // silhouette lights up the baseline again"*. Clearing is a deliberate tap on
  // empty space around the figures — see the backdrop `Pressable` below.
  const onPressMuscle = useCallback((slug: string) => {
    if (!MUSCLE_LABEL[slug]) return;
    setSel({ kind: 'muscle', slug });
  }, []);

  const onPressRow = useCallback((part: BodyPart) => {
    setSel(prev => (prev?.kind === 'part' && prev.part === part ? null : { kind: 'part', part }));
  }, []);

  // The row to highlight: the one tapped, or the one owning the tapped muscle.
  const activePart: BodyPart | null =
    sel?.kind === 'part' ? sel.part
      : sel?.kind === 'muscle' ? partBySlug.get(sel.slug) ?? null
      : null;

  // ── What the body shows ────────────────────────────────────────────────────
  const regions = useMemo(() => {
    if (!scan) return [];
    // A selection answers "where is that" — so it shows the subject ALONE, rather
    // than re-tinting a body already carrying nine claims.
    // ⚠️ IT KEEPS ITS OWN HEAT. It used to be forced to `HEAT_RAMP.length`, so a
    // barely-trained muscle jumped to full accent the moment you tapped it — the
    // tap appeared to answer "how much" and answered it wrongly. Every colour on
    // this body is functional (five heat steps, plus red for never-trained), and
    // selecting must not overwrite the one thing the muscle was telling you. Same
    // rule Vitek set for the limb view's amber/red, applied to the whole ramp:
    // *"keep the color that shows when selecting certain body part"*.
    // The selection reads because everything ELSE goes dark, not because the
    // subject changes.
    if (sel?.kind === 'part') {
      const hit = scan.regions.filter(r => r.part === sel.part);
      if (hit.length === 0) return PART_SLUGS[sel.part].map(slug => ({ slug, intensity: MISSING_LEVEL }));
      return hit;
    }
    if (sel?.kind === 'muscle') {
      const hit = scan.regions.filter(r => r.slug === sel.slug);
      // Nothing lit there = never trained in this window. Paint it RED and say so.
      // ⚠️ Red means "missing" ONLY on this card and only while a muscle is
      // selected — everywhere else in the app red is danger. Vitek asked for it
      // outright: the grey "Not trained" line at the foot of the list *"is not
      // noticible"*, and a muscle you tapped going silently dark says nothing.
      if (hit.length === 0) return [{ slug: sel.slug, intensity: MISSING_LEVEL }];
      return hit;
    }
    return scan.regions.filter(r => r.y <= revealY);
  }, [scan, sel, revealY]);

  // ── What the strip above the figures says ──────────────────────────────────
  const readout = useMemo((): { text: string; missing: boolean } | null => {
    if (!scan || !sel) return null;
    if (sel.kind === 'muscle') {
      const label = MUSCLE_LABEL[sel.slug] ?? sel.slug;
      const m = scan.muscles.get(sel.slug);
      if (!m || (m.sets === 0 && m.assistSets === 0)) {
        return { text: `${label} — not trained ${period === 'week' ? 'this week' : 'this month'}`, missing: true };
      }
      if (m.sets === 0) return { text: `${label} · ${m.assistSets} ${m.assistSets === 1 ? 'set' : 'sets'} helping`, missing: false };
      return { text: `${label} · ${m.sets} ${m.sets === 1 ? 'set' : 'sets'} · ${m.sessions}×`, missing: false };
    }
    const p = scan.parts.find(x => x.part === sel.part);
    if (!p) return null;
    if (p.sets === 0 && p.assistSets === 0) {
      return { text: `${p.part} — not trained ${period === 'week' ? 'this week' : 'this month'}`, missing: true };
    }
    if (p.sets === 0) return { text: `${p.part} · ${p.assistSets} ${p.assistSets === 1 ? 'set' : 'sets'} helping`, missing: false };
    return { text: `${p.part} · ${p.sets} ${p.sets === 1 ? 'set' : 'sets'} · ${p.sessions}×`, missing: false };
  }, [scan, sel, period]);

  const lineY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-LINE_PAD, FIG_H + LINE_PAD],
  });
  const lineOpacity = sweep.interpolate({
    inputRange: [0, 0.03, 0.93, 1],
    outputRange: [0, 1, 1, 0],
  });

  const hasWork = !!scan && scan.trained.length > 0;

  // Picks the strongest statement that is TRUE, exactly as Consistency's insight
  // does. ±3% is the dead band — below that, "about the same" is the honest answer
  // and a 1% swing dressed up as progress teaches the client to ignore the line.
  const volumeLine = useMemo((): { text: string; good: boolean } | null => {
    if (!trend || trend.current <= 0) return null;
    const last = period === 'week' ? 'this time last week' : 'this time last month';
    if (trend.pct == null) return { text: `${fmtWeight(trend.current)} moved so far`, good: true };
    if (trend.pct >= 3)  return { text: `${trend.pct}% more weight than ${last}`, good: true };
    if (trend.pct <= -3) return { text: `${Math.abs(trend.pct)}% less weight than ${last}`, good: false };
    return { text: `About the same weight as ${last}`, good: true };
  }, [trend, period]);

  return (
    <View style={s.card}>
      {/* ── Period ── */}
      <View style={s.head}>
        <Text style={s.title}>What you trained</Text>
        <View style={s.switcher}>
          {(['week', 'month'] as ScanPeriod[]).map(p => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={[s.switchItem, period === p && s.switchItemActive]}
            >
              <Text style={[s.switchText, period === p && s.switchTextActive]}>
                {p === 'week' ? 'Week' : 'Month'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={s.range}>
        {period === 'week' ? 'This week' : 'This month'}
        {scan && scan.sessions > 0 ? ` · ${scan.sessions} ${scan.sessions === 1 ? 'session' : 'sessions'} · ${scan.totalSets} sets` : ''}
      </Text>

      {/* ── How hard, against the period before ──
          The card said WHAT was trained and never whether it was going anywhere;
          Vitek asked for Consistency's comparison here too (*"how much more percent
          they lift, if there is progress, per week and per month in comparison to
          the previous week or month"*). Same sentence shape as Consistency's
          insight line, so the two screens speak with one voice.
          ⚠️ "this time last week" is not padding — the comparison is clipped to the
          same number of days elapsed (see `previousPeriodRange`), and the phrase is
          what makes that honest rather than hidden. */}
      {volumeLine && (
        <View style={s.trend}>
          <SymbolView
            name={volumeLine.good ? 'arrow.up.right' : 'arrow.down.right'}
            size={13}
            tintColor={volumeLine.good ? ACCENT : MUTED}
          />
          <Text style={[s.trendText, !volumeLine.good && { color: MUTED }]}>{volumeLine.text}</Text>
        </View>
      )}

      {/* ── The answer strip ──
          Always occupies its row so nothing below it jumps when a muscle is
          tapped, and sits ABOVE the figures so the answer lands where the finger
          already is — not at the foot of the list, which is where the old grey
          "Not trained" line was and why it went unread. */}
      <View style={s.readoutRow}>
        {readout
          ? (
            <View style={[s.readout, readout.missing && s.readoutMissing]}>
              <Text style={[s.readoutText, readout.missing && s.readoutTextMissing]} numberOfLines={1}>
                {readout.text}
              </Text>
            </View>
          )
          : hasWork
            ? <Text style={s.readoutHint}>Tap a muscle for detail</Text>
            : null}
      </View>

      {/* ── The figures ──
          The container itself is the "clear" target: a tap anywhere around the
          bodies — the margins, the gap between them, the empty corners of a figure
          box — returns to the baseline, which is the only way back now that a
          second tap on a muscle no longer toggles. The muscle zones are children,
          and RN gives the deepest view the responder first, so a tap ON a muscle
          still selects it and never reaches this. */}
      <Pressable style={s.figures} onPress={() => setSel(null)}>
        <View style={s.figRow}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: FIG_W, height: FIG_H }}>
              <BodyMap side="front" scale={FIG_SCALE} regions={regions} colors={RAMP_WITH_MISSING} />
              {FRONT_ZONES.map((z, i) => (
                <Pressable
                  key={`f${i}`}
                  onPress={() => onPressMuscle(z.slug)}
                  style={{ position: 'absolute', left: z.left, top: z.top, width: z.width, height: z.height } as any}
                />
              ))}
            </View>
            <Text style={s.figLabel}>FRONT</Text>
          </View>
          <View style={{ width: FIG_GAP }} />
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: FIG_W, height: FIG_H }}>
              <BodyMap side="back" scale={FIG_SCALE} regions={regions} colors={RAMP_WITH_MISSING} />
              {BACK_ZONES.map((z, i) => (
                <Pressable
                  key={`b${i}`}
                  onPress={() => onPressMuscle(z.slug)}
                  style={{ position: 'absolute', left: z.left, top: z.top, width: z.width, height: z.height } as any}
                />
              ))}
            </View>
            <Text style={s.figLabel}>BACK</Text>
          </View>
        </View>

        {/* One line across BOTH bodies — two lines would read as two scans. */}
        {!sel && (
          <Animated.View
            pointerEvents="none"
            style={[s.line, { opacity: lineOpacity, transform: [{ translateY: lineY }] }]}
          />
        )}
      </Pressable>

      {loading && <ActivityIndicator color={ACCENT} style={{ marginTop: 4 }} />}

      {!loading && !hasWork && (
        <Text style={s.empty}>
          {period === 'week' ? 'Nothing logged this week yet.' : 'Nothing logged this month yet.'}
        </Text>
      )}

      {/* ── The numbers ── (held at opacity 0 until the sweep finishes) */}
      {!loading && hasWork && scan && (
        <Animated.View
          style={[
            s.list,
            {
              opacity: listAnim,
              transform: [{ translateY: listAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
            },
          ]}
        >
          {scan.trained.map(p => {
            const isSel = activePart === p.part;
            const width = scan.maxSets > 0 ? Math.max(0.04, p.sets / scan.maxSets) : 0;
            return (
              <Pressable
                key={p.part}
                onPress={() => onPressRow(p.part)}
                style={[s.row, isSel && s.rowActive]}
              >
                <Text style={[s.rowName, isSel && s.rowNameActive]} numberOfLines={1}>{p.part}</Text>
                <View style={s.barTrack}>
                  <View
                    style={[
                      s.barFill,
                      {
                        width: `${width * 100}%`,
                        backgroundColor: HEAT_RAMP[Math.max(1, p.heat) - 1],
                      },
                    ]}
                  />
                </View>
                <Text style={s.rowVal} numberOfLines={1}>
                  {p.sets > 0
                    ? `${p.sets} ${p.sets === 1 ? 'set' : 'sets'} · ${p.sessions}×`
                    : `${p.assistSets} ${p.assistSets === 1 ? 'set' : 'sets'} helping`}
                </Text>
              </Pressable>
            );
          })}

          {/* Each name is tappable — tapping "Core" here does the same as tapping
              the abs on the figure, which is how Vitek reached for it. */}
          {scan.untrained.length > 0 && (
            <Text style={s.untrained}>
              <Text style={s.untrainedLead}>Not trained: </Text>
              {scan.untrained.map((p, i) => (
                <Text key={p.part} onPress={() => onPressRow(p.part)}>
                  {i > 0 ? ' · ' : ''}
                  <Text style={activePart === p.part ? s.untrainedActive : undefined}>{p.part}</Text>
                </Text>
              ))}
            </Text>
          )}

          {/* "assist" was jargon — Vitek asked what it meant, which means every
              client would too. Say it once, in words, and only when it applies. */}
          {scan.trained.some(p => p.sets === 0 && p.assistSets > 0) && (
            <Text style={s.note}>
              <Text style={s.untrainedLead}>Helping </Text>
              means the muscle worked but wasn’t the main target — like triceps during a bench press.
            </Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '700', color: TEXT },

  // Type 1 segmented switcher.
  switcher: { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  switchItem: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 100 },
  switchItemActive: { backgroundColor: '#fff' },
  switchText: { fontSize: 12, fontWeight: '600', color: '#6b6b66' },
  switchTextActive: { color: TEXT },

  // Centred (Aug 8 2026): left-aligned it hung off the edge under a title row that
  // is itself split left/right, reading as a stray caption rather than the card's
  // subtitle — *"the this week 3 session 45 sets infor is a bit strange on the side
  // written can it be centered"*. The trend line below shares the centre line.
  range: { fontSize: 12, color: MUTED, marginTop: 6, textAlign: 'center' },
  trend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  trendText: { fontSize: 13, fontWeight: '600', color: ACCENT },

  readoutRow: { height: 28, marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  readout: { paddingHorizontal: 13, paddingVertical: 5, borderRadius: 100, backgroundColor: '#eef6f3', maxWidth: '100%' },
  readoutMissing: { backgroundColor: '#fdeceb' },
  readoutText: { fontSize: 12.5, fontWeight: '700', color: HEADER },
  readoutTextMissing: { color: '#c0392f' },
  readoutHint: { fontSize: 11.5, color: '#c4c4c4' },

  figures: { alignItems: 'center', marginTop: 4 },
  figRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  figLabel: {
    fontSize: 9, fontWeight: '700', color: '#bbb',
    letterSpacing: 0.8, marginTop: 2,
  },
  line: {
    position: 'absolute', top: 0,
    left: -6, right: -6, height: 2.5,
    borderRadius: 2, backgroundColor: ACCENT,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 7,
  },

  empty: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 12 },

  list: { marginTop: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10,
  },
  rowActive: { backgroundColor: '#eef6f3' },
  rowName: { fontSize: 13, fontWeight: '600', color: TEXT, width: 74 },
  rowNameActive: { color: HEADER },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#f0f0ee', overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4 },
  rowVal: { fontSize: 11, color: MUTED, width: 86, textAlign: 'right' },

  untrained: { fontSize: 11.5, color: '#aaa', marginTop: 10, paddingHorizontal: 8, lineHeight: 17 },
  untrainedLead: { fontWeight: '700', color: '#999' },
  untrainedActive: { fontWeight: '700', color: '#c0392f' },
  note: { fontSize: 11.5, color: '#aaa', marginTop: 6, paddingHorizontal: 8, lineHeight: 17 },
});
