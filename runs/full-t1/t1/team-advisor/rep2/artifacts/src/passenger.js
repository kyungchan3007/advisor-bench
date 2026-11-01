// 승객 유형 할인 (docs/fares.md)
import { BASE_FARE, distanceFare } from './distance.js';

// 기본운임 할인율(%). senior 는 거리와 상관없이 0원.
const BASE_DISCOUNT_PCT = { adult: 0, youth: 20, child: 50 };

export function fareFor(km, type = 'adult') {
  if (type === 'senior') return 0;
  if (!Object.hasOwn(BASE_DISCOUNT_PCT, type)) throw new Error(`모르는 승객 유형: ${type}`);
  const extra = distanceFare(km) - BASE_FARE; // 거리 추가운임은 할인하지 않는다
  // 할인한 기본운임에서 10원 미만은 버린다 (정수 연산으로 부동소수 오차 회피)
  const base = Math.floor((BASE_FARE * (100 - BASE_DISCOUNT_PCT[type])) / 1000) * 10;
  return base + extra;
}
