export type WorkoutCategory =
  | 'Push' | 'Pull' | 'Upper Body' | 'Arms' | 'Lower Body'
  | 'Full Body' | 'Core' | 'Mobility'
  // Legacy — no longer offered in the picker, kept so existing workouts still render
  // (Legs → treated as Lower Body, Recovery → treated as Mobility).
  | 'Legs' | 'Recovery'
  | 'Upper body stretching' | 'Lower body stretching' | 'Full body stretching';

export const CATEGORY_OPTIONS: WorkoutCategory[] = [
  'Push', 'Pull', 'Upper Body', 'Arms', 'Lower Body', 'Full Body', 'Core', 'Mobility',
];

export const STRETCHING_CATEGORIES: WorkoutCategory[] = [
  'Upper body stretching', 'Lower body stretching', 'Full body stretching',
];

export const STRETCHING_CATEGORY_TO_STRETCH_TYPE: Record<string, 'upper_body' | 'lower_body' | 'full_body'> = {
  'Upper body stretching': 'upper_body',
  'Lower body stretching': 'lower_body',
  'Full body stretching':  'full_body',
};

export const CATEGORY_COLORS: Record<WorkoutCategory, { border: string; pillBg: string; pillText: string }> = {
  // July 2026 hue shuffle (Vitek's call, after Lower Body cycled green→petrol→moss and
  // still collided somewhere each time): Pull→gold, Lower Body→blue, Full Body→green.
  // Blue is unique again, gold keeps its proven warm-cluster spacing under a new owner,
  // and the app's green lands on the category that means "everything" (forest green, not
  // brand teal, so pills don't impersonate ACCENT/status elements).
  'Push':                    { border: '#CC4B3C', pillBg: '#FBE9E6', pillText: '#8F2A1E' }, // red
  'Pull':                    { border: '#E0B12E', pillBg: '#FBF4DA', pillText: '#87680F' }, // gold
  'Upper Body':              { border: '#8B66A3', pillBg: '#EFEAF2', pillText: '#5C3C67' }, // dusty purple
  // Arms pushed hotter + punchier (July 2026): at pastel pill strength the old #E87F22
  // collapsed into Mobility's bronze — more chroma in pillBg + hue toward true orange.
  'Arms':                    { border: '#EA6E15', pillBg: '#FBE2CB', pillText: '#9A420B' }, // orange
  'Lower Body':              { border: '#3B7DC4', pillBg: '#E7F1FB', pillText: '#1D4E86' }, // blue
  'Full Body':               { border: '#3E9E5E', pillBg: '#E5F5EB', pillText: '#1E6B3A' }, // green
  'Core':                    { border: '#BE6B90', pillBg: '#F6EAEF', pillText: '#7D3F5B' }, // dusty rose
  'Mobility':                { border: '#BE8534', pillBg: '#F7ECD9', pillText: '#7A5013' }, // bronze
  // Legacy (mapped to their replacements' colours)
  'Legs':                    { border: '#3B7DC4', pillBg: '#E7F1FB', pillText: '#1D4E86' }, // → Lower Body
  'Recovery':                { border: '#BE8534', pillBg: '#F7ECD9', pillText: '#7A5013' }, // → Mobility
  'Upper body stretching':   { border: '#3a7d6b', pillBg: '#ddf0ea', pillText: '#244e43' },
  'Lower body stretching':   { border: '#3a7d6b', pillBg: '#ddf0ea', pillText: '#244e43' },
  'Full body stretching':    { border: '#24ac88', pillBg: '#d0f5eb', pillText: '#085041' },
};
