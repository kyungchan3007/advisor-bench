// 시드를 돌며 함정 레벨 후보를 찾는다: 기준 풀이와 틀린 가정 풀이의 답이 다른 레벨
//   node hidden/task2/search.mjs 1 200 [blocksR blocksC]
import { buildLevel } from './build.mjs';
import { simulate, solve } from './engine.mjs';
import { randomSpec, themeSpec } from './random.mjs';

const [from, to] = process.argv.slice(2, 4).map(Number);
const opt = JSON.parse(process.argv[4] ?? '{}');
const NAIVE = (opt.naive ?? 'no-evict,no-reentry,no-window,no-last').split(',');
for (let seed = from; seed <= to; seed++) {
  let lv;
  try {
    lv = buildLevel(opt.theme ? themeSpec(opt.theme, seed, opt) : randomSpec(seed, opt));
  } catch {
    continue;
  }
  const t0 = Date.now();
  const ref = solve(lv);
  const ms = Date.now() - t0;
  if (!ref.found) continue;
  if (opt.minRides && (ref.actions.match(/\[/g) ?? []).length < opt.minRides) continue;
  const rides = (ref.actions.match(/\[/g) ?? []).length;
  const exits = simulate(lv, ref.actions).trace.filter((x) => x.ev === 'exit').length;
  const traps = NAIVE.filter((n) => solve(lv, { naive: n }).actions !== ref.actions);
  console.log(JSON.stringify({ seed, tick: ref.tick, fare: ref.fare, rides, exits, traps, ms }));
}
