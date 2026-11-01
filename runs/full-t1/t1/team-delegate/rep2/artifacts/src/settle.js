// 하루 승차 기록 정산 — 통합환승 (docs/transfer.md)
import { km } from './stations.js';
import { fareFor } from './passenger.js';
import { groupTrips } from './transfer.js';

export function settle(rides, type = 'adult') {
  const out = [];
  for (const trip of groupTrips(rides)) {
    let cum = 0; // 0.1km 정수
    let paid = 0;
    trip.forEach((ride, i) => {
      const d = km(ride.from, ride.to);
      cum += Math.round(d * 10);
      const transfer = i > 0;
      const fare = transfer ? fareFor(cum / 10, type) - paid : fareFor(d, type);
      paid += fare;
      out.push({ ...ride, km: d, fare, transfer });
    });
  }
  return { rides: out, total: out.reduce((s, r) => s + r.fare, 0) };
}
