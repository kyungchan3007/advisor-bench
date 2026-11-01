// 하루 승차 기록 정산 — 통합환승 (docs/transfer.md)
import { km } from './stations.js';
import { fareFor } from './passenger.js';
import { groupTrips } from './transfer.js';

const round1 = (x) => Math.round(x * 10) / 10;

export function settle(rides, type = 'adult') {
  const out = [];
  for (const trip of groupTrips(rides)) {
    let total = 0; // 통행 합산 거리
    let paid = 0; // 이 통행에서 이미 낸 요금
    trip.forEach((ride, i) => {
      const d = km(ride.from, ride.to);
      total = round1(total + d);
      const fare = fareFor(total, type) - paid; // 첫 승차는 total === d, paid === 0
      paid += fare;
      out.push({ ...ride, km: d, fare, transfer: i > 0 });
    });
  }
  return { rides: out, total: out.reduce((s, r) => s + r.fare, 0) };
}
