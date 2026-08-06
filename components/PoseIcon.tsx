import Svg, { Circle, Path, G } from 'react-native-svg';
import { photoSlot } from '@/lib/photoSlots';

/**
 * Tiny body silhouette that sits in front of a pose's name — Vitek, Aug 6 2026:
 * "the category can be drop down menu with also small silhouette in front of the
 * title as a icon".
 *
 * Drawn rather than taken from `BodyMap`: that artwork is hundreds of paths meant
 * for a 200×400 box, and at 20px it renders as a smudge for a large cost. These
 * are four shapes that stay legible at icon size and say which POSE, not which
 * muscle.
 */

export type PoseShape = 'front' | 'side' | 'back' | 'mobility';

export function poseShapeFor(slotKey: string): PoseShape {
  const preset = photoSlot(slotKey);
  if (!preset) return 'front';                       // custom poses
  if (preset.group === 'mobility') return 'mobility';
  if (preset.key === 'side') return 'side';
  if (preset.key === 'back') return 'back';
  return 'front';
}

export default function PoseIcon({
  shape, size = 20, color = '#244e43',
}: {
  shape: PoseShape;
  size?: number;
  color?: string;
}) {
  const h = size;
  const w = size * 0.62;

  return (
    <Svg width={w} height={h} viewBox="0 0 40 64">
      {shape === 'side' ? (
        <G fill={color}>
          <Circle cx="22" cy="8" r="6" />
          {/* profile: one shoulder, one arm, one leg — the body reads edge-on */}
          <Path d="M17 15 h9 q4 0 4.4 4 l1 13 q0.3 4 -2 6 l-1.6 1.4 -1.4 -8 -1 9 h-6 l-1.6 -12 q-0.6 -4 0.6 -8 z" />
          <Path d="M25 22 q3.4 1 3.6 4.6 l0.6 9 -3 0.6 -0.8 -9 z" />
          <Path d="M16.6 34 h8.6 l1.4 13 0.6 14 h-5.4 l-1 -13 -1.2 13 h-5 l0.6 -14 z" />
        </G>
      ) : shape === 'mobility' ? (
        <G fill={color}>
          <Circle cx="20" cy="11" r="6" />
          {/* arms overhead — the shape every mobility pose shares */}
          <Path d="M13 18 h14 q3 0 3.2 3.4 l0.8 12 q0.2 3.2 -2.4 3.6 l-1 -9 v6 h-15 v-6 l-1 9 q-2.6 -0.4 -2.4 -3.6 l0.8 -12 q0.2 -3.4 3 -3.4 z" />
          <Path d="M12.6 19 l-4.4 -14 3.4 -1.4 5.4 13.6 z" />
          <Path d="M27.4 19 l4.4 -14 -3.4 -1.4 -5.4 13.6 z" />
          <Path d="M13 38 h14 l-1 11 -0.6 12 h-4.6 l-0.8 -12 -0.8 12 h-4.6 l-0.6 -12 z" />
        </G>
      ) : (
        <G fill={color}>
          <Circle cx="20" cy="8" r="6" />
          <Path d="M13.4 15 h13.2 q3.2 0 3.6 3.6 l1 11 q0.3 3 -2.2 3.4 l-1 -8.6 v8.6 h-16 v-8.6 l-1 8.6 q-2.5 -0.4 -2.2 -3.4 l1 -11 q0.4 -3.6 3.6 -3.6 z" />
          <Path d="M12 34 h16 l-1.2 12 -0.6 15 h-5 l-1.2 -14 -1.2 14 h-5 l-0.6 -15 z" />
          {shape === 'back' && (
            // the one mark that tells Back from Front at 20px
            <Path d="M19.2 16.5 h1.6 v15 h-1.6 z" fill="#fff" opacity={0.55} />
          )}
        </G>
      )}
    </Svg>
  );
}
