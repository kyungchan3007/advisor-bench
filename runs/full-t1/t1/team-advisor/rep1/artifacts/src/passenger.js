// 승객 유형 할인 (docs/fares.md)
import { BASE_FARE, distanceFare } from './distance.js';

// 기본운임 할인율 (%) — 부동소수 오차를 피하려고 정수로 둔다
const DISCOUNT = { adult: 0, youth: 20, child: 50, senior: 100 };

export function fareFor(km, type = 'adult') {
  if (!Object.hasOwn(DISCOUNT, type)) throw new Error(`모르는 승객 유형: ${type}`);
  if (type === 'senior') return 0;
  // 할인은 기본운임에만, 할인 뒤 10원 미만은 버림. 거리 추가운임은 그대로.
  const base = Math.floor((BASE_FARE * (100 - DISCOUNT[type])) / 1000) * 10;
  return base + (distanceFare(km) - BASE_FARE);
}
