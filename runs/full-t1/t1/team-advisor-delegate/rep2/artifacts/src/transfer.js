// 승차 기록을 통행으로 묶기 (통합환승)
import { parseTime, minutesBetween } from './time.js';

export function groupTrips(rides) {
  const sorted = rides
    .map((ride, i) => ({ ride, i, t: parseTime(ride.board) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.ride);

  const groups = [];
  let cur = null;
  for (const next of sorted) {
    if (cur) {
      const prev = cur[cur.length - 1];
      if (
        minutesBetween(prev.alight, next.board) <= 30 &&
        cur.length < 5 &&
        next.from !== prev.to
      ) {
        cur.push(next);
        continue;
      }
    }
    cur = [next];
    groups.push(cur);
  }
  return groups;
}
