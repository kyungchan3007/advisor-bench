// 하루 승차 기록 정산 — 통행 단위 합산 거리로 계산 (docs/transfer.md)
import { km } from './stations.js';
import { fareFor, assertPassengerType } from './passenger.js';
import { groupTrips } from './transfer.js';

export function settle(rides, type = 'adult') {
  assertPassengerType(type);
  const out = [];
  for (const trip of groupTrips(rides)) {
    let sumT = 0; // 0.1km 정수 단위 누적
    let paid = 0;
    trip.forEach((ride, i) => {
      const d = km(ride.from, ride.to);
      sumT += Math.round(d * 10);
      const total = fareFor(sumT / 10, type);
      const fare = i === 0 ? total : total - paid;
      paid += fare;
      out.push({ ...ride, km: d, fare, transfer: i > 0 });
    });
  }
  return { rides: out, total: out.reduce((s, r) => s + r.fare, 0) };
}
