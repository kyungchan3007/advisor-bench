// 승객 유형 할인
import { BASE_FARE, distanceFare } from './distance.js';

const PCT = { adult: 100, youth: 80, child: 50 };

export function fareFor(km, type = 'adult') {
  if (type !== 'senior' && !Object.hasOwn(PCT, type)) {
    throw new Error(`알 수 없는 승객 유형: ${String(type)}`);
  }
  if (type === 'senior') return 0;
  const base = Math.floor((BASE_FARE * PCT[type]) / 100 / 10) * 10;
  const extra = distanceFare(km) - BASE_FARE;
  return base + extra;
}
