// 승객 유형 할인
import { BASE_FARE, distanceFare } from './distance.js';

const BASE_DISCOUNT = { adult: 0, youth: 0.2, child: 0.5 };

export function fareFor(km, type = 'adult') {
  if (type === 'senior') return 0;
  if (!(type in BASE_DISCOUNT)) throw new Error(`알 수 없는 승객 유형: ${type}`);
  const fare = distanceFare(km) - BASE_FARE * BASE_DISCOUNT[type];
  return Math.floor(fare / 10) * 10;
}
