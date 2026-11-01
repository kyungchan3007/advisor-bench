// 승객 유형 할인 (기본운임에만 적용, 10원 미만 버림)
import { BASE_FARE, distanceFare } from './distance.js';

const DISCOUNT_PERCENT = { adult: 0, youth: 20, child: 50, senior: 100 };

export function fareFor(km, type = 'adult') {
  if (!Object.hasOwn(DISCOUNT_PERCENT, type)) {
    throw new Error(`알 수 없는 승객 유형: ${type}`);
  }
  if (type === 'senior') return 0;
  const pct = DISCOUNT_PERCENT[type];
  const base = Math.floor((BASE_FARE * (100 - pct)) / 1000) * 10;
  return base + (distanceFare(km) - BASE_FARE);
}
