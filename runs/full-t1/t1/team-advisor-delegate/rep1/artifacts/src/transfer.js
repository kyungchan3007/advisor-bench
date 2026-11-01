// 승차 기록을 통행으로 묶기 (통합환승)
import { parseTime, minutesBetween } from './time.js';

const MAX_RIDES = 5;
const MAX_GAP = 30;

export function groupTrips(rides) {
  const sorted = rides.slice().sort((a, b) => parseTime(a.board) - parseTime(b.board));
  const trips = [];
  let cur = [];
  for (const ride of sorted) {
    const prev = cur[cur.length - 1];
    if (prev && (prev.alight === undefined || prev.alight === null)) {
      throw new Error(`하차 시각(alight) 없음: ${prev.from} → ${prev.to}`);
    }
    if (
      cur.length === 0 ||
      minutesBetween(prev.alight, ride.board) > MAX_GAP ||
      cur.length >= MAX_RIDES ||
      prev.to === ride.from
    ) {
      cur = [];
      trips.push(cur);
    }
    cur.push(ride);
  }
  return trips;
}
