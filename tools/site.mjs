// 직접 해 보는 막차 러너 페이지(docs/index.html)를 만든다. GitHub Pages로 연다.
//   node tools/site.mjs
// 노선도와 풀이 요약은 README 그림과 같은 코드(tools/replay.mjs)로 그린다. 칸 단위로 걷는 부분만 따로 확대해 보여 준다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = fs.readFileSync(path.join(ROOT, 'hidden/task2/engine.mjs'), 'utf8').replace(/^export /gm, '');
const replay = fs.readFileSync(path.join(ROOT, 'tools/replay.mjs'), 'utf8')
  .split('if (process.argv[1]')[0]
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '');

const levels = [];
const add = (dir, label) => {
  const answers = JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'));
  for (const f of Object.keys(answers)) {
    const lv = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    levels.push({ id: label(f.replace('.json', '')), level: lv, answer: answers[f] });
  }
};
add(path.join(ROOT, 'task2/levels'), (n) => `예시 레벨 ${parseInt(n, 10)}`);
add(path.join(ROOT, 'hidden/task2/levels'), (n) => n);

// 확대 창 범례
const icon = (body) => `<svg width="18" height="18" viewBox="0 0 18 18">${body}</svg>`;
const CELLS = [
  [icon('<rect x="1" y="1" width="16" height="16" fill="#fff" stroke="#d1d5db"/>'), '역 안'],
  [icon('<rect x="1" y="1" width="16" height="16" fill="#f6f6f3" stroke="#d1d5db"/>'), '거리'],
  [icon('<rect x="1" y="1" width="16" height="16" fill="#d1d5db"/>'), '벽'],
  [icon('<rect x="1" y="1" width="16" height="16" fill="#fff" stroke="#d1d5db"/><rect x="5" y="4" width="2" height="10" fill="#6b7280"/><rect x="11" y="4" width="2" height="10" fill="#6b7280"/>'), '개찰구'],
  [icon('<circle cx="9" cy="9" r="7" fill="#00A84D"/><text x="9" y="12" font-size="9" font-weight="bold" text-anchor="middle" fill="#fff">2</text>'), '승강장'],
  [icon('<path d="M5 4l5 5-5 5M9 4l5 5-5 5" fill="none" stroke="#6b7280" stroke-width="1.8"/>'), '에스컬레이터'],
  [icon('<rect x="2" y="2" width="14" height="14" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3 2"/>'), '강제 퇴장 칸'],
];

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>막차 러너</title>
<style>
:root{--bg:#f6f5f1;--fg:#1f2328;--muted:#6b7280;--card:#fff;--line:#e5e7eb}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e8e6e1;--muted:#9aa0a6;--card:#161b22;--line:#30363d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',system-ui,sans-serif}
main{max-width:1420px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--muted);margin:0 0 12px}
a{color:#2563eb}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
select,button{font:inherit;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 436px;gap:16px;align-items:start}
@media (max-width:1100px){.layout{grid-template-columns:minmax(0,1fr) 320px}}
@media (max-width:760px){.layout{grid-template-columns:minmax(0,1fr)}.panel{position:static}}
#map svg{display:block;width:100%;height:auto}
.panel{position:sticky;top:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
h2{font-size:13px;color:var(--muted);margin:10px 0 6px;font-weight:600}
h2:first-child{margin-top:0}
#inset{display:block;width:100%;height:auto;border-radius:8px}
.cells{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--muted);font-size:12px;margin-top:6px}
.cells span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.best{color:var(--muted);margin:0}
#msg{min-height:20px;margin:4px 0 0;font-weight:600}
#trains{display:flex;flex-wrap:wrap;gap:6px}
#trains .none{color:var(--muted);font-size:13px}
.tb{display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;border-color:var(--c)}
.no{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:var(--c);color:#fff;font-weight:700;font-size:11px;font-style:normal}
.keys{color:var(--muted);font-size:13px;margin:10px 0 0}
code{border:1px solid var(--line);border-radius:4px;padding:0 4px;word-break:break-all}
</style></head><body><main>
<h1>🚇 막차 러너</h1>
<p class="sub">승객을 가장 빨리, 그다음 가장 싸게 도착 지점까지. 규칙: <a href="https://github.com/kyungchan3007/advisor-bench/blob/main/task2/docs/rules.md">rules.md</a></p>
<div class="bar"><select id="pick"></select><button id="reset">처음부터</button><button id="undo">되돌리기</button><button id="replay">▶ 정답 재생</button></div>
<div class="layout">
<div id="map"></div>
<aside class="panel">
<p class="best">최적 기록 <b id="goal"></b></p>
<div id="msg"></div>
<h2>지금 탈 수 있는 열차</h2><div id="trains"></div>
<h2>승객 주변 칸</h2><canvas id="inset"></canvas>
<div class="cells">${CELLS.map(([i, t]) => `<span>${i}${t}</span>`).join('')}</div>
<p class="keys">방향키 이동 · 스페이스 대기 · 승강장에 열차가 서면 위 버튼으로 탑승</p>
<p class="keys">내 행동: <code id="acts"></code></p>
</aside>
</div>
</main>
<script>
${engine}
${replay}
const LEVELS = ${JSON.stringify(levels)};
const $ = (id) => document.getElementById(id);
const pick = $('pick'), cv = $('inset'), ctx = cv.getContext('2d');
LEVELS.forEach((l, i) => { const o = document.createElement('option'); o.value = i; o.textContent = l.id; pick.appendChild(o); });
let cur, L, ans, acts = '', replayTimer = null, insetTimer = null;

function load(i) {
  stopReplay(); cur = LEVELS[i]; L = parseLevel(cur.level); acts = '';
  ans = cur.answer === '불가' ? null : simulate(L, cur.answer);
  $('goal').textContent = ans ? ans.tick + '틱 · ' + ans.fare.toLocaleString('en-US') + '원' : '도착 불가';
  show(0);
}
function live(a) {
  // 목적지 전까지의 상태도 보려고, 목표 대신 마지막 위치 기준으로 다시 돌린다
  const goal = L.goal; L.goal = [-1, -1]; const s = simulate(L, a); L.goal = goal; return s;
}
function curSim() {
  if (!acts) return { ok: false, live: true, tick: 0, trace: [{ t: 0, r: L.start[0], c: L.start[1], ev: 'start' }] };
  const fin = simulate(L, acts);
  return fin.ok ? fin : { ...live(acts), ok: false, live: true };
}
// README 그림을 그대로 넣고, from틱부터 재생한다
function paint(actions, title, sim, from) {
  const crop = ans ? ans.trace : [];
  $('map').innerHTML = renderReplay(cur.level, actions, title, { sim, crop }).svg;
  $('map').querySelector('svg').setCurrentTime(from * TICK_S);
}
function show(from) {
  const sim = curSim(), tr = sim.trace;
  paint(acts, cur.id + ' · 직접 하기', sim, from === undefined ? tr.at(-1).t : from);
  drawInset(tr);
  $('acts').textContent = acts || '(없음)';
  const msg = $('msg'); msg.style.color = '';
  if (sim.ok) {
    const best = ans && sim.tick === ans.tick && sim.fare === ans.fare;
    msg.textContent = best ? '🎉 최적 풀이와 같은 기록!' : '도착! 최적 기록과 비교해 보세요';
    msg.style.color = best ? GOAL : '';
  } else msg.textContent = '';
  trains(sim);
}
function trains(sim) {
  const tr = sim.trace, p = tr.at(-1), box = $('trains'); box.innerHTML = '';
  let paid = false; for (const x of tr) { if (x.ev === 'enter') paid = true; if (x.ev === 'exit' || x.ev === 'evict') paid = false; }
  if (paid && !sim.ok) for (const { line, i } of L.platforms.get(p.r * L.W + p.c) || []) {
    const d = p.t - line.cum[i];
    if (d < line.first || d > line.last || (d - line.first) % line.headway) continue;
    const seen = new Set();
    line.stations.slice(i + 1).forEach((st) => {
      if (seen.has(st.name)) return; seen.add(st.name);
      const b = document.createElement('button'); b.className = 'tb'; b.style.setProperty('--c', line.color);
      b.innerHTML = '<i class="no" style="--c:' + line.color + '">' + lineNo(line.id) + '</i>' + st.name + '에서 내리기';
      b.onclick = () => step('[' + line.id + '>' + st.name + ']'); box.appendChild(b);
    });
  }
  if (!box.children.length) box.innerHTML = '<span class="none">' + (sim.ok ? '도착했어요' : paid ? '여기 서는 열차가 없어요' : '개찰구 안으로 들어가야 탈 수 있어요') + '</span>';
}

// 승객 주변 칸 확대
const IC = 18, VW = 23, VH = 15;
function drawInset(tr) {
  const dpr = window.devicePixelRatio || 1, p = tr.at(-1);
  cv.width = VW * IC * dpr; cv.height = VH * IC * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c0 = Math.max(0, Math.min(L.W - VW, p.c - (VW >> 1))), r0 = Math.max(0, Math.min(L.H - VH, p.r - (VH >> 1)));
  ctx.fillStyle = '#f6f6f3'; ctx.fillRect(0, 0, VW * IC, VH * IC);
  ctx.translate(-c0 * IC, -r0 * IC);
  const mid = (r, c) => [c * IC + IC / 2, r * IC + IC / 2];
  for (let r = r0; r < Math.min(L.H, r0 + VH); r++) for (let c = c0; c < Math.min(L.W, c0 + VW); c++) {
    const ch = L.grid[r][c], x = c * IC, y = r * IC;
    ctx.fillStyle = ch === '#' ? '#d1d5db' : ',SE'.includes(ch) ? '#f6f6f3' : '#ffffff'; ctx.fillRect(x, y, IC, IC);
    ctx.strokeStyle = '#eceef1'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, IC - 1, IC - 1);
    if (ch === 'G') { ctx.fillStyle = '#6b7280'; ctx.fillRect(x + 5, y + 4, 2, IC - 8); ctx.fillRect(x + IC - 7, y + 4, 2, IC - 8); }
    if ('<>^v'.includes(ch)) {
      ctx.save(); ctx.translate(x + IC / 2, y + IC / 2); ctx.rotate({ '>': 0, 'v': Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 }[ch]);
      ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(-4, -4); ctx.lineTo(0, 0); ctx.lineTo(-4, 4); ctx.moveTo(1, -4); ctx.lineTo(5, 0); ctx.lineTo(1, 4); ctx.stroke(); ctx.restore();
    }
  }
  for (const room of L.rooms) if (room.close < 9999) {
    ctx.setLineDash([3, 2]); ctx.strokeStyle = EVICT; ctx.lineWidth = 1.5;
    ctx.strokeRect(room.evict[1] * IC + 2, room.evict[0] * IC + 2, IC - 4, IC - 4); ctx.setLineDash([]);
  }
  const plat = new Map();
  for (const ln of L.lines) for (const s of ln.stations) { const k = s.at[0] * L.W + s.at[1]; if (!plat.has(k)) plat.set(k, new Map()); plat.get(k).set(lineNo(ln.id), ln.color); }
  for (const [k, m] of plat) {
    const [cx, cy] = mid(Math.floor(k / L.W), k % L.W), list = [...m];
    list.forEach(([no, color], i) => mark(cx + (i - (list.length - 1) / 2) * 10, cy, color, no, list.length > 1 ? 6 : 7.5));
  }
  ctx.lineCap = 'round'; ctx.setLineDash([0.1, 5]); ctx.strokeStyle = WALK; ctx.lineWidth = 3;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (b.ev === 'ride' || b.ev === 'evict' || b.ev === 'wait') continue;
    ctx.beginPath(); ctx.moveTo(...mid(a.r, a.c)); ctx.lineTo(...mid(b.r, b.c)); ctx.stroke();
  }
  ctx.setLineDash([]);
  tag(mid(...L.start), START, '출발'); tag(mid(...L.goal), GOAL, '도착');
  for (const room of L.rooms) {
    const [r, c0r, , c1r] = room.rect, shut = room.close < 9999 && p.t >= room.close;
    label(((c0r + c1r + 1) / 2) * IC, r * IC, room.name + (room.close < 9999 ? (shut ? ' · 폐쇄됨' : ' · ' + room.close + '틱 폐쇄') : ''), shut ? EVICT : INK);
  }
  const [x, y] = mid(p.r, p.c);
  ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fde047'; ctx.stroke();
}
function mark(x, y, color, no, rad) {
  ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (no.length > 1 ? rad * 1.05 : rad * 1.3) + 'px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(no, x, y + 0.5);
}
function tag([x, y], color, text) {
  ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fillStyle = color; ctx.fill();
  ctx.font = 'bold 11px ' + FONT; const w = ctx.measureText(text).width + 10;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y + 7, w, 15, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 15);
}
function label(x, y, text, color) {
  ctx.font = 'bold 11px ' + FONT; const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x - w / 2, y - 7, w, 15);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
}

