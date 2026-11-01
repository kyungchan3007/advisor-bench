// 승차 기록을 통행(환승 묶음)으로 묶기
// 가정: 하차 시각 필드는 문서에 이름이 없어 ride.alight('YYYY-MM-DD HH:mm')를 쓰고,
// 없으면 ride.board로 대신한다.
import { parseTime, minutesBetween } from './time.js';

const MAX_RIDES = 5;

export function groupTrips(rides) {
  const sorted = [...rides].sort((a, b) => parseTime(a.board) - parseTime(b.board));
  const trips = [];
  let cur = null;
  let prev = null;
  for (const next of sorted) {
    const joins =
      cur !== null &&
      minutesBetween(prev.alight ?? prev.board, next.board) <= 30 &&
      cur.length < MAX_RIDES &&
      next.from !== prev.to;
    if (joins) {
      cur.push(next);
    } else {
      cur = [next];
      trips.push(cur);
    }
    prev = next;
  }
  return trips;
}
