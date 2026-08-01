// ─── EquipmentPopup — drawn equipment icons + the "what's used" glass popup ───
// Aug 1 2026 (Vitek: "as the third pill it could be what is used for it and
// clicking on it it would show it visually"). Do Mode's expanded card gets an
// equipment-info pill beside the bar/brand selector chip; tapping it opens this
// centered Liquid Glass popup listing everything the exercise uses — main
// implement first, then extras/attachments — each with a drawn line icon.
// Icons are our own SVG line drawings (react-native-svg), NOT photos: real
// photos of gym equipment are impossible to source consistently and clash with
// the illustrated-anatomy direction for exercise media (CLAUDE.md §4). One icon
// per known EQUIPMENT_OPTIONS / ATTACHMENT_OPTIONS entry; custom equipment
// falls back to a generic tag icon.
// Mirrors MusclePopup (components/MuscleThumb.tsx) — the sibling popup in the
// same meta row: fade Modal, 0.45 overlay, radius-38 shadow wrapper + GlassPanel.
import React from 'react';
import { View, StyleSheet, Modal, TouchableWithoutFeedback, Text } from 'react-native';
import Svg, { Path, Circle, Line, Rect, Ellipse, G } from 'react-native-svg';
import GlassPanel from './GlassPanel';
import en from '../i18n/en';

// ─── EquipmentIcon ────────────────────────────────────────────────────────────
// Minimal geometric line icons on a 24×24 viewBox, stroke-only, round caps.
// `strokeWidth` is in viewBox units — bump it (~2.3) when rendering small
// (the 13px pill icon), keep ~1.6 at popup size so the drawings stay light.

