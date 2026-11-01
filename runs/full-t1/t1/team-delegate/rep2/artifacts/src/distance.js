// 거리 운임 (0.1km 정수로 계산해 부동소수점 오차를 피한다)
export const BASE_FARE = 1450;

const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

export function distanceFare(km) {
  const t = Math.round(km * 10); // 0.1km 단위
  if (t <= 100) return BASE_FARE;
  if (t <= 500) return BASE_FARE + 100 * ceilDiv(t - 100, 50);
  return BASE_FARE + 800 + 100 * ceilDiv(t - 500, 80);
}
