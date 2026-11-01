// 거리 운임
export const BASE_FARE = 1450;

// 0.1km 단위 정수로 계산해 부동소수 오차를 피한다
export function distanceFare(km) {
  const d = Math.round(km * 10);
  if (d <= 100) return BASE_FARE;
  if (d <= 500) return BASE_FARE + 100 * Math.ceil((d - 100) / 50);
  return BASE_FARE + 800 + 100 * Math.ceil((d - 500) / 80);
}
