// 하루 승차 기록 정산 — 통합환승
import { km } from './stations.js';
import { fareFor } from './passenger.js';
import { groupTrips } from './transfer.js';

export function settle(rides, type = 'adult') {
  const out = [];
  for (const group of groupTrips(rides)) {
    let acc = 0; // 누적 거리 (0.1km 정수)
    let paid = 0;
    group.forEach((ride, i) => {
      const d = km(ride.from, ride.to);
      acc += Math.round(d * 10);
      const fare = fareFor(acc / 10, type) - paid;
      paid += fare;
      out.push({ ...ride, km: d, fare, transfer: i > 0 });
    });
  }
  return { rides: out, total: out.reduce((s, r) => s + r.fare, 0) };
}
