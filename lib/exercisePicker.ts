import type { Exercise } from '@/types/database';

type Handler = (exercise: Exercise) => void;
let _handler: Handler | null = null;

export function registerPickHandler(fn: Handler): () => void {
  _handler = fn;
  return () => { if (_handler === fn) _handler = null; };
}

export function dispatchPick(exercise: Exercise): void {
  _handler?.(exercise);
}
