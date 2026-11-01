// 이용내역 CSV (docs/export.md)
import { parseTime, formatTime } from './time.js';

function esc(v) {
  const s = String(v);
  return /[,"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(settled) {
  const lines = ['일시,승차역,하차역,거리,요금,환승'];
  let tenths = 0;
  let fareSum = 0;
  for (const r of settled.rides) {
    tenths += Math.round(r.km * 10);
    fareSum += r.fare;
    lines.push(
      [
        formatTime(parseTime(r.board)),
        r.from,
        r.to,
        r.km.toFixed(1),
        r.fare,
        r.transfer ? 'Y' : 'N',
      ]
        .map(esc)
        .join(','),
    );
  }
  lines.push(`합계,,,${(tenths / 10).toFixed(1)},${fareSum},`);
  return lines.join('\n') + '\n';
}
