import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import MuscleThumb from './MuscleThumb';

/**
 * Small leading thumbnail for exercise LIST rows (Library → Exercises tab, the
 * workout-builder picker): own photo → video auto-thumbnail → muscle silhouette.
 * Same fallback chain as Do Mode's PickerThumb, so a given exercise looks the
 * same wherever you meet it (`extra_photo_urls[0] ?? thumbnail_url` — library-
 * seeded exercises carry their demo photo in thumbnail_url only).
 *
 * ⚠️ `pointerEvents="none"` on the silhouette wrapper — MuscleThumb opens its own
 * muscle popup on tap, which would swallow the row's tap. In a list the ROW's
 * action is the only one (same rule as Do Mode's PickerThumb).
 */
export function ExerciseListThumb({ exercise, size = 40 }: {
  exercise: {
    thumbnail_url: string | null;
    extra_photo_urls?: string[];
    muscle_groups: string[];
    secondary_muscle_groups?: string[];
  };
  size?: number;
}) {
  const photo = exercise.extra_photo_urls?.[0] ?? exercise.thumbnail_url;
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.175) };
  if (photo) {
    return <Image source={{ uri: photo }} style={[styles.thumb, box]} />;
  }
  return (
    <View style={[styles.thumb, box]} pointerEvents="none">
      <MuscleThumb
        muscleGroups={exercise.muscle_groups}
        secondaryMuscleGroups={exercise.secondary_muscle_groups ?? []}
        size={size}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { overflow: 'hidden', backgroundColor: '#f0f0ee' },
});
