// 거리 운임 (docs/fares.md)
export const BASE_FARE = 1450;

// "까지"는 경계를 포함하고, 모자란 구간도 한 구간으로 친다.
// 부동소수 오차를 피하려고 0.1km 단위 정수로 계산한다.
export function distanceFare(km) {
  const t = Math.round(km * 10);
  if (t <= 100) return BASE_FARE;
  if (t <= 500) return BASE_FARE + Math.ceil((t - 100) / 50) * 100;
  return BASE_FARE + 800 + Math.ceil((t - 500) / 80) * 100;
}
