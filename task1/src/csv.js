// 이용내역 CSV
import { parseTime } from './time.js';

export function toCsv(settled) {
  const lines = ['승차역,하차역,요금,거리,일시'];
  for (const r of settled.rides) {
    const when = new Date(parseTime(r.board) * 60000).toISOString();
    lines.push([r.from, r.to, r.fare, r.km, when].join(','));
  }
  return lines.join('\n');
}
