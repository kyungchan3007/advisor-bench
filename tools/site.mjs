// 직접 해 보는 막차 러너 페이지(docs/index.html)를 만든다. GitHub Pages로 연다.
//   node tools/site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = fs.readFileSync(path.join(ROOT, 'hidden/task2/engine.mjs'), 'utf8').replace(/^export /gm, '');

const levels = [];
const add = (dir, prefix) => {
  const answers = JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'));
  for (const f of Object.keys(answers)) {
    const lv = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    levels.push({ id: `${prefix}${f.replace('.json', '')}`, level: lv, answer: answers[f] });
  }
};
add(path.join(ROOT, 'task2/levels'), '예시 ');
add(path.join(ROOT, 'hidden/task2/levels'), '숨은 ');

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>막차 러너</title>
<style>
:root{--bg:#faf8f3;--fg:#1f2328;--muted:#6b7280;--card:#fff;--line:#e5e1d6}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#e8e6e1;--muted:#9aa0a6;--card:#1f2228;--line:#2e323a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 12px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
select,button{font:inherit;padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
#wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--card)}
canvas{display:block}
.hud{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0;font-variant-numeric:tabular-nums}
.hud b{font-size:16px}#msg{min-height:22px;color:var(--muted)}
#trains button{margin:2px}
.keys{color:var(--muted);font-size:13px}
code{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:0 4px;word-break:break-all}
</style></head><body><main>
<h1>🚇 막차 러너</h1>
<p class="sub">승객을 가장 빨리, 그다음 가장 싸게 목적지 출구(초록)까지. 규칙: <a href="https://github.com/kyungchan3007/advisor-bench/blob/main/task2/docs/rules.md">rules.md</a></p>
<div class="bar"><select id="pick"></select><button id="reset">처음부터</button><button id="undo">되돌리기</button><button id="replay">정답 재생</button></div>
<div class="hud"><span>틱 <b id="tick">0</b></span><span>요금 <b id="fare">0</b>원</span><span>승차 <b id="rides">0</b></span><span>구역 <b id="area">밖</b></span><span>목표 정답 <b id="goal"></b></span></div>
<div id="trains"></div><div id="msg"></div>
<div id="wrap"><canvas id="cv"></canvas></div>
<p class="keys">방향키 이동 · 스페이스 대기 · 승강장에서 열차가 서면 위 버튼으로 탑승</p>
<p>내 행동 문자열: <code id="acts"></code></p>
</main>
<script>
${engine}
const LEVELS = ${JSON.stringify(levels)};
const C = 14;
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const pick = document.getElementById('pick');
LEVELS.forEach((l, i) => { const o = document.createElement('option'); o.value = i; o.textContent = l.id + ' · ' + l.level.name; pick.appendChild(o); });
let cur, L, acts = '', anim = null;
function load(i) { cur = LEVELS[i]; L = parseLevel(cur.level); acts = ''; stopAnim(); draw(); }
function state() { return acts ? simulate(L, acts) : { ok: false, tick: 0, trace: [{ t: 0, r: L.start[0], c: L.start[1] }], fare: 0, boardings: 0 }; }
function live(a) {
  // 목적지 전까지의 상태도 보려고, 목표 대신 마지막 위치 기준으로 다시 돌린다
  const goal = L.goal; L.goal = [-1, -1]; const s = simulate(L, a); L.goal = goal; return s;
}
function draw(trace) {
  cv.width = L.W * C; cv.height = L.H * C;
  const col = { '#': '#2b2f36', ',': '#e9e4d8', '.': '#f7f3ea', 'G': '#d9534f', 'S': '#3b82f6', 'E': '#16a34a', 'P': '#f7f3ea' };
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    const ch = L.grid[r][c]; ctx.fillStyle = col[ch] || '#fde68a'; ctx.fillRect(c * C, r * C, C, C);
    if ('<>^v'.includes(ch)) { ctx.fillStyle = '#92400e'; ctx.font = '11px sans-serif'; ctx.fillText(ch, c * C + 3, r * C + 11); }
  }
  for (const ln of L.lines) for (const s of ln.stations) { ctx.fillStyle = ln.color; ctx.fillRect(s.at[1] * C + 2, s.at[0] * C + 2, C - 4, C - 4); }
  const s = trace ? { trace } : (acts ? live(acts) : null);
  const tr = s && s.trace ? s.trace : [{ t: 0, r: L.start[0], c: L.start[1] }];
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    ctx.strokeStyle = b.ev === 'ride' ? (L.lines.find(l => l.id === b.line) || {}).color : b.ev === 'evict' ? '#dc2626' : '#d4a017';
    ctx.setLineDash(b.ev === 'evict' ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(a.c * C + C / 2, a.r * C + C / 2); ctx.lineTo(b.c * C + C / 2, b.r * C + C / 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  const p = tr.at(-1); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(p.c * C + C / 2, p.r * C + C / 2, 5, 0, 7); ctx.fill();
  hud(s, p);
}
function hud(s, p) {
  const fin = acts ? simulate(L, acts) : null;
  document.getElementById('tick').textContent = p.t;
  document.getElementById('rides').textContent = (acts.match(/\\[/g) || []).length;
  document.getElementById('fare').textContent = fin && fin.ok ? fin.fare.toLocaleString() : '–';
  document.getElementById('acts').textContent = acts || '(없음)';
  const ans = cur.answer === '불가' ? null : simulate(L, cur.answer);
  document.getElementById('goal').textContent = ans ? ans.tick + '틱 · ' + ans.fare.toLocaleString() + '원' : '불가';
  const msg = document.getElementById('msg');
  if (fin && fin.ok) msg.textContent = fin.tick === ans.tick && fin.fare === ans.fare ? '🎉 최적 풀이와 같은 기록!' : '도착! 정답: ' + ans.tick + '틱 · ' + ans.fare.toLocaleString() + '원';
  else if (s && s.ok === false && s.error && s.error !== 'not at goal') msg.textContent = '⚠️ ' + s.error; else msg.textContent = '';
  // 안/밖 표시 · 지금 탈 수 있는 열차
  let paid = false; if (s && s.trace) for (const x of s.trace) { if (x.ev === 'enter') paid = true; if (x.ev === 'exit') paid = false; }
  document.getElementById('area').textContent = paid ? '안' : '밖';
  const box = document.getElementById('trains'); box.innerHTML = '';
  if (!paid) return;
  for (const { line, i } of L.platforms.get(p.r * L.W + p.c) || []) {
    const d = p.t - line.cum[i];
    if (d < line.first || d > line.last || (d - line.first) % line.headway) continue;
    line.stations.slice(i + 1).forEach((st) => {
      const b = document.createElement('button'); b.textContent = line.id + ' → ' + st.name; b.style.borderColor = line.color;
      b.onclick = () => step('[' + line.id + '>' + st.name + ']'); box.appendChild(b);
    });
  }
}
function step(tok) { stopAnim(); const next = acts + tok; const s = live(next); if (s.ok === false && s.error && !/goal/.test(s.error)) { document.getElementById('msg').textContent = '⚠️ ' + s.error; return; } acts = next; draw(); }
function stopAnim() { if (anim) { clearInterval(anim); anim = null; } }
document.addEventListener('keydown', (e) => {
  const k = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', ' ': 'W' }[e.key];
  if (k) { e.preventDefault(); step(k); }
});
pick.onchange = () => load(pick.value);
document.getElementById('reset').onclick = () => { acts = ''; stopAnim(); draw(); };
document.getElementById('undo').onclick = () => { const t = tokenize(acts); t.pop(); acts = t.map(x => x.move || '[' + x.line + '>' + x.to + ']').join(''); draw(); };
document.getElementById('replay').onclick = () => {
  if (cur.answer === '불가') return; stopAnim(); acts = '';
  const full = simulate(L, cur.answer).trace; let k = 1;
  anim = setInterval(() => { draw(full.slice(0, ++k)); if (k >= full.length) stopAnim(); }, 120);
};
load(0);
</script></body></html>
`;
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/index.html'), html);
console.log('docs/index.html', levels.length, 'levels');
