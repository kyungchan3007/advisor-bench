// 풀이 재생 애니메이션 SVG — README에서 움직인다 (SMIL)
//   node tools/replay.mjs <level.json> <행동 문자열 | 파일> <out.svg> [제목]
import fs from 'node:fs';
import { parseLevel, simulate, tokenize } from '../hidden/task2/engine.mjs';

const CELL = 10;
const TICK_S = 0.18; // 1틱 = 0.18초
const COLORS = {
  '#': '#2b2f36',
  ',': '#e9e4d8',
  '.': '#f7f3ea',
  G: '#d9534f',
  S: '#3b82f6',
  E: '#16a34a',
};

export function renderReplay(levelJson, actions, title = '') {
  const L = parseLevel(levelJson);
  const sim = simulate(L, actions);
  const W = L.W * CELL;
  const H = L.H * CELL;
  const top = 26;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + top + 18}" width="${W}" font-family="sans-serif" shape-rendering="crispEdges">`);
  out.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  out.push(`<text x="4" y="17" font-size="13" fill="#222" font-weight="bold">${esc(title || L.name)}</text>`);
  out.push(`<g transform="translate(0 ${top})">`);
  // 칸
  // 같은 색이 이어진 칸은 한 사각형으로 (파일 크기 줄이기)
  const fillOf = (ch) => COLORS[ch] ?? (ch === 'P' ? '#f7f3ea' : '#fde68a');
  for (let r = 0; r < L.H; r++) {
    let c = 0;
    while (c < L.W) {
      const fill = fillOf(L.grid[r][c]);
      let e = c + 1;
      while (e < L.W && fillOf(L.grid[r][e]) === fill) e++;
      out.push(`<rect x="${c * CELL}" y="${r * CELL}" width="${(e - c) * CELL}" height="${CELL}" fill="${fill}"/>`);
      c = e;
    }
    for (let k = 0; k < L.W; k++) {
      const ch = L.grid[r][k];
      if ('<>^v'.includes(ch)) out.push(`<text x="${k * CELL + 5}" y="${r * CELL + 8}" font-size="8" text-anchor="middle" fill="#92400e">${esc(ch)}</text>`);
    }
  }
  // 노선 (역 사이 점선) · 승강장
  for (const line of L.lines) {
    const pts = line.stations.map((s) => `${s.at[1] * CELL + 5},${s.at[0] * CELL + 5}`).join(' ');
    out.push(`<polyline points="${pts}" fill="none" stroke="${line.color}" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.45"/>`);
    for (const s of line.stations) out.push(`<rect x="${s.at[1] * CELL + 1}" y="${s.at[0] * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" fill="${line.color}" opacity="0.85"/>`);
  }
  // 궤적: 걸음은 금색, 승차는 노선 색. 해당 틱에 나타난다
  const tr = sim.trace;
  const colorOf = (id) => L.lines.find((l) => l.id === id)?.color ?? '#000';
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1];
    const b = tr[i];
    const ride = b.ev === 'ride';
    const evict = b.ev === 'evict';
    const begin = (a.t * TICK_S).toFixed(2);
    const stroke = ride ? colorOf(b.line) : evict ? '#dc2626' : '#d4a017';
    const dash = evict ? ' stroke-dasharray="4 3"' : '';
    out.push(
      `<line x1="${a.c * CELL + 5}" y1="${a.r * CELL + 5}" x2="${b.c * CELL + 5}" y2="${b.r * CELL + 5}" stroke="${stroke}" stroke-width="${ride ? 3 : 2.5}"${dash} stroke-linecap="round" visibility="hidden"><set attributeName="visibility" to="visible" begin="${begin}s" fill="freeze"/></line>`,
    );
  }
  // 승객 점: 틱마다 위치 (승차 구간은 직선으로 이어 움직임)
  const end = tr.at(-1).t;
  const dur = Math.max(end * TICK_S, 0.5);
  const kt = tr.map((x) => (end ? x.t / end : 0).toFixed(4)).join(';');
  const cx = tr.map((x) => x.c * CELL + 5).join(';');
  const cy = tr.map((x) => x.r * CELL + 5).join(';');
  out.push(`<circle r="4" fill="#111" stroke="#fff" stroke-width="1.5" cx="${tr[0].c * CELL + 5}" cy="${tr[0].r * CELL + 5}">`);
  out.push(`<animate attributeName="cx" values="${cx}" keyTimes="${kt}" dur="${dur}s" fill="freeze"/>`);
  out.push(`<animate attributeName="cy" values="${cy}" keyTimes="${kt}" dur="${dur}s" fill="freeze"/>`);
  out.push(`</circle>`);
  out.push('</g>');
  const status = sim.ok ? `도착 ${sim.tick}틱 · ${sim.fare.toLocaleString('en-US')}원 · 승차 ${sim.boardings}번` : `실패: ${sim.error}`;
  out.push(`<text x="4" y="${H + top + 13}" font-size="11" fill="${sim.ok ? '#333' : '#b91c1c'}">${esc(status)}</text>`);
  out.push('</svg>');
  return { svg: out.join('\n'), sim };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [levelPath, act, outPath, title] = process.argv.slice(2);
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const actions = fs.existsSync(act) ? fs.readFileSync(act, 'utf8').trim() : act;
  tokenize(actions);
  const { svg, sim } = renderReplay(level, actions, title);
  fs.writeFileSync(outPath, svg);
  console.log(outPath, sim.ok ? `ok ${sim.tick} ${sim.fare}` : sim.error);
}
