// 승객 유형 할인
import { distanceFare } from './distance.js';

// TODO: 청소년 · 어린이 · 경로 할인 (docs/fares.md)
export function fareFor(km, type = 'adult') {
  return distanceFare(km);
}
