"use strict";
const fs = require('fs');
const path = require('path');

const root = 'C:/Users/HP/OneDrive/Documents/zutsav-updated/backend';
const scratch = /^tmp|^\.tmp|^tmpDry|^tmpGround|^tmpExact|^tmpExactAdmin|^\.parity|^ground|^tmpShow|^tmpLoad|^tmpRun|^tmpPatch|^tmpRuntime|^tmpNear|^tmpRender|^tmpShowGround|^tmpRuntimeLoad/i;
const removed = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|\.git|\.next|coverage|dist|build/.test(e.name)) continue;
      walk(full);
    } else if (scratch.test(path.basename(e.name)) && /\.js$/.test(e.name)) {
      removed.push(full);
    }
  }
}
walk(root);
removed.forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
console.log('SWEPT_COUNT=' + removed.length);
console.log(removed.join('\n'));

let left = [];
(function walk2(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|\.git|\.next|coverage|dist|build/.test(e.name)) continue;
      walk2(full);
    } else if (scratch.test(path.basename(e.name)) && /\.js$/.test(e.name)) {
      left.push(full);
    }
  }
})(root);
console.log('\nREMAINING=' + left.length);
console.log(left.join('\n'));
