import { clamp } from './clamp.js';

const ACCURACY_SCALE = 103.1668;

const ACCURACY_DECAY = 0.04354;

const ACCURACY_OFFSET = 3.1669;

export function accuracyPercent(winBefore: number, winAfter: number): number {
  const lost = winBefore - winAfter;
  return clamp(ACCURACY_SCALE * Math.exp(-ACCURACY_DECAY * lost) - ACCURACY_OFFSET, 0, 100);
}
