import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import BodyMap from '@/components/BodyMap';

const ACCENT = '#24ac88';
const HEADER = '#244e43';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const CHIP_BG = '#e9efec';

/**
 * Body composition, client side: the body is SCANNED and its readings come off it
 * (Aug 7 2026, Vitek's design).
 *
 * ⚠️ THE SCAN IS EARNED HERE, which is the whole reason the Progress landing lost
 * it. These numbers come off a Tanita — the body genuinely was scanned — so the
 * animation is describing something true. Same test before adding it anywhere new.
 *
 * ⚠️ THE READINGS RING THE BODY, THEY ARE NOT PLACED ON IT. Weight, water,
 * visceral fat and BMR are not located anywhere — a badge beside the left arm
 * reading "BMR 1650" is a lie about geography. Only fat and muscle have a limb
 * breakdown, and that lives further down the screen, on the figure, where it is
 * true. Do not "improve" this by anchoring these to body parts.
 *
 * ⚠️ Tapping a badge does NOT open a screen or a popup — it selects, and the
 * existing graph for that metric appears underneath, HEADERLESS: the badge already
 * carries the name, the number and the zone word, so repeating them in the card
 * was pure duplication (Vitek: *"clicking on the badge is enough we dont have to
 * repeat the same thing in the graph"*). A popup was considered and rejected —
 * those charts have drag-to-scrub tooltips, and a scrubbing gesture inside a glass
 * popup inside a ScrollView is the combination that already forced `onScrollLock`
 * onto the Progress screen.
 */

const FIG_SCALE = 0.5;
const FIG_W = 200 * FIG_SCALE;   // 100
const FIG_H = 400 * FIG_SCALE;   // 200
const LINE_PAD = 20;

const SCAN_MS = 1000;
const SCAN_DELAY = 140;
const BADGE = 62;

// Where down the sweep each thing comes off the body. The stats pill is at the
// top because it is the reading you take first, standing on a scale.
const AT_PILL = 0.04;
const AT_ROW = [0.32, 0.64];
const AT_CENTRE = 0.9;

export type RingItem = {
  key: string;
  label: string;
  /** Already formatted, or '—' when there is nothing recorded. */
  value: string;
  unit: string;
  zone?: string | null;
};

export default function BodyCompRing({
  items, active, onSelect, weight, height, weightActive, onSelectWeight, onEditStats,
}: {
  /** Exactly five, in slot order: left-top, right-top, left-bottom, right-bottom,
   *  centre-below. */
  items: RingItem[];
  active: string;
  onSelect: (key: string) => void;
  /** Formatted, e.g. '77 kg' / '178 cm', or '—'. */
  weight: string;
  height: string;
  weightActive: boolean;
  onSelectWeight: () => void;
  /** Client only — opens weight + height for editing. The trainer has the full
   *  add form and never needs this. */
  onEditStats?: () => void;
}) {
  const sweep = useRef(new Animated.Value(0)).current;
  const pill = useRef(new Animated.Value(0)).current;
  const badges = useRef(items.map(() => new Animated.Value(0))).current;

  const run = useCallback(() => {
    sweep.setValue(0);
    pill.setValue(0);
    badges.forEach(b => b.setValue(0));
    Animated.timing(sweep, {
      toValue: 1, duration: SCAN_MS, delay: SCAN_DELAY,
      easing: Easing.bezier(0.35, 0, 0.25, 1), useNativeDriver: true,
    }).start();

    const at = (i: number) => (i === 4 ? AT_CENTRE : AT_ROW[Math.floor(i / 2)] + (i % 2) * 0.04);
    Animated.parallel([
      Animated.timing(pill, {
        toValue: 1, duration: 560, delay: SCAN_DELAY + SCAN_MS * AT_PILL,
        easing: Easing.bezier(0.2, 1.2, 0.4, 1), useNativeDriver: true,
      }),
      ...badges.map((b, i) =>
        Animated.timing(b, {
          toValue: 1, duration: 620, delay: SCAN_DELAY + SCAN_MS * at(i),
          easing: Easing.bezier(0.2, 1.2, 0.4, 1), useNativeDriver: true,
        }),
      ),
    ]).start();
  }, [sweep, pill, badges]);

  // Once per mount. Nothing re-triggers it by hand — same rule as the Strength
  // scan, where replaying on tap read as a glitch.
  useEffect(() => { run(); }, [run]);

  const lineY = sweep.interpolate({ inputRange: [0, 1], outputRange: [-LINE_PAD, FIG_H + LINE_PAD] });
  const lineOpacity = sweep.interpolate({ inputRange: [0, 0.04, 0.92, 1], outputRange: [0, 1, 1, 0] });

  const bloom = (anim: Animated.Value, dx: number) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
    transform: [
      // Comes off the body: starts toward the figure and settles outward.
      { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
    ],
  });

  const slot = (i: number, dx: number) => {
    const item = items[i];
    if (!item) return <View style={{ height: BADGE + 26 }} />;
    return (
      <Animated.View style={bloom(badges[i], dx)}>
        <Badge item={item} active={item.key === active} onPress={() => onSelect(item.key)} />
      </Animated.View>
    );
  };

  return (
    <View style={s.wrap}>
      {/* Weight + height — the client's OWN two numbers, and the only ones they can
          change. Wider than a badge because it carries two readings, and it sits
          above the body rather than beside it: it is what you know before any scan.
          ⚠️ Tapping it SELECTS weight like any badge; the pencil is what edits. Two
          jobs, two targets — the old full-width "Log today's weight" button did the
          editing and ate a whole row doing it (*"takes a lot of space"*). */}
      <Animated.View style={bloom(pill, 0)}>
        <View style={[s.pill, weightActive && s.pillActive]}>
          <Pressable onPress={onSelectWeight} style={s.pillMain} hitSlop={6}>
            <Text style={[s.pillValue, weightActive && s.pillValueActive]}>{weight}</Text>
            <Text style={[s.pillDot, weightActive && s.pillDotActive]}>·</Text>
            <Text style={[s.pillValue, weightActive && s.pillValueActive]}>{height}</Text>
          </Pressable>
          {onEditStats && (
            <Pressable onPress={onEditStats} hitSlop={10} style={s.pillEdit}>
              <SymbolView name="pencil" size={15} tintColor={weightActive ? '#fff' : ACCENT} />
            </Pressable>
          )}
        </View>
      </Animated.View>

      <View style={s.row}>
        <View style={s.col}>{slot(0, 30)}{slot(2, 30)}</View>
        <View style={s.figWrap}>
          <BodyMap side="front" scale={FIG_SCALE} regions={[]} />
          <Animated.View
            pointerEvents="none"
            style={[s.line, { opacity: lineOpacity, transform: [{ translateY: lineY }] }]}
          />
        </View>
        <View style={s.col}>{slot(1, -30)}{slot(3, -30)}</View>
      </View>

      <View style={s.centreSlot}>{slot(4, 0)}</View>
    </View>
  );
}

