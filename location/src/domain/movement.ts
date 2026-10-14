import { haversineMeters } from './geo';
import type { LatLng, LocationSource } from './types';

export const MOVE_THRESHOLD_M = 300;
export const MAX_ACCURACY_M = 100;

export function acceptFix(accuracy: number | undefined, hasLocation: boolean): boolean {
  if (!hasLocation) return true;
  return accuracy === undefined || accuracy <= MAX_ACCURACY_M;
}

export function checkMovement(
  anchor: LatLng | null,
  current: LatLng,
): { moved: boolean; meters: number } {
  if (anchor === null) return { moved: true, meters: 0 };
  const meters = haversineMeters(anchor, current);
  return { moved: meters >= MOVE_THRESHOLD_M, meters };
}

export function shouldSwitchToGps(currentSource: LocationSource, fixAccepted: boolean): boolean {
  return (currentSource === 'manual' || currentSource === 'restored') && fixAccepted;
}
