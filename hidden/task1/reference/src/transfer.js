// 승차 기록을 통행으로 묶기
import { minutesBetween, parseTime } from './time.js';

export const TRANSFER_MINUTES = 30;
export const MAX_TRANSFERS = 4;

export function groupTrips(rides) {
  const sorted = [...rides].sort((a, b) => parseTime(a.board) - parseTime(b.board));
  const trips = [];
  for (const ride of sorted) {
    const trip = trips.at(-1);
    const prev = trip?.at(-1);
    const isTransfer =
      prev &&
      minutesBetween(prev.alight, ride.board) <= TRANSFER_MINUTES &&
      prev.to !== ride.from &&
      trip.length <= MAX_TRANSFERS;
    if (isTransfer) trip.push(ride);
    else trips.push([ride]);
  }
  return trips;
}
