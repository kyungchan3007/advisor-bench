// 이용내역 CSV
const HEADER = ['일시', '승차역', '하차역', '거리', '요금', '환승'];

function cell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(settled) {
  const lines = [HEADER.join(',')];
  for (const r of settled.rides) {
    lines.push([r.board, r.from, r.to, r.km.toFixed(1), r.fare, r.transfer ? 'Y' : 'N'].map(cell).join(','));
  }
  const totalKm = Math.round(settled.rides.reduce((s, r) => s + r.km, 0) * 10) / 10;
  lines.push(['합계', '', '', totalKm.toFixed(1), settled.total, ''].map(cell).join(','));
  return lines.join('\n') + '\n';
}