function Badge({ item, active, onPress }: { item: RingItem; active: boolean; onPress: () => void }) {
  const empty = item.value === '—';
  return (
    <Pressable onPress={onPress} style={s.badgeWrap}>
      <View style={[s.badge, active && s.badgeActive]}>
        <Text style={[s.value, active && s.valueActive, empty && s.valueEmpty]} numberOfLines={1}>
          {item.value}
        </Text>
        {!empty && !!item.unit && (
          <Text style={[s.unit, active && s.unitActive]} numberOfLines={1}>{item.unit}</Text>
        )}
      </View>
      <Text style={[s.label, active && s.labelActive]} numberOfLines={1}>{item.label}</Text>
      {!!item.zone && <Text style={s.zone} numberOfLines={1}>{item.zone}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  col: { alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  figWrap: { width: FIG_W, marginHorizontal: 10 },
  centreSlot: { marginTop: 2 },

  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CHIP_BG, borderRadius: 100,
    borderWidth: 1.5, borderColor: 'rgba(36,172,136,0.22)',
    paddingLeft: 18, paddingRight: 6, paddingVertical: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  pillActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  pillMain: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  pillValue: { fontSize: 15, fontWeight: '800', color: HEADER },
  pillValueActive: { color: '#fff' },
  pillDot: { fontSize: 15, color: MUTED },
  pillDotActive: { color: 'rgba(255,255,255,0.6)' },
  pillEdit: { paddingHorizontal: 10, paddingVertical: 4, marginLeft: 4 },

  line: {
    position: 'absolute', top: 0, left: -10, right: -10, height: 2.5,
    borderRadius: 2, backgroundColor: ACCENT,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 7,
  },

  badgeWrap: { alignItems: 'center', width: 96 },
  badge: {
    width: BADGE, height: BADGE, borderRadius: BADGE / 2,
    backgroundColor: CHIP_BG,
    borderWidth: 1.5, borderColor: 'rgba(36,172,136,0.22)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  badgeActive: { backgroundColor: ACCENT, borderColor: ACCENT },

  value: { fontSize: 16, fontWeight: '800', color: HEADER },
  valueActive: { color: '#fff' },
  valueEmpty: { color: '#c3ccc8' },
  unit: { fontSize: 9.5, fontWeight: '700', color: MUTED, marginTop: -1 },
  unitActive: { color: 'rgba(255,255,255,0.85)' },

  label: { fontSize: 10.5, fontWeight: '700', color: TEXT, marginTop: 6, letterSpacing: 0.3 },
  labelActive: { color: HEADER },
  zone: { fontSize: 9.5, color: MUTED, marginTop: 1 },
});
