// 하루 승차 기록 정산 — 승차마다 따로 계산 (옛 방식)
import { km } from './stations.js';
import { fareFor } from './passenger.js';

export function settle(rides, type = 'adult') {
  const out = rides.map((ride) => {
    const d = km(ride.from, ride.to);
    return { ...ride, km: d, fare: fareFor(d, type), transfer: false };
  });
  return { rides: out, total: out.reduce((s, r) => s + r.fare, 0) };
}
