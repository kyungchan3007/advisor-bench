// 이용내역 CSV (docs/export.md)
import { parseTime, formatTime } from './time.js';

const HEADER = ['일시', '승차역', '하차역', '거리', '요금', '환승'];

function escape(value) {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const line = (fields) => fields.map(escape).join(',');

export function toCsv(settled) {
  const lines = [line(HEADER)];
  let tenths = 0;
  for (const r of settled.rides) {
    tenths += Math.round(r.km * 10);
    lines.push(
      line([
        formatTime(parseTime(r.board)),
        r.from,
        r.to,
        r.km.toFixed(1),
        r.fare,
        r.transfer ? 'Y' : 'N',
      ]),
    );
  }
  lines.push(line(['합계', '', '', (tenths / 10).toFixed(1), settled.total, '']));
  return lines.join('\n') + '\n';
}
