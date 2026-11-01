// 승객 유형 할인
import { BASE_FARE, distanceFare } from './distance.js';

// 기본운임 지불 비율(%)
const PAY_PERCENT = { adult: 100, youth: 80, child: 50, senior: 0 };

export function assertPassengerType(type) {
  if (!Object.hasOwn(PAY_PERCENT, type)) {
    throw new Error(`알 수 없는 승객 유형: ${type}`);
  }
}

export function fareFor(km, type = 'adult') {
  assertPassengerType(type);
  if (type === 'senior') return 0;
  const base = Math.floor((BASE_FARE * PAY_PERCENT[type]) / 100 / 10) * 10;
  return base + (distanceFare(km) - BASE_FARE);
}
