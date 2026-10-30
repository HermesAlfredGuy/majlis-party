#!/usr/bin/env node
/** Runs every gate in order and exits non-zero if any fails. */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const files = ['sim.test.js', 'pad-sync.test.js', 'dom-stability.test.js', 'picker.test.js'].filter(f => {
  try { require('fs').accessSync(path.join(__dirname, f)); return true; } catch (e) { return false; }
});
let fails = 0;
for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    process.stdout.write(out);
  } catch (e) {
    fails++;
    if (e.stdout) process.stdout.write(e.stdout);
  }
}
console.log(fails ? `\n${fails} gate(s) failed` : '\nAll gates passed');
process.exit(fails ? 1 : 0);
