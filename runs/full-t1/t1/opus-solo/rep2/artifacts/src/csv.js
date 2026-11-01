// 이용내역 CSV (docs/export.md)
import { parseTime, formatTime } from './time.js';

function cell(v) {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (values) => values.map(cell).join(',');

export function toCsv(settled) {
  const lines = [row(['일시', '승차역', '하차역', '거리', '요금', '환승'])];
  let kmSum = 0;
  let fareSum = 0;
  for (const r of settled.rides) {
    kmSum = Math.round((kmSum + r.km) * 10) / 10;
    fareSum += r.fare;
    lines.push(row([
      formatTime(parseTime(r.board)),
      r.from,
      r.to,
      r.km.toFixed(1),
      r.fare,
      r.transfer ? 'Y' : 'N',
    ]));
  }
  lines.push(row(['합계', '', '', kmSum.toFixed(1), fareSum, '']));
  return lines.join('\n') + '\n';
}
