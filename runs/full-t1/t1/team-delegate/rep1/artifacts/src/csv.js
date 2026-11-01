// 이용내역 CSV
import { parseTime, formatTime } from './time.js';

function esc(v) {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(settled) {
  const lines = ['일시,승차역,하차역,거리,요금,환승'];
  let sumT = 0;
  for (const r of settled.rides) {
    sumT += Math.round(r.km * 10);
    lines.push(
      [
        formatTime(parseTime(r.board)),
        r.from,
        r.to,
        r.km.toFixed(1),
        r.fare,
        r.transfer ? 'Y' : 'N',
      ].map(esc).join(','),
    );
  }
  lines.push(`합계,,,${(sumT / 10).toFixed(1)},${settled.total},`);
  return lines.join('\n') + '\n';
}
