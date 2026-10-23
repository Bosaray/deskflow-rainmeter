const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../core.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('all local page assets exist and scripts remain usable from file URLs', () => {
  const assets = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)];
  assert.equal(assets.length, 3);
  for (const [, filename] of assets) assert.ok(fs.existsSync(path.join(root, filename)), filename);
  assert.equal(html.includes('type="module"'), false);
});

test('static element IDs are unique and all UI element IDs used by app.js exist', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const [, id] of script.matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)) assert.ok(ids.includes(id), 'missing UI element: ' + id);
});

test('the shipped example backup remains compatible with the current importer', () => {
  const example = fs.readFileSync(path.join(root, 'examples/study-plan.json'), 'utf8');
  const result = Core.parseBackup(example);
  assert.equal(result.draft.items.length, 3);
  assert.equal(result.draft.title, '学习与生活');
});

test('package and generated skin versions agree', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, Core.VERSION);
  assert.ok(Core.generateIni({ items: [] }).includes('Version=' + pkg.version));
});
