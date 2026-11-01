// 하루 승차 기록 정산 — 통합환승 (docs/transfer.md)
import { km } from './stations.js';
import { fareFor } from './passenger.js';
import { groupTrips } from './transfer.js';

const round1 = (x) => Math.round(x * 10) / 10;

export function settle(rides, type = 'adult') {
  const out = [];
  for (const trip of groupTrips(rides)) {
    let sum = 0;
    let paid = 0;
    trip.forEach((ride, i) => {
      const d = km(ride.from, ride.to);
      sum = round1(sum + d);
      const fare = i === 0 ? fareFor(d, type) : fareFor(sum, type) - paid;
      paid += fare;
      out.push({ ...ride, km: d, fare, transfer: i > 0 });
    });
  }
  return { rides: out, total: out.reduce((s, r) => s + r.fare, 0) };
}
