// 승차 기록을 통행으로 묶기
// 지금은 승차 한 번 = 통행 하나. 통합환승은 아직 없다.
export function groupTrips(rides) {
  return rides.map((ride) => [ride]);
}
