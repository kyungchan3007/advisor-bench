// 거리 운임
export const BASE_FARE = 1450;

export function distanceFare(km) {
  if (km <= 10) return BASE_FARE;
  if (km <= 50) return BASE_FARE + Math.ceil((km - 10) / 5) * 100;
  return BASE_FARE + 800 + Math.ceil((km - 50) / 8) * 100;
}