export function EquipmentIcon({
  name,
  size = 24,
  color = '#244e43',
  strokeWidth = 1.7,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const p = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  // Collapse inner whitespace too, so 'Dumbbell/Kettlebell' and
  // 'Dumbbell  /  Kettlebell' land on the same glyph as the canonical option.
  const key = name.trim().toLowerCase().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ');
  let icon: React.ReactNode;
  switch (key) {
    case 'barbell':
      icon = (
        <>
          <Line x1={2.2} y1={12} x2={3.4} y2={12} {...p} />
          <Line x1={20.6} y1={12} x2={21.8} y2={12} {...p} />
          <Rect x={3.4} y={9.2} width={1.9} height={5.6} rx={0.95} {...p} />
          <Rect x={18.7} y={9.2} width={1.9} height={5.6} rx={0.95} {...p} />
          <Rect x={6} y={7} width={2.4} height={10} rx={1.2} {...p} />
          <Rect x={15.6} y={7} width={2.4} height={10} rx={1.2} {...p} />
          <Line x1={8.6} y1={12} x2={15.4} y2={12} {...p} />
        </>
      );
      break;
    case 'z bar':
      icon = (
        <>
          <Line x1={2.2} y1={12} x2={3.4} y2={12} {...p} />
          <Line x1={20.6} y1={12} x2={21.8} y2={12} {...p} />
          <Rect x={3.4} y={9.2} width={1.9} height={5.6} rx={0.95} {...p} />
          <Rect x={18.7} y={9.2} width={1.9} height={5.6} rx={0.95} {...p} />
          <Rect x={6} y={7} width={2.4} height={10} rx={1.2} {...p} />
          <Rect x={15.6} y={7} width={2.4} height={10} rx={1.2} {...p} />
          <Path d="M8.6 12 C9.8 9.8 10.6 14.2 12 12 C13.4 9.8 14.2 14.2 15.4 12" {...p} />
        </>
      );
      break;
    case 'dumbbell':
      icon = (
        <>
          <Rect x={4.4} y={9.6} width={1.7} height={4.8} rx={0.85} {...p} />
          <Rect x={17.9} y={9.6} width={1.7} height={4.8} rx={0.85} {...p} />
          <Rect x={6.6} y={8} width={2.6} height={8} rx={1.2} {...p} />
          <Rect x={14.8} y={8} width={2.6} height={8} rx={1.2} {...p} />
          <Line x1={9.4} y1={12} x2={14.6} y2={12} {...p} />
        </>
      );
      break;
    case 'kettlebell':
      icon = (
        <>
          <Circle cx={12} cy={14.2} r={5.3} {...p} />
          <Path d="M8.9 10.4 C7.4 6.6 9.5 4.6 12 4.6 C14.5 4.6 16.6 6.6 15.1 10.4" {...p} />
        </>
      );
      break;
    // Either implement works for this exercise — a compact dumbbell beside a
    // kettlebell, both optically centred on y≈12.5 so neither looks dropped.
    case 'dumbbell / kettlebell':
      icon = (
        <>
          <Rect x={1.5} y={9.7} width={2.1} height={5.6} rx={1.05} {...p} />
          <Rect x={8.2} y={9.7} width={2.1} height={5.6} rx={1.05} {...p} />
          <Line x1={3.6} y1={12.5} x2={8.2} y2={12.5} {...p} />
          <Circle cx={17.8} cy={14.4} r={3.8} {...p} />
          <Path d="M15.6 11.7 C14.5 9 16 7.5 17.8 7.5 C19.6 7.5 21.1 9 20 11.7" {...p} />
        </>
      );
      break;
    // Selectorized machine — the weight STACK (cable head on top, plates below).
    // The other two machine kinds deliberately look nothing like it.
    case 'machine':
      icon = (
        <>
          <Line x1={12} y1={2.8} x2={12} y2={6} {...p} />
          <Rect x={7} y={6} width={10} height={13} rx={1.6} {...p} />
          <Line x1={7} y1={9.3} x2={17} y2={9.3} {...p} />
          <Line x1={7} y1={12.6} x2={17} y2={12.6} {...p} />
          <Line x1={7} y1={15.9} x2={17} y2={15.9} {...p} />
        </>
      );
      break;
    // Smith — a loaded bar running on two vertical rails, standing on a base.
    case 'smith machine':
      icon = (
        <>
          <Line x1={4.6} y1={3.4} x2={4.6} y2={20.6} {...p} />
          <Line x1={19.4} y1={3.4} x2={19.4} y2={20.6} {...p} />
          <Line x1={3} y1={20.6} x2={21} y2={20.6} {...p} />
          <Line x1={4.6} y1={10.5} x2={19.4} y2={10.5} {...p} />
          <Rect x={7.6} y={7.7} width={2.1} height={5.6} rx={1.05} {...p} />
          <Rect x={14.3} y={7.7} width={2.1} height={5.6} rx={1.05} {...p} />
        </>
      );
      break;
    // Plate-loaded — a frame with a horn you slide a round plate onto. The big
    // disc is the whole read, so it survives the 17px collapsed-card size.
    case 'plate loaded machine':
      icon = (
        <>
          <Line x1={4.6} y1={4} x2={4.6} y2={20.2} {...p} />
          <Line x1={2.8} y1={20.2} x2={10.4} y2={20.2} {...p} />
          <Line x1={4.6} y1={11.8} x2={11.4} y2={11.8} {...p} />
          <Circle cx={15.8} cy={11.8} r={4.4} {...p} />
          <Circle cx={15.8} cy={11.8} r={1.5} {...p} />
        </>
      );
      break;
    case 'bodyweight':
      icon = (
        <>
          <Circle cx={12} cy={4.6} r={2.1} {...p} />
          <Line x1={12} y1={7} x2={12} y2={13.2} {...p} />
          <Path d="M7 11.4 L12 8.6 L17 11.4" {...p} />
          <Path d="M8.6 19.4 L12 13.2 L15.4 19.4" {...p} />
        </>
      );
      break;
    case 'cable':
      // Glyph recentered in the viewBox (Aug 1 — it hung from y=2.4 and ended
      // at 17, so beside text it floated visibly high; Vitek flagged it).
      icon = (
        <>
          <Line x1={12} y1={4.9} x2={12} y2={6.1} {...p} />
          <Circle cx={12} cy={8.9} r={2.8} {...p} />
          <Line x1={14.8} y1={8.9} x2={14.8} y2={19.5} {...p} />
          <Line x1={12.5} y1={19.5} x2={17.1} y2={19.5} {...p} />
        </>
      );
      break;
    case 'resistance band':
      icon = (
        <G rotation={-28} origin="12, 12">
          <Ellipse cx={12} cy={12} rx={8.2} ry={4.6} {...p} />
        </G>
      );
      break;
    // Redrawn Aug 2026 — the first version was four bare sticks with two dashes
    // for handles and read as nothing in particular. Now it has the two parts
    // that actually say TRX: an anchor loop at the top and two foam grips at
    // the bottom, joined by the Y of the strap.
    case 'trx':
      icon = (
        <>
          <Circle cx={12} cy={3.7} r={1.5} {...p} />
          <Line x1={12} y1={5.2} x2={12} y2={8.6} {...p} />
          <Line x1={12} y1={8.6} x2={7.8} y2={16.6} {...p} />
          <Line x1={12} y1={8.6} x2={16.2} y2={16.6} {...p} />
          <Rect x={5} y={16.6} width={5.6} height={2.8} rx={1.4} {...p} />
          <Rect x={13.4} y={16.6} width={5.6} height={2.8} rx={1.4} {...p} />
        </>
      );
      break;
    case 'wide bar':
      icon = (
        <>
          <Path d="M3 16.5 C4.2 13.7 7.4 12.7 12 12.7 C16.6 12.7 19.8 13.7 21 16.5" {...p} />
          <Line x1={12} y1={12.7} x2={12} y2={10.1} {...p} />
          <Circle cx={12} cy={8.7} r={1.5} {...p} />
        </>
      );
      break;
    case 'straight bar':
      icon = (
        <>
          <Line x1={4.4} y1={13.6} x2={19.6} y2={13.6} {...p} />
          <Line x1={4.4} y1={11.9} x2={4.4} y2={15.3} {...p} />
          <Line x1={19.6} y1={11.9} x2={19.6} y2={15.3} {...p} />
          <Line x1={12} y1={13.6} x2={12} y2={10.6} {...p} />
          <Circle cx={12} cy={9.2} r={1.5} {...p} />
        </>
      );
      break;
    case 'short bar':
      icon = (
        <>
          <Line x1={7} y1={13.6} x2={17} y2={13.6} {...p} />
          <Line x1={7} y1={11.9} x2={7} y2={15.3} {...p} />
          <Line x1={17} y1={11.9} x2={17} y2={15.3} {...p} />
          <Line x1={12} y1={13.6} x2={12} y2={10.6} {...p} />
          <Circle cx={12} cy={9.2} r={1.5} {...p} />
        </>
      );
      break;
    case 'triangle grip':
      icon = (
        <>
          <Circle cx={12} cy={7.6} r={1.5} {...p} />
          <Line x1={12} y1={9.1} x2={12} y2={10.6} {...p} />
          <Path d="M12 10.6 L7.6 18 H16.4 Z" {...p} />
        </>
      );
      break;
    case 'rope':
      icon = (
        <>
          <Circle cx={12} cy={5.4} r={1.5} {...p} />
          <Path d="M11.3 6.8 C9.6 9.8 8.6 13 8.1 16.4" {...p} />
          <Path d="M12.7 6.8 C14.4 9.8 15.4 13 15.9 16.4" {...p} />
          <Circle cx={7.8} cy={18.3} r={1.6} {...p} />
          <Circle cx={16.2} cy={18.3} r={1.6} {...p} />
        </>
      );
      break;
    case 'single handle':
      icon = (
        <>
          <Line x1={8.8} y1={8.6} x2={8.8} y2={15.4} {...p} />
          <Path d="M8.8 8.6 C13.6 7 16.8 9.2 16.8 12 C16.8 14.8 13.6 17 8.8 15.4" {...p} />
        </>
      );
      break;
    case 'ankle strap':
      icon = (
        <>
          <Rect x={4.6} y={9.2} width={12.6} height={5.8} rx={2.9} {...p} />
          <Line x1={7.6} y1={10.8} x2={7.6} y2={13.4} {...p} />
          <Circle cx={19} cy={12.1} r={1.9} {...p} />
        </>
      );
      break;
    default:
      // Custom / unknown equipment — generic tag.
      icon = (
        <>
          <Path d="M4.2 4.2 H10.6 L19.8 13.4 L13.4 19.8 L4.2 10.6 Z" {...p} />
          <Circle cx={7.8} cy={7.8} r={1.3} {...p} />
        </>
      );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icon}
    </Svg>
  );
}

