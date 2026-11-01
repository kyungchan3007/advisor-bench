// 승차 기록을 통행으로 묶기 (docs/transfer.md)
// 승차 기록: { from, to, board: 'YYYY-MM-DD HH:mm', alight: 'YYYY-MM-DD HH:mm' }
import { parseTime } from './time.js';

const TRANSFER_WINDOW = 30; // 분, 정각 포함
const MAX_RIDES = 5; // 환승 최대 4회

function alightOf(ride) {
  if (ride.alight === undefined) {
    throw new Error(`하차 시각(alight) 없음: ${ride.from} → ${ride.to} ${ride.board}`);
  }
  return parseTime(ride.alight);
}

export function groupTrips(rides) {
  // 입력은 건드리지 않고 승차 시각 순으로 정렬 (같은 시각이면 입력 순서 유지)
  const sorted = [...rides].sort((a, b) => parseTime(a.board) - parseTime(b.board));
  const trips = [];
  let cur = null;
  for (const ride of sorted) {
    const prev = cur && cur[cur.length - 1];
    const joins =
      prev &&
      cur.length < MAX_RIDES &&
      prev.to !== ride.from &&
      parseTime(ride.board) - alightOf(prev) <= TRANSFER_WINDOW;
    if (joins) {
      cur.push(ride);
    } else {
      cur = [ride];
      trips.push(cur);
    }
  }
  return trips;
}
