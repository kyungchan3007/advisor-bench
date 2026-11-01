const { solve } = require('./solver.js');
const fs = require('fs');
const ans = JSON.parse(fs.readFileSync(__dirname + '/levels/answers.json'));
for (const f of Object.keys(ans)) {
  const t = Date.now();
  const r = solve(JSON.parse(fs.readFileSync(__dirname + '/levels/' + f)));
  console.log(f, r === ans[f] ? 'OK' : 'MISMATCH', Date.now() - t + 'ms');
  if (r !== ans[f]) { console.log(' got', r); console.log(' exp', ans[f]); }
}
