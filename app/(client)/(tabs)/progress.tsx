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

// ─── ScanHub — the body gets scanned, the readings fly off it ────────────────
// The Library's centre object opens; this one is scanned. The rule both obey is
// the same, and it is the one three rejected versions of the book got wrong:
// NOTHING FADES IN FROM NOWHERE. A reading exists at the instant it detaches
// from the body, at the point on the body it was taken from.
//
// ⚠️ The lit band must travel CLEAR OF THE SILHOUETTE at both ends. Stopping it
// level with the feet leaves them lit for as long as the figure is on screen —
// Vitek, on the mockup: "the scan finished at his feet so they stay light green,
// like shoes haha". It starts a full band-height above the crown and ends a full
// band-height below the feet, so at rest it is off the body in both directions
// and needs no opacity animation of its own.
//
// Deliberately 2D — translate + scale + opacity only. None of the rotateY /
// perspective / coplanar-flicker traps that cost nine device rounds on the book
// can occur here, because no layer is ever 3D-transformed.

const FIG_SCALE = 0.50;                    // BodyMap renders 200×400 at scale 1
const FIG_W = 200 * FIG_SCALE;             // 100
const FIG_H = 400 * FIG_SCALE;             // 200
const BAND_H = 30;                         // the lit strip the scan line drags

// Where each reading comes off the body, as a fraction of the figure's height.
// Crown, hands, feet — which is also the order the scan reaches them, so the
// folders arrive in priority order for free.
const ANCHOR_Y = { crown: 0.04, hands: 0.63, feet: 0.97 } as const;
const HAND_DX = FIG_W * 0.33;              // hands hang this far off centre
const FOOT_DX = FIG_W * 0.11;

// Fraction of the sweep at which the line reaches each anchor. The band travels
// -BAND_H → FIG_H + BAND_H, so the crossing point is offset by one band height.
const crossAt = (fy: number) => (fy * FIG_H + BAND_H) / (FIG_H + BAND_H * 2);

const SWEEP_MS  = 700;
const SWEEP_DELAY = 180;
const FLIGHT_MS = 820;
const PAIR_STAGGER = 45;

