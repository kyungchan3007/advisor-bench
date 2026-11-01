// 거리 운임 (0.1km 정수 단위로 계산)
export const BASE_FARE = 1450;

export function distanceFare(km) {
  const t = Math.round(km * 10);
  if (t <= 100) return BASE_FARE;
  if (t <= 500) return BASE_FARE + 100 * Math.ceil((t - 100) / 50);
  return 2250 + 100 * Math.ceil((t - 500) / 80);
}
