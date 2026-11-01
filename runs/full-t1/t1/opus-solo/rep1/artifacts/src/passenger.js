// 승객 유형 할인 (docs/fares.md)
import { BASE_FARE, distanceFare } from './distance.js';

// 기본운임 할인율 (%)
const DISCOUNT = { adult: 0, youth: 20, child: 50 };

export function fareFor(km, type = 'adult') {
  if (type === 'senior') return 0;
  if (!Object.hasOwn(DISCOUNT, type)) throw new Error(`모르는 승객 유형: ${type}`);
  const extra = distanceFare(km) - BASE_FARE; // 거리 추가운임은 할인하지 않는다
  const base = Math.floor((BASE_FARE * (100 - DISCOUNT[type])) / 100 / 10) * 10; // 10원 미만 버림
  return base + extra;
}