function ScanHub({ anim, onPress }: { anim: Animated.Value; onPress: () => void }) {
  // The window that reveals the accent copy, and its counter-translate so the
  // body inside it stays registered with the body underneath.
  const bandY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAND_H, FIG_H + BAND_H],
  });
  const lineY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAND_H / 2, FIG_H + BAND_H / 2],
  });

  return (
    <Pressable onPress={onPress} style={{ width: FIG_W, height: FIG_H }}>
      {/* base body */}
      <BodyMap side="front" scale={FIG_SCALE} regions={[]} />

      {/* the strip the scan is crossing, lit */}
      <Animated.View
        pointerEvents="none"
        style={[sc.band, { transform: [{ translateY: bandY }] }]}
      >
        <Animated.View style={{ transform: [{ translateY: Animated.multiply(bandY, -1) }] }}>
          <BodyMap side="front" scale={FIG_SCALE} regions={[]} baseFill={ACCENT} />
        </Animated.View>
      </Animated.View>

      {/* the scan line — visible only while it is actually crossing the body */}
      <Animated.View
        pointerEvents="none"
        style={[
          sc.line,
          {
            opacity: anim.interpolate({
              inputRange: [0, 0.04, 0.9, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [{ translateY: lineY }],
          },
        ]}
      />
    </Pressable>
  );
}

const sc = StyleSheet.create({
  band: {
    position: 'absolute', left: 0, top: 0,
    width: FIG_W, height: BAND_H,
    overflow: 'hidden',
  },
  line: {
    position: 'absolute', top: 0,
    left: -22, right: -22, height: 2.5,
    borderRadius: 2, backgroundColor: ACCENT,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 7, elevation: 0,
  },
});

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
  // `anim` is the shared 0→1 sweep clock; the ring lives in the window that
  // starts when the line reaches this anchor.
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

// ─── Folders not built yet ───────────────────────────────────────────────────
// Honest empty states, not "coming soon" wallpaper: each says what it will hold
// so the pentagon reads as a complete map of the tab from day one.

function EmptyFolder({ symbolName, title, body }: { symbolName: any; title: string; body: string }) {
  return (
    <View style={ef.wrap}>
      <View style={ef.mark}>
        <SymbolView name={symbolName} size={40} tintColor="rgba(36,78,67,0.30)" />
      </View>
      <Text style={ef.title}>{title}</Text>
      <Text style={ef.body}>{body}</Text>
    </View>
  );
}

const ef = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 34, paddingTop: 40 },
  mark: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: CHIP_BG,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 8, textAlign: 'center' },
  body:  { fontSize: 14, lineHeight: 21, color: MUTED, textAlign: 'center' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  const [view, setView] = useState<ViewState>('landing');

  const [hubOpen, setHubOpen] = useState(false);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const chipAnims = useRef(FOLDER_KEYS.map(() => new Animated.Value(0))).current;

  // Same pentagon as the Library, stretched vertically: the book is wide and
  // short, a standing body is narrow and tall, so the top and bottom rows need
  // more clearance than the sides do.
  // ⚠️ hubW is the CONTENT width, so the landing's contentContainer must carry the
  // matching `paddingHorizontal: 16`. Without it the container is full-bleed while
  // every position is computed against width-32, and the whole hub sits 16pt left
  // of centre — which is exactly how it shipped in the first OTA.
  const hubW = Dimensions.get('window').width - 32;
  // Content spans -221 → +211 around the centre, so the block is 450 tall and the
  // hub sits at 230 to put that span in the middle of it.
  const HUB_BLOCK_H = 450;
  const hubCy = 230;
  const orbit = useMemo(() => {
    const sideX = Math.min(126, hubW / 2 - 58);
    return {
      composition:  { x: 0,       y: -186, w: 190 },
      strength:     { x: -sideX,  y: -58,  w: 112 },
      measurements: { x: sideX,   y: -58,  w: 112 },
      // Pushed out and down from the Library's ring: the figure grew to 200 tall,
      // and the bottom pair is the only one a standing body reaches toward.
      comparison:   { x: -90,     y: 138,  w: 112 },
      consistency:  { x: 90,      y: 138,  w: 112 },
    } as Record<Folder, { x: number; y: number; w: number }>;
  }, [hubW]);

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
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: SWEEP_MS,
        delay: SWEEP_DELAY,
        easing: Easing.bezier(0.42, 0, 0.30, 1),
        useNativeDriver: true,
      }).start();
      // Each reading sets off when the line actually reaches its anchor, so the
      // sweep and the flights are one event rather than two that happen to overlap.
      const fly = (i: number, fy: number, pair: 0 | 1) =>
        Animated.timing(chipAnims[i], {
          toValue: 1,
          duration: FLIGHT_MS,
          delay: SWEEP_DELAY + SWEEP_MS * crossAt(fy) + pair * PAIR_STAGGER,
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
      // Closing: readings go back into the body first, then the scan resets under
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
        Animated.timing(scanAnim, { toValue: 0, duration: 1, useNativeDriver: true }),
      ]).start();
    }
  }, [scanAnim, chipAnims]);

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
        scanAnim.setValue(0);
        chipAnims.forEach(a => a.setValue(0));
      };
    }, [animateHub, scanAnim, chipAnims])
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

      {/* ── Landing: the body is scanned, the readings fly off it ── */}
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
          <View style={{ height: HUB_BLOCK_H }}>
            {/* The figure is rendered FIRST so every reading draws ABOVE it — a
                reading has to come off the front of the body, not out from behind. */}
            <View style={{ position: 'absolute', left: hubW / 2 - FIG_W / 2, top: hubCy - FIG_H / 2 }}>
              <ScanHub anim={scanAnim} onPress={toggleHub} />
            </View>

            {FOLDER_KEYS.map(k => (
              <Pulse
                key={`p-${k}`}
                anim={scanAnim}
                x={hubW / 2 + anchor[k].x}
                y={hubCy + anchor[k].y}
                delay={crossAt(
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
        <ScrollView contentContainerStyle={{ paddingTop: headerH + 16, paddingBottom: tabBarH + 32 }}>
          <EmptyFolder
            symbolName="photo.on.rectangle.angled"
            title="No photos yet"
            body="Your own progress photos, front, side and back, so you can see the change the scale doesn't show. Private to you — Vitek sees nothing unless you share it."
          />
        </ScrollView>
      )}
      {view === 'consistency' && (
        <ScrollView contentContainerStyle={{ paddingTop: headerH + 16, paddingBottom: tabBarH + 32 }}>
          <EmptyFolder
            symbolName="chart.bar.fill"
            title="Coming next"
            body="Every session you've done, your current streak, and how you're tracking against your weekly goal — the part of progress that's always in your hands."
          />
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
