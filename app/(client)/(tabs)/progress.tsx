import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { smartBack } from '@/lib/navHistory';
import { VFIcon } from '@/components/VFIcon';
import BodyMap from '@/components/BodyMap';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import ProgressTab from '@/app/(trainer)/client/[id]/progress-tab';
import TapeMeasurementsTab from '@/components/TapeMeasurementsTab';
import ComparisonTab from '@/components/ComparisonTab';
import ConsistencyTab from '@/components/ConsistencyTab';

const BG     = '#faf9f7';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

// One brand colour for every reading, same rule the Library badges follow —
// navigation stays green, colour belongs to the data inside each folder.
const CHIP_BG   = '#e9efec';
const CHIP_ICON = HEADER;

type Folder = 'composition' | 'strength' | 'measurements' | 'comparison' | 'consistency';
type ViewState = 'landing' | Folder;

const FOLDER_KEYS: Folder[] = ['composition', 'strength', 'measurements', 'comparison', 'consistency'];

const FOLDER_TITLE: Record<Folder, string> = {
  composition:  'Body composition',
  strength:     'Strength',
  measurements: 'Measurements',
  comparison:   'Comparison',
  consistency:  'Consistency',
};

// ─── BodyHub — the body stands, the readings bloom off it ───────────────────
// The Library's centre object opens; this one simply gives its readings up. The
// rule both obey is the one three rejected versions of the book got wrong:
// NOTHING FADES IN FROM NOWHERE. A reading exists at the instant it detaches
// from the body, at the point on the body it was taken from.
//
// ⚠️ THE LANDING DOES NOT SCAN, AND MUST NOT (Aug 7 2026). It did until now — a
// line swept the figure and lit the strip it crossed — and the animation was
// liked. It came out anyway, on Vitek's own argument: a scan should mean a
// reading is being TAKEN, and nothing is measured here. The scan belongs to the
// Strength folder, where the body is genuinely being read for what was trained.
// Spend it here and it stops meaning anything there. What is left is the part
// that was always carrying the idea: five pulse rings leaving the body in order,
// each with its badge. Deleted, not disabled — the lit-band copy of the figure
// and the glowing line are gone, along with `BodyMap`'s `baseFill` being needed.
//
// ⚠️ AND IT MUST NOT SPIN. Proposed in the same breath as dropping the scan; two
// reasons it is worse. BodyMap is two FLAT SVGs (front and back), so a "spin" can
// only ever be a front→back flip — and that flip is the mechanic Strength needs
// to show the posterior chain, so spending it here costs the same thing the scan
// did. Second, this whole hub is deliberately 2D — translate + scale + opacity
// only — so none of the rotateY / perspective / coplanar-flicker traps that cost
// nine device rounds on the book can occur. A spin buys every one of them back.

// ── How big the body can be, and what actually decides it ───────────────────
// ⚠️ IT IS THE SIDE BADGES' TEXT THAT CAPS THE FIGURE — never the badge circles,
// and never the screen. "Measurements" and "Arms · waist · thighs" are ~105 wide,
// so at `sideX` 122.5 their inner edge is only ~70 off centre, while the figure's
// widest point by far is the SPLAYED FINGERS (0.45·FIG_W, against 0.26 at the
// chest). Those labels sat at exactly hand height, which is what pinned the body
// at 100 wide through two rounds of "make it bigger".
// The fix (Aug 8 2026) was to move the side pair UP to flank the shoulders rather
// than to shave the body: their text now lands beside the chest, where the body is
// barely half as wide, and the arms have the whole latitude to themselves.
// Landmarks measured off the artwork, as fractions of the rendered box — use these
// rather than eyeballing, and re-derive the ring from them if the figure changes.
const CROWN_FY = -0.433;                   // top of the head, above box centre
const FEET_FY  =  0.426;                   // bottom of the feet, below box centre
// The splayed hands — the band no side badge may enter, top and bottom. This is
// THE constraint on the whole ring: everything on the left and right is placed
// relative to it, either above it or below it.
const HAND_TOP_FY = -0.045;
const HAND_BOT_FY =  0.080;

const FIG_W = 170;                         // BodyMap's artwork is 200×400
const FIG_H = FIG_W * 2;
const FIG_SCALE = FIG_W / 200;

// Vertical extent of a badge's own text below its centre: circle (35) + label +
// sub-line. Every clearance below is measured against this, so a font change is
// the one thing that can invalidate the ring.
const CHIP_TEXT_H = 79;

