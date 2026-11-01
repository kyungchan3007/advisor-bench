// 승차 기록을 통행으로 묶기 (docs/transfer.md)
import { parseTime } from './time.js';

const MAX_RIDES = 5; // 환승 최대 4회
const WINDOW_MIN = 30;

// 하차 시각 필드는 `alight`, 없으면 board 로 대체
const alightOf = (r) => parseTime(r.alight ?? r.board);

export function groupTrips(rides) {
  const sorted = rides
    .map((r) => ({ r, t: parseTime(r.board) }))
    .sort((a, b) => a.t - b.t) // 안정 정렬
    .map((x) => x.r);

  const trips = [];
  let cur = null;
  for (const ride of sorted) {
    if (cur) {
      const prev = cur[cur.length - 1];
      const gap = parseTime(ride.board) - alightOf(prev);
      if (gap <= WINDOW_MIN && prev.to !== ride.from && cur.length < MAX_RIDES) {
        cur.push(ride);
        continue;
      }
    }
    cur = [ride];
    trips.push(cur);
  }
  return trips;
}
