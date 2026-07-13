export type WorkoutCategory =
  | 'Push' | 'Pull' | 'Upper Body' | 'Lower Body' | 'Legs'
  | 'Full Body' | 'Core' | 'Mobility' | 'Recovery'
  | 'Upper body stretching' | 'Lower body stretching' | 'Full body stretching';

export const CATEGORY_OPTIONS: WorkoutCategory[] = [
  'Push', 'Pull', 'Upper Body', 'Lower Body', 'Legs', 'Full Body', 'Core', 'Mobility', 'Recovery',
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
  'Push':                    { border: '#7BB3E8', pillBg: '#E6F1FB', pillText: '#2C6BAD' },
  'Pull':                    { border: '#2C6BAD', pillBg: '#dbeafe', pillText: '#185FA5' },
  'Upper Body':              { border: '#4A90D9', pillBg: '#EBF4FD', pillText: '#185FA5' },
  'Lower Body':              { border: '#7B68C8', pillBg: '#EEEDFE', pillText: '#3C3489' },
  'Legs':                    { border: '#5548A8', pillBg: '#e5e1fd', pillText: '#3C3489' },
  'Full Body':               { border: '#E8845A', pillBg: '#FAECE7', pillText: '#993C1D' },
  'Core':                    { border: '#E8A84A', pillBg: '#FAEEDA', pillText: '#633806' },
  'Mobility':                { border: '#24ac88', pillBg: '#E1F5EE', pillText: '#085041' },
  'Recovery':                { border: '#C4A0A0', pillBg: '#f3eded', pillText: '#72243E' },
  'Upper body stretching':   { border: '#3a7d6b', pillBg: '#ddf0ea', pillText: '#244e43' },
  'Lower body stretching':   { border: '#3a7d6b', pillBg: '#ddf0ea', pillText: '#244e43' },
  'Full body stretching':    { border: '#24ac88', pillBg: '#d0f5eb', pillText: '#085041' },
};