// Where each reading comes off the body, as a fraction of the figure's height.
// Crown, hands, feet — which is also the order they bloom, so the folders arrive
// in priority order for free.
const ANCHOR_Y = { crown: 0.04, hands: 0.63, feet: 0.97 } as const;
const HAND_DX = FIG_W * 0.33;              // hands hang this far off centre
const FOOT_DX = FIG_W * 0.11;

// Lead-in / lead-out on the bloom clock, in figure pixels: the crown must not
// fire on frame 0 nor the feet on the last frame. Carried over UNCHANGED from the
// scan band's height, which is where this rhythm was tuned on device — the line
// is gone, the cadence it produced is not, and that cadence is the part Vitek
// liked. Do not "simplify" this to a bare `fy`; it snaps both ends flat.
// ⚠️ Held as a FRACTION of the figure (it was 30 when the figure was 200 tall) so
// resizing the body leaves the cadence exactly where it was tuned — a fixed 30
// silently shortens the lead-in as the figure grows.
const BLOOM_PAD = FIG_H * 0.15;
const bloomAt = (fy: number) => (fy * FIG_H + BLOOM_PAD) / (FIG_H + BLOOM_PAD * 2);

const BLOOM_MS = 700;
const BLOOM_DELAY = 180;
const FLIGHT_MS = 820;
const PAIR_STAGGER = 45;

function BodyHub({ onPress }: { onPress: () => void }) {
  // Nothing animated left on the figure itself: it stands, and the readings leave
  // it. The tap target is the whole figure, which is what re-plays the bloom.
  return (
    <Pressable onPress={onPress} style={{ width: FIG_W, height: FIG_H }}>
      <BodyMap side="front" scale={FIG_SCALE} regions={[]} />
    </Pressable>
  );
}

// ─── ReadingChip — a measurement taken off the body ──────────────────────────
// The Library's badge is PAGE-shaped because it is literally a page of the book.
// This one is a ROUND badge, because what it comes out of is a round pulse on the
// body — Vitek, Aug 6: "maybe we dont have to have cards/pages like with library,
// it can be rounded badges - that could go good with the rounded impulses coming
// out of the body". The faint accent ring is that pulse, stopped: the ring that
// expands off the body is the same ring the badge lands wearing.
// Deliberately NOT a rounded square with tick marks — that was the page-rule
// analogue and it reads as a card, which is the thing the Library already owns.

const CHIP_D = 70;                         // diameter — smaller than the Library's
                                           // page (78×94), which is what lets the
                                           // figure grow without the ring closing in

function ReadingChip({
  title, sub, symbolName, onPress, anim, delta, open, left, top, width, spin,
}: {
  title: string;
  sub: string;
  symbolName: any;
  onPress: () => void;
  anim: Animated.Value;
  delta: { dx: number; dy: number };
  open: boolean;
  left: number;
  top: number;
  width: number;
  spin: number;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(press, { toValue: 0.94, useNativeDriver: true, speed: 30 }).start();
  const onPressOut = () => Animated.spring(press, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        // Visible almost immediately — a reading is taken OFF the body, so it has
        // to exist at the anchor rather than appear somewhere along the way.
        opacity: anim.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [delta.dx, 0] }) },
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [delta.dy, 0] }) },
          { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: [`${spin}deg`, '0deg'] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] }) },
        ],
      }}
    >
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: press }] }}>
        <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={{ alignItems: 'center' }}>
          <View style={hub.chip}>
            <SymbolView name={symbolName} size={30} tintColor={CHIP_ICON} />
          </View>
          <Text style={hub.label} numberOfLines={2}>{title}</Text>
          <Text style={hub.count} numberOfLines={1}>{sub}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// The ring left behind at the point a reading came off — the beat that says
// "this was taken from here" rather than "this flew past here".
function Pulse({ anim, x, y, delay }: { anim: Animated.Value; x: number; y: number; delay: number }) {
  // `anim` is the shared 0→1 bloom clock; the ring lives in the window that
  // starts when this anchor's turn comes round.
  // ⚠️ Clamped INSIDE (0,1): an interpolation inputRange must be strictly
  // increasing, and the feet anchor sits late enough that an unclamped
  // `start + 0.22` lands exactly on 1 and duplicates the final stop, which
  // throws at render time rather than just looking wrong.
  const start = Math.min(0.98, Math.max(0.01, delay));
  const end = Math.min(0.99, start + 0.22);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        hub.pulse,
        {
          left: x - 8, top: y - 8,
          opacity: anim.interpolate({
            inputRange: [0, start, end, 1],
            outputRange: [0, 0.9, 0, 0],
          }),
          transform: [{
            // Ends at ~64pt across, just under the badge's 70 — so the ring the
            // body throws off is the ring the badge arrives wearing.
            scale: anim.interpolate({
              inputRange: [0, start, end, 1],
              outputRange: [0.4, 0.4, 4, 4],
            }),
          }],
        },
      ]}
    />
  );
}

