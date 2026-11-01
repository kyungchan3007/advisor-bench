// 이용내역 CSV (docs/export.md)
import { parseTime, formatTime } from './time.js';

function cell(v) {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const row = (values) => values.map(cell).join(',');

export function toCsv(settled) {
  const lines = [row(['일시', '승차역', '하차역', '거리', '요금', '환승'])];
  let tenths = 0; // 거리 합계를 0.1km 정수로 더해 부동소수 오차를 피한다
  let fareSum = 0;
  for (const r of settled.rides) {
    tenths += Math.round(r.km * 10);
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
  lines.push(row(['합계', '', '', (tenths / 10).toFixed(1), fareSum, '']));
  return lines.join('\n') + '\n';
}
