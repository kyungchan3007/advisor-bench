// 거리 운임
export const BASE_FARE = 1450;

export function distanceFare(km) {
  const t = Math.round(km * 10); // 0.1km 단위 정수
  if (t <= 100) return BASE_FARE;
  if (t <= 500) return BASE_FARE + Math.ceil((t - 100) / 50) * 100;
  return BASE_FARE + 800 + Math.ceil((t - 500) / 80) * 100;
}
