// 이용내역 CSV (docs/export.md)
import { parseTime, formatTime } from './time.js';

function esc(value) {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const row = (cells) => cells.map(esc).join(',');

export function toCsv(settled) {
  const lines = [row(['일시', '승차역', '하차역', '거리', '요금', '환승'])];
  let kmSum = 0;
  let fareSum = 0;
  for (const r of settled.rides) {
    lines.push(row([
      formatTime(parseTime(r.board)),
      r.from,
      r.to,
      r.km.toFixed(1),
      r.fare,
      r.transfer ? 'Y' : 'N',
    ]));
    kmSum = Math.round((kmSum + r.km) * 10) / 10;
    fareSum += r.fare;
  }
  lines.push(row(['합계', '', '', kmSum.toFixed(1), fareSum, '']));
  return lines.join('\n') + '\n';
}
