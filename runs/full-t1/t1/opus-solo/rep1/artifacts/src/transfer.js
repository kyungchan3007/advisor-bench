// 승차 기록을 통행으로 묶기 (docs/transfer.md)
import { parseTime } from './time.js';

const TRANSFER_MINUTES = 30;
const MAX_RIDES_PER_TRIP = 5; // 환승 최대 4회

// 승차 시각 순으로 정렬한 승차 기록 (입력은 건드리지 않는다, 같은 시각은 입력 순서 유지)
export function sortRides(rides) {
  return rides
    .map((ride) => ({ ride, t: parseTime(ride.board) }))
    .sort((a, b) => a.t - b.t)
    .map(({ ride }) => ride);
}

function isTransfer(prev, next) {
  if (next.from === prev.to) return false; // 하차한 역에서 다시 타면 새 통행
  const gap = parseTime(next.board) - parseTime(prev.alight);
  return gap >= 0 && gap <= TRANSFER_MINUTES;
}

export function groupTrips(rides) {
  const trips = [];
  let trip = null;
  for (const ride of sortRides(rides)) {
    if (trip && trip.length < MAX_RIDES_PER_TRIP && isTransfer(trip.at(-1), ride)) {
      trip.push(ride);
    } else {
      trip = [ride];
      trips.push(trip);
    }
  }
  return trips;
}
