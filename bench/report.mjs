// 결과 요약 — runs/<runId>/results.jsonl 여러 개를 합쳐 조합별 표를 찍는다
//   node bench/report.mjs runs/full-t1 runs/full-t2
import fs from 'node:fs';
import path from 'node:path';

const rows = process.argv
  .slice(2)
  .flatMap((d) => fs.readFileSync(path.join(d, 'results.jsonl'), 'utf8').trim().split('\n'))
  .map((l) => JSON.parse(l));

const by = new Map();
for (const r of rows) {
  const k = `${r.task} ${r.combo}`;
  if (!by.has(k)) by.set(k, []);
  by.get(k).push(r);
}
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const usd = (x) => `$${x.toFixed(2)}`;

console.log('| 과제 | 조합 | 회 | 정답 | 평균 비용 | Opus | Sonnet | Fable | 평균 시간 | 감독관 | 위임 |');
console.log('|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|');
for (const [k, rs] of by) {
  const [task, combo] = k.split(' ');
  const m = (name) => avg(rs.map((r) => r.costByModel[name] ?? 0));
  console.log(
    `| ${task} | ${combo} | ${rs.length} | ${rs.map((r) => `${r.pass}/${r.total}`).join(' · ')} | ${usd(avg(rs.map((r) => r.costUsd)))} | ${usd(m('opus'))} | ${usd(m('sonnet'))} | ${usd(m('fable'))} | ${Math.round(avg(rs.map((r) => r.durationMs)) / 1000)}s | ${avg(rs.map((r) => r.advisorCalls)).toFixed(1)} | ${avg(rs.map((r) => r.delegations)).toFixed(1)} |`,
  );
}

const fails = rows.filter((r) => r.pass < r.total);
if (fails.length) {
  console.log('\n틀린 실행');
  for (const r of fails) console.log(`- ${r.task} ${r.combo} rep${r.rep}: ${r.failed.join(', ')}`);
}
