// 직접 해 보는 막차 러너 페이지(docs/index.html)를 만든다. GitHub Pages로 연다.
//   node tools/site.mjs
// README 재생 그림(tools/replay.mjs)과 같은 모습: 호선 배지 · 역 이름 · 열차 · 승객, 오른쪽은 길찾기 앱식 풀이 요약
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

// 기호 범례 아이콘 (README 그림과 같은 모양)
const icon = (body, w = 28) => `<svg width="${w}" height="18" viewBox="0 0 ${w} 18">${body}</svg>`;
const SYMBOLS = [
  [icon('<rect x="5" y="1" width="16" height="16" fill="#00A84D" fill-opacity=".18"/><circle cx="13" cy="9" r="6" fill="#00A84D"/><text x="13" y="12" font-size="8" font-weight="bold" text-anchor="middle" fill="#fff">2</text>'), '승강장'],
  [icon('<rect x="2" y="3" width="24" height="12" rx="3" fill="#fff" stroke="#9ca3af" stroke-width="1.5"/>'), '역 건물'],
  [icon('<rect x="6" y="1" width="16" height="16" fill="#fff" stroke="#e5e7eb"/><rect x="9" y="4" width="2" height="10" fill="#6b7280"/><rect x="17" y="4" width="2" height="10" fill="#6b7280"/>'), '개찰구'],
  [icon('<path d="M10 4l5 5-5 5M15 4l5 5-5 5" fill="none" stroke="#a8a29e" stroke-width="1.8"/>'), '에스컬레이터'],
  [icon('<g transform="translate(17 9)"><rect x="-15" y="-8" width="30" height="16" rx="6" fill="#00A84D" stroke="#fff" stroke-width="1.5"/><rect x="-11" y="-4" width="5" height="4" rx="1" fill="#fff"/><rect x="6" y="-4" width="5" height="4" rx="1" fill="#fff"/><text x="0" y="4" font-size="10" font-weight="bold" text-anchor="middle" fill="#fff">2</text></g>', 34), '열차'],
  [icon('<line x1="2" y1="9" x2="26" y2="9" stroke="#4b5563" stroke-width="3" stroke-dasharray="0.1 5" stroke-linecap="round"/>'), '걸어간 길'],
  [icon('<line x1="2" y1="9" x2="26" y2="9" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="5 4"/>'), '역 폐쇄로 쫓겨남'],
  [icon('<rect x="7" y="2" width="14" height="14" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3 2"/>'), '강제 퇴장 칸'],
  [icon('<circle cx="14" cy="9" r="6" fill="#1f2328" stroke="#fde047" stroke-width="3"/>'), '승객'],
  [icon('<circle cx="8" cy="9" r="5" fill="#2563eb" stroke="#fff" stroke-width="2"/><circle cx="20" cy="9" r="5" fill="#16a34a" stroke="#fff" stroke-width="2"/>'), '출발 · 도착'],
];

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>막차 러너</title>
<style>
:root{--bg:#f6f5f1;--fg:#1f2328;--muted:#6b7280;--card:#fff;--line:#e5e1d6;--soft:#f3f4f6}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#e8e6e1;--muted:#9aa0a6;--card:#1f2228;--line:#2e323a;--soft:#272b33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',system-ui,sans-serif}
main{max-width:1280px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--muted);margin:0 0 12px}
a{color:#2563eb}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
select,button{font:inherit;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
button:hover{border-color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;color:var(--muted);font-size:13px;margin:6px 0 10px}
.legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.no{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:var(--c);color:#fff;font-weight:700;font-size:11px;border:1.5px solid #fff}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
@media (max-width:900px){.layout{grid-template-columns:1fr}}
#wrap{overflow:auto;max-height:78vh;border:1px solid var(--line);border-radius:12px;background:#eeece6}
canvas{display:block}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-variant-numeric:tabular-nums}
.stats div{background:var(--soft);border-radius:8px;padding:6px 4px;text-align:center}
.stats small{display:block;color:var(--muted);font-size:11px}.stats b{font-size:16px}
.best{color:var(--muted);font-size:13px;margin:8px 0 0}
#msg{min-height:20px;margin:6px 0;font-weight:600}
h2{font-size:13px;color:var(--muted);margin:12px 0 6px;font-weight:600}
#trains{display:flex;flex-wrap:wrap;gap:6px}
#trains .none{color:var(--muted);font-size:13px}
.tb{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-color:var(--c)}
.seg{display:flex;height:22px;border-radius:999px;overflow:hidden;background:var(--soft)}
.seg div{display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;min-width:2px}
ol{list-style:none;margin:10px 0 0;padding:0;max-height:46vh;overflow:auto}
li{position:relative;padding:0 0 12px 30px}
li:before{content:'';position:absolute;left:10px;top:18px;bottom:-2px;border-left:2px dotted #9ca3af}
li:last-child:before{display:none}
li.ride:before{border-left:4px solid var(--c);left:9px}
li .dot{position:absolute;left:3px;top:2px;width:16px;height:16px;border-radius:50%;background:var(--c,#9ca3af);border:3px solid var(--card);box-shadow:0 0 0 1px var(--line)}
li .no{position:absolute;left:0;top:0}
li small{display:block;color:var(--muted)}
.keys{color:var(--muted);font-size:13px}
code{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:0 4px;word-break:break-all}
</style></head><body><main>
<h1>🚇 막차 러너</h1>
<p class="sub">승객을 가장 빨리, 그다음 가장 싸게 <b style="color:#16a34a">도착</b> 지점까지. 규칙: <a href="https://github.com/kyungchan3007/advisor-bench/blob/main/task2/docs/rules.md">rules.md</a></p>
<div class="bar"><select id="pick"></select><button id="reset">처음부터</button><button id="undo">되돌리기</button><button id="replay">▶ 정답 재생</button></div>
<div class="legend" id="lines"></div>
<div class="layout">
<div id="wrap"><canvas id="cv"></canvas></div>
<aside class="panel">
<div class="stats"><div><small>틱</small><b id="tick">0</b></div><div><small>요금</small><b id="fare">–</b></div><div><small>승차</small><b id="rides">0</b></div><div><small>구역</small><b id="area">밖</b></div></div>
<p class="best">최적 기록 <b id="goal"></b></p>
<div id="msg"></div>
<h2>지금 탈 수 있는 열차</h2><div id="trains"></div>
<h2 id="routeTitle">내 풀이</h2><div class="seg" id="seg"></div><ol id="steps"></ol>
</aside>
</div>
<div class="legend">${SYMBOLS.map(([i, t]) => `<span>${i}${t}</span>`).join('')}</div>
<p class="keys">방향키 이동 · 스페이스 대기 · 승강장에서 열차가 서면 오른쪽 버튼으로 탑승 · 칸 크기는 실제 축척이 아님</p>
<p>내 행동 문자열: <code id="acts"></code></p>
</main>
<script>
${engine}
const LEVELS = ${JSON.stringify(levels)};
let C = 16; // 칸 크기: 레벨 폭에 맞춘다
const INK = '#1f2328', WALK = '#4b5563', EVICT = '#dc2626', START = '#2563eb', GOAL = '#16a34a';
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";
const FLOOR = { '#': '#dcd8cf', ',': '#eeece6', 'S': '#eeece6', 'E': '#eeece6' };
const lineNo = (id) => id.replace(/[상하외내]$/, '');
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const wrap = document.getElementById('wrap');
const pick = document.getElementById('pick');
const $ = (id) => document.getElementById(id);
LEVELS.forEach((l, i) => { const o = document.createElement('option'); o.value = i; o.textContent = l.id + ' · ' + l.level.name; pick.appendChild(o); });
let cur, L, G, ans, acts = '', anim = null, shownT = 0;

function load(i) {
  stopAnim(); cur = LEVELS[i]; L = parseLevel(cur.level); acts = '';
  ans = cur.answer === '불가' ? null : simulate(L, cur.answer);
  C = Math.max(16, Math.min(24, Math.floor((wrap.clientWidth - 2) / L.W)));
  G = geom();
  const dpr = window.devicePixelRatio || 1;
  cv.width = L.W * C * dpr; cv.height = L.H * C * dpr;
  cv.style.width = L.W * C + 'px'; cv.style.height = L.H * C + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 노선 범례
  const seen = new Map();
  for (const ln of L.lines) if (!seen.has(lineNo(ln.id))) seen.set(lineNo(ln.id), ln.color);
  $('lines').innerHTML = [...seen].sort((a, b) => a[0] - b[0]).map(([no, c]) => '<span><i class="no" style="--c:' + c + '">' + no + '</i>' + no + '호선</span>').join('');
  show();
}

// 칸 중심 · 선로 · 승강장 배지
const ctr = (r, c) => [c * C + C / 2, r * C + C / 2];
function geom() {
  const tracks = new Map(), plat = new Map();
  for (const ln of L.lines) {
    const no = lineNo(ln.id);
    ln.stations.forEach((s, i) => {
      const k = s.at[0] * L.W + s.at[1];
      if (!plat.has(k)) plat.set(k, new Map());
      plat.get(k).set(no, ln.color);
      const nx = ln.stations[i + 1];
      if (!nx) return;
      const ka = k, kb = nx.at[0] * L.W + nx.at[1];
      tracks.set(no + ':' + Math.min(ka, kb) + ':' + Math.max(ka, kb), { color: ln.color, a: ctr(...s.at), b: ctr(...nx.at) });
    });
  }
  return { tracks: [...tracks.values()], plat };
}

// 열차 구간: 탄 역부터 내린 역까지 서는 역 목록과 시각
function ridePts(a, b) {
  if (b._pts) return b._pts;
  const ln = L.lines.find((l) => l.id === b.line);
  for (const { line, i } of L.platforms.get(a.r * L.W + a.c) || []) {
    if (line !== ln) continue;
    const j = ln.stations.findIndex((s, k) => k > i && s.name === b.to);
    if (j < 0 || ln.cum[j] - ln.cum[i] !== b.t - a.t) continue;
    const pts = [];
    for (let k = i; k <= j; k++) pts.push({ p: ctr(...ln.stations[k].at), t: a.t + ln.cum[k] - ln.cum[i], name: ln.stations[k].name });
    return (b._pts = { line: ln, no: lineNo(ln.id), pts, km: ln.kmc[j] - ln.kmc[i] });
  }
  return (b._pts = { line: ln, no: lineNo(ln.id), pts: [{ p: ctr(a.r, a.c), t: a.t, name: '' }, { p: ctr(b.r, b.c), t: b.t, name: b.to }], km: 0 });
}
const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
function alongRide(R, t) {
  const P = R.pts;
  for (let k = 1; k < P.length; k++) if (t <= P[k].t) return lerp(P[k - 1].p, P[k].p, P[k].t === P[k - 1].t ? 1 : (t - P[k - 1].t) / (P[k].t - P[k - 1].t));
  return P.at(-1).p;
}

// 그리기
function render(trace, tNow) {
  const tr = trace || curTrace();
  if (tNow === undefined) tNow = tr.at(-1).t;
  ctx.font = '11px ' + FONT;
  ctx.clearRect(0, 0, L.W * C, L.H * C);
  drawCells();
  ctx.globalAlpha = 0.28; ctx.lineCap = 'round'; ctx.lineWidth = 5;
  for (const s of G.tracks) { ctx.strokeStyle = s.color; ctx.beginPath(); ctx.moveTo(...s.a); ctx.lineTo(...s.b); ctx.stroke(); }
  ctx.globalAlpha = 1;
  drawRooms(tNow);
  drawPlatforms();
  drawPath(tr, tNow);
  pin(L.start, START, '출발'); pin(L.goal, GOAL, '도착');
  drawLabels(tNow);
  const me = posAt(tr, tNow);
  if (me.ride) train(me.p, me.ride.line.color, me.ride.no);
  else { ctx.beginPath(); ctx.arc(me.p[0], me.p[1], 6, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fde047'; ctx.stroke(); }
  return me;
}
function drawCells() {
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    const ch = L.grid[r][c], x = c * C, y = r * C;
    ctx.fillStyle = FLOOR[ch] || '#ffffff'; ctx.fillRect(x, y, C, C);
    if (ch === 'G') { ctx.fillStyle = '#6b7280'; ctx.fillRect(x + 4, y + 3, 2, C - 6); ctx.fillRect(x + C - 6, y + 3, 2, C - 6); }
    if ('<>^v'.includes(ch)) {
      const ang = { '>': 0, 'v': Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 }[ch];
      ctx.save(); ctx.translate(x + C / 2, y + C / 2); ctx.rotate(ang);
      ctx.strokeStyle = '#a8a29e'; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(-4, -4); ctx.lineTo(0, 0); ctx.lineTo(-4, 4); ctx.moveTo(1, -4); ctx.lineTo(5, 0); ctx.lineTo(1, 4); ctx.stroke(); ctx.restore();
    }
  }
}
const closed = (room, t) => room.close < 9999 && t >= room.close;
function drawRooms(t) {
  for (const room of L.rooms) {
    const [r0, c0, r1, c1] = room.rect;
    ctx.beginPath(); ctx.roundRect(c0 * C + 1, r0 * C + 1, (c1 - c0 + 1) * C - 2, (r1 - r0 + 1) * C - 2, 4);
    if (closed(room, t)) { ctx.fillStyle = 'rgba(220,38,38,.10)'; ctx.fill(); }
    ctx.strokeStyle = closed(room, t) ? EVICT : '#9ca3af'; ctx.lineWidth = 1.5; ctx.stroke();
    if (room.close < 9999) {
      const [er, ec] = room.evict;
      ctx.setLineDash([3, 2]); ctx.strokeStyle = EVICT; ctx.lineWidth = 1.5;
      ctx.strokeRect(ec * C + 2, er * C + 2, C - 4, C - 4); ctx.setLineDash([]);
    }
  }
}
function drawPlatforms() {
  for (const [k, m] of G.plat) {
    const r = Math.floor(k / L.W), c = k % L.W, [cx, cy] = ctr(r, c), list = [...m];
    ctx.globalAlpha = 0.18; ctx.fillStyle = list[0][1]; ctx.fillRect(c * C, r * C, C, C); ctx.globalAlpha = 1;
    list.forEach(([no, color], i) => badge(cx + (i - (list.length - 1) / 2) * 9, cy, color, no, list.length > 1 ? 5.5 : 6.5));
  }
}
function badge(x, y, color, no, rad) {
  ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (no.length > 1 ? rad * 1.15 : rad * 1.4) + 'px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(no, x, y + 0.5);
}
function train([x, y], color, no) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.roundRect(-15, -8, 30, 16, 6); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(-11, -4, 5, 4); ctx.fillRect(6, -4, 5, 4);
  ctx.font = 'bold 10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(no, 0, 2);
  ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(12.5, 3, 1.5, 0, 7); ctx.arc(-12.5, 3, 1.5, 0, 7); ctx.fill();
  ctx.restore();
}
function pill(x, y, text, fg, bg, bd) {
  ctx.font = 'bold 11px ' + FONT;
  const w = ctx.measureText(text).width + 12;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 8, w, 16, 8); ctx.fillStyle = bg; ctx.fill();
  if (bd) { ctx.lineWidth = 1.2; ctx.strokeStyle = bd; ctx.stroke(); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
}
function pin([r, c], color, label) {
  const [x, y] = ctr(r, c);
  ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  pill(x, y + 15, label, '#fff', color);
}
function drawLabels(t) {
  for (const room of L.rooms) {
    const [r0, c0, , c1] = room.rect, x = ((c0 + c1 + 1) / 2) * C, y = r0 * C;
    const shut = closed(room, t);
    const text = room.name + (room.close < 9999 ? (shut ? ' · 폐쇄됨' : ' · ' + room.close + '틱 폐쇄') : '');
    pill(x, y, text, shut ? EVICT : INK, '#fff', shut ? EVICT : INK);
  }
}
function drawPath(tr, tNow) {
  ctx.lineCap = 'round';
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (b.t > tNow && a.t >= tNow) break;
    const f = b.t === a.t ? 1 : Math.min(1, (tNow - a.t) / (b.t - a.t));
    const pa = ctr(a.r, a.c), pb = ctr(b.r, b.c);
    if (b.ev === 'ride') {
      const R = ridePts(a, b), end = Math.min(tNow, b.t);
      ctx.strokeStyle = R.line.color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(...R.pts[0].p);
      for (let k = 1; k < R.pts.length; k++) { if (R.pts[k].t > end) { ctx.lineTo(...alongRide(R, end)); break; } ctx.lineTo(...R.pts[k].p); }
      ctx.stroke();
    } else if (b.ev === 'evict') {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = EVICT; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(...pa); ctx.lineTo(...pb); ctx.stroke(); ctx.setLineDash([]);
    } else if (b.ev !== 'wait') {
      ctx.setLineDash([0.1, 5]); ctx.strokeStyle = WALK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(...pa); ctx.lineTo(...lerp(pa, pb, f)); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}
function posAt(tr, t) {
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (b.t <= t) continue;
    if (b.ev === 'ride') { const R = ridePts(a, b); return { p: alongRide(R, t), ride: R }; }
    return { p: lerp(ctr(a.r, a.c), ctr(b.r, b.c), Math.max(0, (t - a.t) / (b.t - a.t))) };
  }
  const z = tr.at(-1);
  return { p: ctr(z.r, z.c) };
}

// 상태 · 오른쪽 패널
function live(a) {
  // 목적지 전까지의 상태도 보려고, 목표 대신 마지막 위치 기준으로 다시 돌린다
  const goal = L.goal; L.goal = [-1, -1]; const s = simulate(L, a); L.goal = goal; return s;
}
function curTrace() { const s = acts ? live(acts) : null; return s && s.trace ? s.trace : [{ t: 0, r: L.start[0], c: L.start[1], ev: 'start' }]; }
function panel(tr, mine) {
  const fin = mine && acts ? simulate(L, acts) : mine ? null : ans;
  const p = tr.at(-1);
  $('tick').textContent = Math.floor(shownT);
  $('rides').textContent = tr.filter((x) => x.ev === 'ride').length;
  $('fare').textContent = fin && fin.ok ? fin.fare.toLocaleString() : '–';
  $('acts').textContent = acts || '(없음)';
  $('goal').textContent = ans ? ans.tick + '틱 · ' + ans.fare.toLocaleString() + '원' : '도착 불가';
  $('routeTitle').textContent = mine ? '내 풀이' : '정답 풀이';
  const msg = $('msg');
  msg.style.color = '';
  if (mine && fin && fin.ok) { const best = ans && fin.tick === ans.tick && fin.fare === ans.fare; msg.textContent = best ? '🎉 최적 풀이와 같은 기록!' : '도착! 최적 기록은 ' + ans.tick + '틱 · ' + ans.fare.toLocaleString() + '원'; msg.style.color = best ? GOAL : ''; }
  else msg.textContent = '';
  let paid = false; for (const x of tr) { if (x.ev === 'enter') paid = true; if (x.ev === 'exit' || x.ev === 'evict') paid = false; }
  $('area').textContent = paid ? '안' : '밖';
  route(tr, fin);
  const box = $('trains'); box.innerHTML = '';
  if (mine && paid) for (const { line, i } of L.platforms.get(p.r * L.W + p.c) || []) {
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
  if (!box.children.length) box.innerHTML = '<span class="none">' + (!mine ? '정답 재생 중' : paid ? '여기 서는 열차가 없어요. 승강장에서 기다려 보세요' : '개찰구 안으로 들어가야 탈 수 있어요') + '</span>';
}
// 길찾기 앱처럼: 구간 막대 + 단계 목록
function route(tr, fin) {
  const seg = [], steps = [{ cls: 'start', c: START, text: '출발' }];
  let walk = 0, wait = 0, lastRoom = -1;
  const flush = () => { if (walk + wait) steps.push({ cls: 'walk', text: '걷기 ' + (walk + wait) + '틱' + (wait ? ' (기다림 ' + wait + '틱 포함)' : '') }); walk = wait = 0; };
  const bar = (kind, n, c, label) => { const l = seg.at(-1); if (l && l.kind === kind && kind !== 'ride') l.n += n; else seg.push({ kind, n, c, label }); };
  const nm = (k) => (k >= 0 ? L.rooms[k].name + '역' : '역');
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i], dt = b.t - a.t;
    if (b.ev === 'wait') { wait += dt; bar('wait', dt, '#d1d5db'); }
    else if (b.ev === 'ride') {
      flush(); const R = ridePts(a, b);
      steps.push({ cls: 'ride', c: R.line.color, no: R.no, text: R.no + '호선 ' + R.pts[0].name + ' → ' + b.to, sub: dt + '틱 · ' + R.km + 'km · ' + Math.max(0, R.pts.length - 2) + '개 역 지나침' });
      bar('ride', dt, R.line.color, R.no);
    } else if (b.ev === 'evict') { flush(); steps.push({ cls: 'evict', c: EVICT, text: nm(lastRoom) + ' 폐쇄 → 강제 퇴장', sub: '그 자리에서 개찰구 밖으로 내보내짐' }); lastRoom = -1; }
    else {
      walk += dt; bar('walk', dt, '#9ca3af');
      const k = L.roomAt[b.r * L.W + b.c];
      if (b.ev === 'enter') { flush(); steps.push({ cls: 'gate', c: '#6b7280', text: nm(k) + ' 개찰구 통과' }); }
      if (b.ev === 'exit') { flush(); steps.push({ cls: 'gate', c: '#6b7280', text: nm(lastRoom) + ' 개찰구로 나감' }); }
    }
    const k = L.roomAt[b.r * L.W + b.c]; if (k >= 0) lastRoom = k;
  }
  flush();
  if (fin && fin.ok) steps.push({ cls: 'goal', c: GOAL, text: '도착 · ' + fin.fare.toLocaleString() + '원', sub: fin.tick + '틱 · 승차 ' + fin.boardings + '번' });
  $('seg').innerHTML = seg.map((s) => '<div style="flex:' + s.n + ';background:' + s.c + '" title="' + (s.kind === 'ride' ? s.label + '호선' : s.kind === 'walk' ? '걷기' : '기다림') + ' ' + s.n + '틱">' + (s.kind === 'ride' && s.n >= 3 ? s.label : '') + '</div>').join('');
  $('steps').innerHTML = steps.map((s) => '<li class="' + s.cls + '"' + (s.c ? ' style="--c:' + s.c + '"' : '') + '>' + (s.no ? '<i class="no" style="--c:' + s.c + '">' + s.no + '</i>' : '<span class="dot"></span>') + s.text + (s.sub ? '<small>' + s.sub + '</small>' : '') + '</li>').join('');
  const ol = $('steps'); ol.scrollTop = ol.scrollHeight;
}

// 화면 갱신 · 애니메이션
function follow(p) {
  const m = 80, x = p[0] - wrap.scrollLeft, y = p[1] - wrap.scrollTop;
  if (x < m || x > wrap.clientWidth - m || y < m || y > wrap.clientHeight - m)
    wrap.scrollTo({ left: p[0] - wrap.clientWidth / 2, top: p[1] - wrap.clientHeight / 2 });
}
function play(tr, from, msPerTick, mine, done) {
  stopAnim();
  const end = tr.at(-1).t; let t0 = null;
  panel(tr, mine);
  const frame = (now) => {
    if (t0 === null) t0 = now;
    shownT = Math.min(end, from + (now - t0) / msPerTick);
    const me = render(tr, shownT); follow(me.p);
    $('tick').textContent = Math.floor(shownT);
    if (shownT < end) anim = requestAnimationFrame(frame); else { anim = null; if (done) done(); }
  };
  anim = requestAnimationFrame(frame);
}
function stopAnim() { if (anim) { cancelAnimationFrame(anim); anim = null; } $('replay').textContent = '▶ 정답 재생'; }
function show() { const tr = curTrace(); shownT = tr.at(-1).t; follow(render(tr).p); panel(tr, true); }
function step(tok) {
  const before = shownT, next = acts + tok, s = live(next);
  if (s.ok === false && s.error && !/goal/.test(s.error)) { stopAnim(); show(); $('msg').textContent = '⚠️ ' + s.error; $('msg').style.color = EVICT; return; }
  acts = next;
  play(s.trace, Math.min(before, s.trace.at(-1).t), 70, true);
}
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  const k = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', ' ': 'W' }[e.key];
  if (k) { e.preventDefault(); step(k); }
});
pick.onchange = () => { load(pick.value); pick.blur(); };
$('reset').onclick = () => { stopAnim(); acts = ''; show(); };
$('undo').onclick = () => { stopAnim(); const t = tokenize(acts); t.pop(); acts = t.map((x) => x.move || '[' + x.line + '>' + x.to + ']').join(''); show(); };
$('replay').onclick = () => {
  if (anim) { stopAnim(); show(); return; }
  if (!ans) { $('msg').textContent = '이 레벨은 도착할 수 없는 게 정답이에요'; return; }
  acts = '';
  play(ans.trace, 0, 220, false, () => { $('replay').textContent = '▶ 정답 재생'; });
  $('replay').textContent = '■ 멈춤';
};
load(0);
</script></body></html>
`;
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/index.html'), html);
console.log('docs/index.html', levels.length, 'levels');