// 조작
function step(tok) {
  stopReplay();
  const before = curSim();
  if (before.ok) { show(); $('msg').textContent = '이미 도착했어요. 처음부터 다시 해 보세요'; return; }
  const next = live(acts + tok);
  if (next.ok === false && next.error && !/goal/.test(next.error)) { show(); $('msg').textContent = '⚠️ ' + next.error; $('msg').style.color = EVICT; return; }
  acts += tok;
  show(before.trace.at(-1).t);
}
function stopReplay() { clearInterval(insetTimer); if (replayTimer) { clearTimeout(replayTimer); replayTimer = null; } $('replay').textContent = '▶ 정답 재생'; }
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  const k = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', ' ': 'W' }[e.key];
  if (k) { e.preventDefault(); step(k); }
});
pick.onchange = () => { load(pick.value); pick.blur(); };
$('reset').onclick = () => { stopReplay(); acts = ''; show(0); };
$('undo').onclick = () => { stopReplay(); const t = tokenize(acts); t.pop(); acts = t.map((x) => x.move || '[' + x.line + '>' + x.to + ']').join(''); show(); };
$('replay').onclick = () => {
  if (replayTimer) { stopReplay(); show(); return; }
  if (!ans) { $('msg').textContent = '이 레벨은 도착할 수 없는 게 정답이에요'; return; }
  paint(cur.answer, cur.id + ' · 정답 재생', undefined, 0);
  $('replay').textContent = '■ 멈춤';
  $('trains').innerHTML = '<span class="none">정답 재생 중</span>';
  const svg = $('map').querySelector('svg');
  insetTimer = setInterval(() => { const t = svg.getCurrentTime() / TICK_S; drawInset(ans.trace.filter((x) => x.t <= t)); }, 100);
  replayTimer = setTimeout(() => { stopReplay(); trains(curSim()); }, ans.tick * TICK_S * 1000);
};
load(0);
</script></body></html>
`;
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/index.html'), html);
console.log('docs/index.html', levels.length, 'levels');
