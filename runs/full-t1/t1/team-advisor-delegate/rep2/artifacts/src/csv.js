// 이용내역 CSV
function esc(v) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(settled) {
  const lines = [['일시', '승차역', '하차역', '거리', '요금', '환승'].map(esc).join(',')];
  let sum = 0;
  for (const r of settled.rides) {
    sum += Math.round(r.km * 10);
    lines.push(
      [r.board, r.from, r.to, r.km.toFixed(1), r.fare, r.transfer ? 'Y' : 'N']
        .map(esc)
        .join(','),
    );
  }
  lines.push(['합계', '', '', (sum / 10).toFixed(1), settled.total, ''].map(esc).join(','));
  return lines.join('\n') + '\n';
}
