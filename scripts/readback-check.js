const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Core = require('../core.js');

const skinPath = path.join(process.argv[2], 'Skins', 'DeskflowVerification', 'DeskflowTodo.ini');
const bytes = fs.readFileSync(skinPath);
assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe], 'Rainmeter preserves Unicode file encoding');
const text = Core.decodeSkinBytes(bytes);
assert.ok(text.includes('验证中文、勾选与刷新'), 'Rainmeter preserves Chinese labels when writing progress');
const current = [
  { id: 'qa-first', text: '网页中的任务', done: true },
  { id: 'qa-second', text: '网页中的已完成任务', done: true },
  { id: 'qa-third', text: '网页中的未完成任务', done: false }
];
const readback = Core.mergeSkinProgress(text, current);
assert.equal(readback.matched, 3);
assert.equal(readback.changed, 1);
assert.deepEqual(readback.items.map(item => item.done), [false, true, false]);
console.log('Actual Rainmeter file -> Deskflow progress read-back: passed');
