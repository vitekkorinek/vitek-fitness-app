import React, { useId } from 'react';
import Svg, { Path, ClipPath, Rect, Defs, G } from 'react-native-svg';
import {
  BODY_FRONT, BODY_BACK, BODY_VIEWBOX, BODY_MIDLINE_X,
  BodyMapPart, BodyMapPath,
} from '@/lib/bodyMapData';

/**
 * Our own renderer over react-native-body-highlighter's body artwork (MIT,
 * baked into lib/bodyMapData.ts with per-path bounding boxes).
 *
 * Why it exists (Aug 1 2026, Vitek: "here we have upper chest but the entire
 * chest is full green, it should be only the upper fibers of the pec"): the
 * library can only fill a whole muscle path, but the app stores GRANULAR
 * muscles (Upper Chest, Front Delts, Upper Abs …). A region may carry a `band`
 * — a fraction of the muscle's own bounding box — so "upper chest" lights only
 * the top of the pec while the rest of it stays unlit.
 *
 * Band anchors for the x-axis: 'midline' measures from the edge of each path
 * that faces the body's centre (front delts = the inner part of the shoulder),
 * 'outer' from the edge facing away (lateral delts). Each muscle side is its
 * own path, so bands mirror correctly left/right for free.
 *
 * Rendering order: base body first, then intensity-1 (secondary, light mint),
 * then intensity-2 (primary, strong green) — overlapping bands resolve toward
 * the stronger claim, matching toRegions' "primary wins" rule.
 */
import type { BodyRegion, BodyRegionBand } from '@/lib/muscleSilhouette';

export type { BodyRegion, BodyRegionBand };

const DEFAULT_COLORS: [string, string] = ['#b8ede0', '#24ac88'];

// Softened body palette (Aug 1 2026, Vitek: "make the body a bit more soft").
// The artwork bakes exactly two fills: #3f3f3f (muscles/hair/hands) and #bebebe
// (face). Charcoal is replaced with a quiet green-gray mixed toward the HEADER
// green — a neutral gray this size reads brownish beside the app's green UI
// (same simultaneous-contrast lesson as the workout cards' inkDeep). Kept dark
// enough that the light-mint secondary highlight still clearly reads as "lit".
const SOFT_FILL: Record<string, string> = {
  '#3f3f3f': '#5d6b65',
  '#bebebe': '#cfd4d1',
};

function bandRect(
  path: BodyMapPath,
  band: BodyRegionBand,
  midlineX: number,
): { x: number; y: number; width: number; height: number } {
  const [x0, y0, x1, y1] = path.bbox;
  const w = x1 - x0;
  const h = y1 - y0;
  if (band.axis === 'y') {
    return { x: x0 - 2, y: y0 + band.from * h, width: w + 4, height: (band.to - band.from) * h };
  }
  const cx = (x0 + x1) / 2;
  // Which physical edge does the band grow from?
  const fromInnerEdge = (band.anchor ?? 'midline') === 'midline';
  const innerIsRight = cx < midlineX; // path sits left of the midline → its inner edge is its right edge
  const growFromRight = fromInnerEdge ? innerIsRight : !innerIsRight;
  if (growFromRight) {
    return { x: x1 - band.to * w, y: y0 - 2, width: (band.to - band.from) * w, height: h + 4 };
  }
  return { x: x0 + band.from * w, y: y0 - 2, width: (band.to - band.from) * w, height: h + 4 };
}

export default function BodyMap({ side, scale, regions, colors = DEFAULT_COLORS, baseFill }: {
  side: 'front' | 'back';
  scale: number;
  regions: BodyRegion[];
  colors?: [string, string];
  /** Override the whole base body with one flat colour (face included), instead of
   *  the two-tone SOFT_FILL. Used by the Progress landing, which stacks a second,
   *  accent-filled copy of the body under a moving window to light the strip the
   *  scan line is crossing. Leave unset for the normal body. */
  baseFill?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const parts: BodyMapPart[] = side === 'front' ? BODY_FRONT : BODY_BACK;
  const midlineX = BODY_MIDLINE_X[side];
  const bySlug = new Map<string, BodyMapPart>();
  for (const p of parts) bySlug.set(p.slug, p);

  // Secondary first, primary last, so primary paints over shared overlap.
  const ordered = [...regions].sort((a, b) => a.intensity - b.intensity);

  const clips: React.ReactNode[] = [];
  const highlights: React.ReactNode[] = [];
  ordered.forEach((region, ri) => {
    const part = bySlug.get(region.slug);
    if (!part) return;
    const fill = colors[Math.min(Math.max(region.intensity, 1), colors.length) - 1];
    part.paths.forEach((path, pi) => {
      if (!region.band) {
        highlights.push(<Path key={`h${ri}-${pi}`} d={path.d} fill={fill} />);
        return;
      }
      const r = bandRect(path, region.band, midlineX);
      if (r.width <= 0 || r.height <= 0) return;
      const clipId = `${uid}-c${ri}-${pi}`;
      clips.push(
        <ClipPath key={clipId} id={clipId}>
          <Rect x={r.x} y={r.y} width={r.width} height={r.height} />
        </ClipPath>
      );
      highlights.push(
        <Path key={`h${ri}-${pi}`} d={path.d} fill={fill} clipPath={`url(#${clipId})`} />
      );
    });
  });

  return (
    <Svg viewBox={BODY_VIEWBOX[side]} width={200 * scale} height={400 * scale}>
      {clips.length > 0 && <Defs>{clips}</Defs>}
      <G>
        {parts.map(part =>
          part.paths.map((path, i) => (
            <Path key={`${part.slug}-${i}`} d={path.d} fill={baseFill ?? SOFT_FILL[part.color] ?? part.color} />
          ))
        )}
      </G>
      <G>{highlights}</G>
    </Svg>
  );
}