const hub = StyleSheet.create({
  chip: {
    width: CHIP_D, height: CHIP_D, borderRadius: CHIP_D / 2,
    backgroundColor: CHIP_BG,
    // The stopped pulse — same accent ring, at rest.
    borderWidth: 1.5, borderColor: 'rgba(36,172,136,0.22)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  label: { fontSize: 13.5, fontWeight: '600', color: TEXT, marginTop: 9, textAlign: 'center' },
  count: { fontSize: 12, color: MUTED, marginTop: 1, textAlign: 'center' },
  pulse: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: ACCENT,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  const [view, setView] = useState<ViewState>('landing');
  // Frozen while a chart gesture is in flight (Comparison's slider, Consistency's
  // month/year swipe) — a JS PanResponder cannot stop a native ScrollView alone.
  const [cmpLocked, setCmpLocked] = useState(false);

  const [hubOpen, setHubOpen] = useState(false);
  const bloomAnim = useRef(new Animated.Value(0)).current;
  const chipAnims = useRef(FOLDER_KEYS.map(() => new Animated.Value(0))).current;

  // Same pentagon as the Library, stretched vertically: the book is wide and
  // short, a standing body is narrow and tall, so the top and bottom rows need
  // more clearance than the sides do.
  // ⚠️ hubW is the CONTENT width, so the landing's contentContainer must carry the
  // matching `paddingHorizontal: 16`. Without it the container is full-bleed while
  // every position is computed against width-32, and the whole hub sits 16pt left
  // of centre — which is exactly how it shipped in the first OTA.
  const hubW = Dimensions.get('window').width - 32;
  // ⚠️ The ring is DERIVED from the body's landmarks, not hand-placed. Every slot
  // below is "clear of <this part of the body> by <this much air>", so growing the
  // figure again moves the badges with it instead of quietly landing one on the
  // hair or the fingers. Do not replace these with the numbers they happen to
  // evaluate to today.
  const ring = useMemo(() => {
    // The one badge with no horizontal offset to save it: it hangs its two lines
    // straight down onto the crown.
    const compY = CROWN_FY * FIG_H - 14 - CHIP_TEXT_H;
    // ⚠️ THE SIDE PAIR IS AT ITS FLOOR — its long sub-line now ends just 6 above
    // the fingertips, and its left edge already overlaps them horizontally, so the
    // gap is the ONLY thing keeping them apart. Vitek asked twice to bring it down
    // (Aug 8 2026: first *"put strenght and measurements down"* — refused, then
    // *"one tic lower"* — this, and it spent the clearance). There is nothing left
    // here: anything lower needs the labels moved off the hands' latitude, not a
    // smaller number. Pinned to the TOP of the hand band so it tracks the fingers
    // if the figure is ever resized.
    const sideY = HAND_TOP_FY * FIG_H - 6 - CHIP_TEXT_H;
    // The bottom pair, though, had ~160 of dead side space above it, because it was
    // parked below the FEET when nothing required that. Its words are short
    // ("Comparison", "Your photos"), the shins are the narrowest the body gets, and
    // its readings still fly from the feet — so it only has to clear the BOTTOM of
    // the hand band. Raised 68 (Aug 8 2026) to close the hole Vitek spotted between
    // the two pairs, then let back down 14 on his *"one tic lower"*: circle beside
    // the thighs, text beside the ankles. This one has room to spare in both
    // directions — the block simply grows — so it is the knob to reach for.
    const botY = HAND_BOT_FY * FIG_H + 44 + 35;
    return { compY, sideY, botY };
  }, []);

  const HUB_BLOCK_H = Math.round(-ring.compY + 35 + ring.botY + CHIP_TEXT_H);
  const hubCy = Math.round(-ring.compY + 35);
  const orbit = useMemo(() => {
    const sideX = Math.min(126, hubW / 2 - 58);
    return {
      composition:  { x: 0,       y: ring.compY, w: 190 },
      strength:     { x: -sideX,  y: ring.sideY, w: 112 },
      measurements: { x: sideX,   y: ring.sideY, w: 112 },
      comparison:   { x: -96,     y: ring.botY,  w: 112 },
      consistency:  { x: 96,      y: ring.botY,  w: 112 },
    } as Record<Folder, { x: number; y: number; w: number }>;
  }, [hubW, ring]);

  // Anchors on the body, in hub coordinates (centre of the figure = hub centre).
  const anchor = useMemo(() => {
    const top = -FIG_H / 2;
    return {
      composition:  { x: 0,         y: top + ANCHOR_Y.crown * FIG_H },
      strength:     { x: -HAND_DX,  y: top + ANCHOR_Y.hands * FIG_H },
      measurements: { x: HAND_DX,   y: top + ANCHOR_Y.hands * FIG_H },
      comparison:   { x: -FOOT_DX,  y: top + ANCHOR_Y.feet  * FIG_H },
      consistency:  { x: FOOT_DX,   y: top + ANCHOR_Y.feet  * FIG_H },
    } as Record<Folder, { x: number; y: number }>;
  }, []);

  const placement = (k: Folder) => {
    const o = orbit[k];
    const a = anchor[k];
    return {
      left: hubW / 2 + o.x - o.w / 2,
      top: hubCy + o.y - CHIP_D / 2,
      width: o.w,
      // The chip collapses to its own anchor on the body, NOT to the hub centre
      // (which is what the Library does, because a page belongs to the gutter).
      delta: { dx: a.x - o.x, dy: a.y - o.y },
      spin: o.x < 0 ? -14 : o.x > 0 ? 14 : -8,
    };
  };

  const animateHub = useCallback((to: 0 | 1) => {
    setHubOpen(to === 1);
    if (to === 1) {
      // The clock the pulses run on. It no longer moves anything ON the body —
      // it is what staggers the rings crown → hands → feet.
      Animated.timing(bloomAnim, {
        toValue: 1,
        duration: BLOOM_MS,
        delay: BLOOM_DELAY,
        easing: Easing.bezier(0.42, 0, 0.30, 1),
        useNativeDriver: true,
      }).start();
      // Each reading sets off exactly when its own ring leaves the body, so the
      // pulse and the flight are one event rather than two that happen to overlap.
      const fly = (i: number, fy: number, pair: 0 | 1) =>
        Animated.timing(chipAnims[i], {
          toValue: 1,
          duration: FLIGHT_MS,
          delay: BLOOM_DELAY + BLOOM_MS * bloomAt(fy) + pair * PAIR_STAGGER,
          // The settle from the mock — each reading overshoots its spot a little
          // and eases back, rather than arriving and stopping dead.
          easing: Easing.bezier(0.2, 1.25, 0.4, 1),
          useNativeDriver: true,
        });
      Animated.parallel([
        fly(0, ANCHOR_Y.crown, 0),
        fly(1, ANCHOR_Y.hands, 0),
        fly(2, ANCHOR_Y.hands, 1),
        fly(3, ANCHOR_Y.feet,  0),
        fly(4, ANCHOR_Y.feet,  1),
      ]).start();
    } else {
      // Closing: readings go back into the body first, then the clock resets under
      // them. No bounce on the way in — a reading wobbling as it lands back in the
      // body reads wrong, same reason the book's pages come home without one.
      Animated.stagger(
        38,
        [...chipAnims].reverse().map(a =>
          Animated.spring(a, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 })
        )
      ).start();
      Animated.sequence([
        Animated.delay(260),
        Animated.timing(bloomAnim, { toValue: 0, duration: 1, useNativeDriver: true }),
      ]).start();
    }
  }, [bloomAnim, chipAnims]);

  const toggleHub = () => animateHub(hubOpen ? 0 : 1);

  // Opens on its own when the tab lands; the tap on the figure only shuts and
  // reopens it. Blur resets — Progress is a persistent native tab, so without the
  // reset it would stay open forever and never play again.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => animateHub(1), 180);
      return () => {
        clearTimeout(timer);
        setHubOpen(false);
        bloomAnim.setValue(0);
        chipAnims.forEach(a => a.setValue(0));
      };
    }, [animateHub, bloomAnim, chipAnims])
  );

  const clientId = profile?.id ?? '';
  const title = view === 'landing' ? 'Progress' : FOLDER_TITLE[view];

  const header = (
    <LightHeader
      left={
        <HeaderIcon onPress={() => (view === 'landing' ? smartBack(router) : setView('landing'))}>
          <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
        </HeaderIcon>
      }
      title={title}
      right={
        <HeaderIcon onPress={() => router.navigate('/(client)' as any)}>
          <VFIcon size={26} color={HEADER_ICON} />
        </HeaderIcon>
      }
    />
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {/* ── Landing: the body stands, the readings bloom off it ── */}
      {view === 'landing' && (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            // flexGrow + centre so the hub sits in the MIDDLE of what is left
            // between the header and the tab bar, rather than hanging off the top
            // with all the slack below it.
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingTop: headerH + 16,
            paddingBottom: tabBarH + 16,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ⚠️ The lift is OPTICAL, and the block is already geometrically centred
              — do not "fix" it back. The badges are airy circles and the body is a
              solid dark mass, so the hub's visual weight sits below its measured
              middle and a true centre reads as sagging (Vitek, Aug 8 2026: *"maybe
              is centered but it needs to be higher visually a bit"*).
              ⚠️ It is DOUBLED because centring splits the margin: the block rises by
              half of whatever is put here. */}
          <View style={{ height: HUB_BLOCK_H, marginBottom: 68 }}>
            {/* The figure is rendered FIRST so every reading draws ABOVE it — a
                reading has to come off the front of the body, not out from behind. */}
            <View style={{ position: 'absolute', left: hubW / 2 - FIG_W / 2, top: hubCy - FIG_H / 2 }}>
              <BodyHub onPress={toggleHub} />
            </View>

            {FOLDER_KEYS.map(k => (
              <Pulse
                key={`p-${k}`}
                anim={bloomAnim}
                x={hubW / 2 + anchor[k].x}
                y={hubCy + anchor[k].y}
                delay={bloomAt(
                  k === 'composition' ? ANCHOR_Y.crown
                    : k === 'strength' || k === 'measurements' ? ANCHOR_Y.hands
                    : ANCHOR_Y.feet
                )}
              />
            ))}

            <ReadingChip
              title="Body composition"
              sub="Weight · fat · muscle"
              symbolName="figure.stand"
              onPress={() => setView('composition')}
              anim={chipAnims[0]}
              open={hubOpen}
              {...placement('composition')}
            />
            <ReadingChip
              title="Strength"
              sub="Lifts over time"
              symbolName="dumbbell.fill"
              onPress={() => setView('strength')}
              anim={chipAnims[1]}
              open={hubOpen}
              {...placement('strength')}
            />
            <ReadingChip
              title="Measurements"
              sub="Arms · waist · thighs"
              symbolName="ruler.fill"
              onPress={() => setView('measurements')}
              anim={chipAnims[2]}
              open={hubOpen}
              {...placement('measurements')}
            />
            <ReadingChip
              title="Comparison"
              sub="Your photos"
              symbolName="photo.on.rectangle.angled"
              onPress={() => setView('comparison')}
              anim={chipAnims[3]}
              open={hubOpen}
              {...placement('comparison')}
            />
            <ReadingChip
              title="Consistency"
              sub="Showing up"
              symbolName="chart.bar.fill"
              onPress={() => setView('consistency')}
              anim={chipAnims[4]}
              open={hubOpen}
              {...placement('consistency')}
            />
          </View>
        </ScrollView>
      )}

      {/* ── Body composition + Strength: what already exists ── */}
      {(view === 'composition' || view === 'strength') && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: headerH + 8, paddingBottom: tabBarH + 32 }}
          showsVerticalScrollIndicator={false}
          scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
        >
          <ProgressTab
            clientId={clientId}
            client={profile}
            embeddedTab={view === 'composition' ? 'measurements' : 'strength'}
          />
        </ScrollView>
      )}

      {/* ── The three not built yet ── */}
      {view === 'measurements' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: headerH + 8, paddingBottom: tabBarH + 32 }}
          showsVerticalScrollIndicator={false}
          scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
        >
          <TapeMeasurementsTab clientId={clientId} viewerId={clientId} />
        </ScrollView>
      )}
      {view === 'comparison' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: headerH + 8, paddingBottom: tabBarH + 32 }}
          showsVerticalScrollIndicator={false}
          scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
          scrollEnabled={!cmpLocked}
        >
          <ComparisonTab clientId={clientId} onScrollLock={setCmpLocked} />
        </ScrollView>
      )}
      {view === 'consistency' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: headerH + 8, paddingBottom: tabBarH + 32 }}
          showsVerticalScrollIndicator={false}
          scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
          scrollEnabled={!cmpLocked}
        >
          <ConsistencyTab clientId={clientId} onScrollLock={setCmpLocked} />
        </ScrollView>
      )}

      {/* Header last so it overlays the scroll. */}
      {header}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
});