// ─── EquipmentPopup ───────────────────────────────────────────────────────────
// `items` come pre-ordered by the caller: main implement first, then extras/
// attachments (the save ordering already guarantees mains before attachments).
// Read-only info popup — deliberately no actions, overlay tap dismisses.

export default function EquipmentPopup({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: string[];
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.glassShadow}>
              <GlassPanel style={styles.glassBox}>
                <Text style={styles.title}>{en.machineSelector.equipmentTitle}</Text>
                <View style={styles.rows}>
                  {items.map((item, i) => (
                    <View key={`${item}-${i}`} style={styles.row}>
                      <View style={styles.iconTile}>
                        <EquipmentIcon name={item} size={26} color="#244e43" strokeWidth={1.6} />
                      </View>
                      <Text style={styles.rowText} numberOfLines={1}>{item}</Text>
                    </View>
                  ))}
                </View>
              </GlassPanel>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Liquid Glass popup — radius-38 shadow wrapper + GlassPanel (the app-wide
  // glass pop-up recipe, same as MusclePopup).
  glassShadow: {
    borderRadius: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 12,
  },
  glassBox: {
    borderRadius: 38,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
    minWidth: 250,
    maxWidth: 320,
  },
  // Overline title, darkened for glass legibility (the app-wide OnGlass values).
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: '#414b45',
    letterSpacing: 0.8,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Translucent white tile keeps the line icon readable on the glass —
  // same family as previewNoteEntryOnGlass.
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2823',
    flexShrink: 1,
  },
});
