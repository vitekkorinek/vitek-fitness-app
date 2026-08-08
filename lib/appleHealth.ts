/**
 * Apple Health (HealthKit) — read-only, phase 1 (Aug 2026).
 *
 * ⚠️ PHASE 1 IS CLIENT-ONLY DISPLAY: everything read here stays ON THE PHONE.
 * Nothing is written to Supabase, and the trainer sees none of it — that is
 * the deliberate GDPR posture (Apple's permission sheet is the consent
 * surface for on-device display). Showing this data to the trainer is phase
 * 2 and needs an explicit consent flow first. Do not "just upload it".
 *
 * ⚠️ Optional-require ON PURPOSE, like lib/appIcons.ts / lib/liveActivity.ts:
 * this JS reaches builds without the native module over the air (same
 * runtimeVersion), and a bare import would throw at load — the library is a
 * Nitro module, so even module init touches native. On those builds
 * `appleHealthSupported` is false and every UI entry point hides itself.
 *
 * ⚠️ HealthKit never reveals whether READ access was granted or denied — a
 * denied type just returns no samples (privacy by design). "Connected" is
 * therefore our own device-local flag set after the permission sheet ran; a
 * user who denied everything shows zeros, which is indistinguishable from a
 * phone with no data. That is Apple's model, not a bug to fix.
 *
 * The connected flag is DEVICE-wide, not per-account: health data belongs to
 * the phone's owner regardless of who is signed in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// Type-only import — erased at compile time, so it cannot break the
// optional-require pattern on builds without the module.
import type { UnitForIdentifier } from '@kingstinct/react-native-healthkit';

type HKModule = typeof import('@kingstinct/react-native-healthkit');

let hk: HKModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: HKModule = require('@kingstinct/react-native-healthkit');
  // isHealthDataAvailable touches native — inside the try so a JS-only build
  // (Expo Go, pre-HealthKit TestFlight) falls through to null.
  hk = mod.isHealthDataAvailable() ? mod : null;
} catch {
  hk = null;
}

export const appleHealthSupported: boolean = !!hk;

const CONNECTED_KEY = 'appleHealthConnected';

const READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
] as const;

export async function isAppleHealthConnected(): Promise<boolean> {
  if (!hk) return false;
  try {
    return (await AsyncStorage.getItem(CONNECTED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Shows the iOS permission sheet (once — iOS ignores repeat calls). */
export async function connectAppleHealth(): Promise<boolean> {
  if (!hk) return false;
  try {
    const ok = await hk.requestAuthorization({ toRead: READ_TYPES });
    if (ok) await AsyncStorage.setItem(CONNECTED_KEY, '1');
    return ok;
  } catch {
    return false;
  }
}

function dayBounds(d: Date): { startDate: Date; endDate: Date } {
  const startDate = new Date(d); startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(d); endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate };
}

async function sumBetween<T extends (typeof READ_TYPES)[number]>(
  id: T, unit: UnitForIdentifier<T>, startDate: Date, endDate: Date,
): Promise<number | null> {
  if (!hk) return null;
  try {
    const res = await hk.queryStatisticsForQuantity(id, ['cumulativeSum'], {
      filter: { date: { startDate, endDate } },
      unit,
    });
    return res.sumQuantity?.quantity ?? 0;
  } catch {
    return null;
  }
}

/** Total burn (resting + active) for any past-or-today day — the Food Log's
 *  like-for-like line against a total calorie goal, now date-aware. */
export async function fetchTotalKcalForDay(day: Date): Promise<number | null> {
  if (!hk) return null;
  const { startDate, endDate } = dayBounds(day);
  const [active, basal] = await Promise.all([
    sumBetween('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', startDate, endDate),
    sumBetween('HKQuantityTypeIdentifierBasalEnergyBurned', 'kcal', startDate, endDate),
  ]);
  return active != null && basal != null ? active + basal : null;
}

/** ACTIVE kcal in an exact window — the per-session burn (Vitek's time-window
 *  idea: the app knows when the session ran, Apple Health knows what the body
 *  did in that window). Active only: resting burn isn't the workout. Always
 *  present as an estimate (≈) — without a watch-workout HR is sampled coarsely. */
export async function fetchActiveKcalBetween(start: Date, end: Date): Promise<number | null> {
  return sumBetween('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', start, end);
}

export type DaySteps = { date: Date; steps: number };

/** Steps per day for the last `daysBack` days, ascending, ending TODAY (today
 *  is partial). One wide fetch serves the 7-day bars AND the days-in-a-row
 *  streak, so ask for enough history in one go. */
export async function fetchStepsDaily(daysBack: number): Promise<DaySteps[] | null> {
  if (!hk) return null;
  try {
    const now = new Date();
    const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (daysBack - 1));
    const { endDate } = dayBounds(now);
    const rows = await hk.queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], anchor, { day: 1 },
      { filter: { date: { startDate: anchor, endDate } }, unit: 'count' },
    );
    const byDay = new Map<string, number>();
    rows.forEach(r => {
      if (r.startDate) byDay.set(new Date(r.startDate).toDateString(), r.sumQuantity?.quantity ?? 0);
    });
    return Array.from({ length: daysBack }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (daysBack - 1) + i);
      return { date: d, steps: byDay.get(d.toDateString()) ?? 0 };
    });
  } catch {
    return null;
  }
}

/** Steps per calendar month of the CURRENT year (index 0 = January; months
 *  that haven't happened stay 0). The year total is the sum — one query
 *  serves both the big number and the month-by-month line. */
export async function fetchYearStepsByMonth(): Promise<number[] | null> {
  if (!hk) return null;
  try {
    const now = new Date();
    const anchor = new Date(now.getFullYear(), 0, 1);
    const rows = await hk.queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], anchor, { month: 1 },
      { filter: { date: { startDate: anchor, endDate: dayBounds(now).endDate } }, unit: 'count' },
    );
    const out = new Array(12).fill(0) as number[];
    rows.forEach(r => {
      if (r.startDate) {
        const d = new Date(r.startDate);
        if (d.getFullYear() === now.getFullYear()) out[d.getMonth()] = r.sumQuantity?.quantity ?? 0;
      }
    });
    return out;
  } catch {
    return null;
  }
}

export type MovementToday = {
  steps: number | null;
  activeKcal: number | null;
  /** Active + resting — the like-for-like line against a total calorie goal. */
  totalKcal: number | null;
  /** Averages over the last 7 FULL days (yesterday back) — today would dilute. */
  stepsDailyAvg: number | null;
  activeKcalDailyAvg: number | null;
};

export async function fetchMovementToday(): Promise<MovementToday | null> {
  if (!hk) return null;
  const now = new Date();
  const today = dayBounds(now);
  const avgEnd = dayBounds(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)).endDate;
  const avgStart = dayBounds(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)).startDate;

  const [steps, activeKcal, basalKcal, steps7, active7] = await Promise.all([
    sumBetween('HKQuantityTypeIdentifierStepCount', 'count', today.startDate, today.endDate),
    sumBetween('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', today.startDate, today.endDate),
    sumBetween('HKQuantityTypeIdentifierBasalEnergyBurned', 'kcal', today.startDate, today.endDate),
    sumBetween('HKQuantityTypeIdentifierStepCount', 'count', avgStart, avgEnd),
    sumBetween('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', avgStart, avgEnd),
  ]);

  return {
    steps,
    activeKcal,
    totalKcal: activeKcal != null && basalKcal != null ? activeKcal + basalKcal : null,
    stepsDailyAvg: steps7 != null ? steps7 / 7 : null,
    activeKcalDailyAvg: active7 != null ? active7 / 7 : null,
  };
}
