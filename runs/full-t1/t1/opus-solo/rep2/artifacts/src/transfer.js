// 승차 기록을 통행으로 묶기 (docs/transfer.md)
// 승차 기록: { from, to, board: 'YYYY-MM-DD HH:mm', alight: 'YYYY-MM-DD HH:mm' }
import { parseTime } from './time.js';

const TRANSFER_WINDOW = 30; // 분, 정각 포함
const MAX_RIDES_PER_TRIP = 5; // 환승 최대 4회

function isTransfer(prev, cur) {
  if (cur.from === prev.to) return false; // 하차한 역에서 바로 다시 타면 새 통행
  const gap = parseTime(cur.board) - parseTime(prev.alight);
  return gap >= 0 && gap <= TRANSFER_WINDOW;
}

export function groupTrips(rides) {
  // 입력은 건드리지 않고 승차 시각 순으로 정렬 (같은 시각은 입력 순서 유지)
  const sorted = rides
    .map((ride) => ({ ride, t: parseTime(ride.board) }))
    .sort((a, b) => a.t - b.t)
    .map((x) => x.ride);

  const trips = [];
  let trip = null;
  for (const ride of sorted) {
    if (trip && trip.length < MAX_RIDES_PER_TRIP && isTransfer(trip[trip.length - 1], ride)) {
      trip.push(ride);
    } else {
      trip = [ride];
      trips.push(trip);
    }
  }
  return trips;
}
