// 하루 승차 기록 정산 — 통합환승
import { km } from './stations.js';
import { fareFor } from './passenger.js';
import { groupTrips } from './transfer.js';

export function settle(rides, type = 'adult') {
  const out = [];
  for (const trip of groupTrips(rides)) {
    let cum10 = 0;
    let paid = 0;
    trip.forEach((ride, i) => {
      const seg = km(ride.from, ride.to);
      cum10 += Math.round(seg * 10);
      const fare = fareFor(cum10 / 10, type) - paid;
      paid += fare;
      out.push({ ...ride, km: seg, fare, transfer: i > 0 });
    });
  }
  return { rides: out, total: out.reduce((s, r) => s + r.fare, 0) };
}
