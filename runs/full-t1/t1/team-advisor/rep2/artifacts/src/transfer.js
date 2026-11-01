// 승차 기록을 통행으로 묶기 (docs/transfer.md)
// ride: { from, to, board: 'YYYY-MM-DD HH:mm', alight: 'YYYY-MM-DD HH:mm' }
import { parseTime } from './time.js';

const TRANSFER_WINDOW = 30; // 분, 정각 포함
const MAX_RIDES = 5; // 환승 최대 4회

function sortRides(rides) {
  return [...rides].sort((a, b) => parseTime(a.board) - parseTime(b.board));
}

export function groupTrips(rides) {
  const trips = [];
  let trip = null;
  for (const ride of sortRides(rides)) {
    const prev = trip?.at(-1);
    const isTransfer =
      prev !== undefined &&
      trip.length < MAX_RIDES &&
      ride.from !== prev.to &&
      parseTime(ride.board) - parseTime(prev.alight) <= TRANSFER_WINDOW;
    if (isTransfer) {
      trip.push(ride);
    } else {
      trip = [ride];
      trips.push(trip);
    }
  }
  return trips;
}
