const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

const tasks = [
  { id: 'first', text: '复习数据结构', done: false, priority: 'high', due: '2026-11-01' },
  { id: 'second', text: '整理项目 README', done: true, priority: 'medium', due: '' },
  { id: 'third', text: '晚上跑步', done: false, priority: 'low', due: '2026-11-02' }
];

function readIni(content) {
  const sections = new Map();
  let current;
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith(';')) continue;
    const heading = line.match(/^\[([A-Za-z0-9]+)\]$/);
    if (heading) {
      assert.ok(!sections.has(heading[1]), 'section must be unique: ' + heading[1]);
      current = new Map();
      sections.set(heading[1], current);
    } else {
      const equals = line.indexOf('=');
      assert.ok(current && equals > 0, 'every option belongs to a section');
      const name = line.slice(0, equals);
      assert.ok(!current.has(name), 'option must be unique: ' + name);
      current.set(name, line.slice(equals + 1));
    }
  }
  return sections;
}

test('migrate a legacy draft without mixing the two description fields', () => {
  const draft = Core.normalizeDraft({ items: [{ text: '原任务', done: true }], prompt: '模板描述', aiPrompt: 'AI 描述', theme: 'light' });
  assert.equal(draft.prompt, '模板描述');
  assert.equal(draft.aiPrompt, 'AI 描述');
  assert.equal(draft.items[0].done, true);
  assert.equal(draft.items[0].priority, 'medium');
  assert.equal(draft.items[0].due, '');
  assert.ok(draft.items[0].id);
  assert.equal(draft.theme, 'light');
});

test('normalization preserves stable unique IDs, discards invalid legacy rows and does not mutate input', () => {
  const source = [{ id: 'same', text: 'a' }, { id: 'same', text: 'b' }, null, { text: ' ' }];
  const before = JSON.stringify(source);
  const result = Core.normalizeTasks(source);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'same');
  assert.notEqual(result[1].id, 'same');
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => Core.normalizeTasks(source, true));
});

test('validate dates without normalizing impossible days into another month', () => {
  assert.equal(Core.isValidDate('2028-02-29'), true);
  for (const bad of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-1-1', '', undefined]) {
    assert.equal(Core.isValidDate(bad), false);
  }
});

test('parse the three provided Chinese prompt examples', () => {
  assert.deepEqual(Core.parsePrompt('做一张今日待办卡片，列出复习数据结构、整理项目 README、晚上跑步。简洁暗色风格。'), tasks.map(task => task.text));
  assert.deepEqual(Core.parsePrompt('今天要完成：修复登录页 bug、写完单元测试、给项目发一个版本。'), ['修复登录页 bug', '写完单元测试', '给项目发一个版本']);
  assert.deepEqual(Core.parsePrompt('今天的学习清单：背 20 个单词、复习线性代数、完成课程作业。'), ['背 20 个单词', '复习线性代数', '完成课程作业']);
});

test('parse numbered lists and English lists while preserving words inside tasks', () => {
  assert.deepEqual(Core.parsePrompt('1. Review arrays\n2. Write tests\n- [ ] Ship release'), ['Review arrays', 'Write tests', 'Ship release']);
  assert.deepEqual(Core.parsePrompt('Today: review code; write tests'), ['review code', 'write tests']);
  assert.deepEqual(Core.parsePrompt('制定学习计划、要素分析、记录今天的进展'), ['制定学习计划', '要素分析', '记录今天的进展']);
});

test('empty descriptions never invent additional tasks', () => {
  for (const empty of ['', '   ', '、；\n', '今天要完成：']) assert.deepEqual(Core.parsePrompt(empty), []);
});

test('reject overlong tasks and lists without silently truncating the list', () => {
  assert.throws(() => Core.parsePrompt('a'.repeat(Core.LIMITS.text + 1)));
  assert.throws(() => Core.normalizeTasks(Array.from({ length: Core.LIMITS.tasks + 1 }, () => 'task')));
});

test('AI import handles fenced JSON and preserves allowed task fields', () => {
  const result = Core.parseAiResult('```json\n{"title":"开发冲刺","tasks":["修复登录页",{"text":"发布版本","priority":"high","due":"2026-11-01"}]}\n```');
  assert.equal(result.title, '开发冲刺');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1].priority, 'high');
  assert.equal(result.items[1].due, '2026-11-01');
});

test('AI import rejects invalid rows as a whole rather than losing tasks silently', () => {
  for (const invalid of ['null', '{}', '{"tasks":[]}', '{"tasks":["valid",null]}', 'not json']) assert.throws(() => Core.parseAiResult(invalid));
});

test('combine completion filtering with case-insensitive name, date and priority searches', () => {
  assert.equal(Core.matchesTask(tasks[0], { status: 'active', query: '高' }), true);
  assert.equal(Core.matchesTask(tasks[0], { status: 'done', query: '高' }), false);
  assert.equal(Core.matchesTask(tasks[1], { status: 'done', query: 'readme' }), true);
  assert.equal(Core.matchesTask(tasks[0], { query: '2026-11' }), true);
  assert.equal(Core.matchesTask(tasks[2], { query: 'HIGH' }), false);
});

test('date views use calendar dates and distinguish overdue, today, upcoming and undated tasks', () => {
  const today = '2026-12-29';
  assert.equal(Core.matchesTask({ ...tasks[0], due: today }, { dateView: 'today', today }), true);
  assert.equal(Core.matchesTask({ ...tasks[0], due: '2026-12-28' }, { dateView: 'overdue', today }), true);
  assert.equal(Core.matchesTask({ ...tasks[0], due: '2026-12-28', done: true }, { dateView: 'overdue', today }), false);
  assert.equal(Core.matchesTask({ ...tasks[0], due: '2027-01-05' }, { dateView: 'upcoming', today }), true);
  assert.equal(Core.matchesTask({ ...tasks[0], due: '2027-01-06' }, { dateView: 'upcoming', today }), false);
  assert.equal(Core.matchesTask({ ...tasks[0], due: '' }, { dateView: 'undated', today }), true);
  assert.equal(Core.addDateDays('2028-02-28', 2), '2028-03-01');
});

test('sorting changes the real list order, keeps completed tasks last and preserves stable ties', () => {
  const source = [
    { id: 'a', text: 'no date', priority: 'high', done: false, due: '' },
    { id: 'b', text: 'done', priority: 'high', done: true, due: '2026-01-01' },
    { id: 'c', text: 'soon', priority: 'low', done: false, due: '2026-02-01' },
    { id: 'd', text: 'same date', priority: 'medium', done: false, due: '2026-02-01' }
  ];
  assert.deepEqual(Core.sortTasks(source, 'due').map(item => item.id), ['c', 'd', 'a', 'b']);
  assert.deepEqual(Core.sortTasks(source, 'priority').map(item => item.id), ['a', 'd', 'c', 'b']);
  assert.deepEqual(source.map(item => item.id), ['a', 'b', 'c', 'd']);
});

test('reordering a filtered list leaves hidden task positions intact', () => {
  const before = JSON.stringify(tasks);
  const result = Core.reorderVisibleTasks(tasks, ['first', 'third'], 'third', 'first');
  assert.deepEqual(result.map(task => task.id), ['third', 'second', 'first']);
  assert.equal(JSON.stringify(tasks), before);
  assert.equal(result[1], tasks[1]);
});

test('external or stale drag IDs cannot remove or move unrelated tasks', () => {
  for (const source of ['', 'not-a-task', NaN, undefined]) assert.equal(Core.reorderVisibleTasks(tasks, ['first', 'third'], source, 'first'), tasks);
  assert.equal(Core.reorderVisibleTasks(tasks, ['first', 'third'], 'first', 'second'), tasks);
});

test('backup round trip preserves IDs, order, status, settings and independent input drafts', () => {
  const source = Core.normalizeDraft({ title: '我的清单', items: tasks, theme: 'terminal', layout: 'compact', prompt: '模板输入', aiPrompt: 'AI 输入' });
  const backup = Core.makeBackup(source, new Date('2026-10-23T00:00:00Z'));
  assert.equal(backup.exportedAt, '2026-10-23T00:00:00.000Z');
  const restored = Core.parseBackup('\uFEFF' + JSON.stringify(backup));
  assert.deepEqual(restored.draft, source);
  assert.equal(restored.includesDrafts, true);
});

test('older backups without input drafts remain importable', () => {
  const restored = Core.parseBackup({ schemaVersion: 1, title: '旧备份', items: [{ text: 'a' }], appearance: { theme: 'light', layout: 'compact' } });
  assert.equal(restored.includesDrafts, false);
  assert.equal(restored.draft.theme, 'light');
  assert.equal(restored.draft.items.length, 1);
});

test('backups reject unsupported versions and malformed task content', () => {
  for (const data of [null, { schemaVersion: 99, items: [] }, { schemaVersion: 1, items: 'bad' }, { schemaVersion: 1, items: [{ text: '' }] }]) assert.throws(() => Core.parseBackup(data));
});

test('UTF-16 LE download encoding includes a BOM and preserves Chinese and emoji', () => {
  const source = '今日待办 ✓ 测试 🦊\r\nText=复习数据结构';
  const encoded = Core.encodeUtf16LE(source);
  assert.deepEqual([...encoded.slice(0, 2)], [0xff, 0xfe]);
  assert.equal(Buffer.from(encoded.slice(2)).toString('utf16le'), source);
});

for (const theme of ['dark', 'light', 'terminal']) {
  for (const layout of ['comfortable', 'compact']) {
    test('export complete Rainmeter config for ' + theme + '/' + layout, () => {
      const content = Core.generateIni({ title: '今日待办', items: tasks, theme, layout });
      assert.ok(content.includes('\r\n'));
      assert.equal(content.replace(/\r\n/g, '').includes('\n'), false);
      const ini = readIni(content);
      assert.equal(ini.get('Variables').get('Task2Done'), '1');
      assert.equal(ini.get('MeasureProgress').get('MaxValue'), '100');
      assert.equal(ini.get('MeasureProgress').get('MinValue'), '0');
      assert.equal(ini.get('MeterProgressBar').get('BarOrientation'), 'Horizontal');
      assert.ok(ini.get('MeterBackground').get('Shape').includes(Core.THEMES[theme].bg));
      assert.equal(ini.get('MeterTask1').get('Text'), '复习数据结构');
      assert.ok(ini.get('MeterTask1Meta').get('Text').includes('2026-11-01'));
      assert.ok(ini.get('MeterTask1Hit').get('LeftMouseUpAction').includes('!UpdateMeterGroup Task1'));
      assert.ok(ini.get('MeterTask1Hit').get('RightMouseUpAction').includes('!UpdateMeasure MeasureProgress'));
    });
  }
}

test('the completion mark and color read the persisted variable after a refresh', () => {
  const ini = readIni(Core.generateIni({ items: tasks }));
  assert.equal(ini.get('MeasureTask2State').get('Formula'), '#Task2Done#');
  assert.equal(ini.get('MeterTask2Check').get('MeasureName'), 'MeasureTask2State');
  assert.equal(ini.get('MeterTask2Check').get('Text'), '%1');
  assert.ok(ini.get('MeterTask2').get('FontColor').includes('#Task2Done#'));
  assert.ok(ini.get('MeasureTask2State').get('Substitute').includes('"1":"✓"'));
});

test('task text never appears in executable bang actions', () => {
  const label = 'USER_SENTINEL [!Quit] #CURRENTCONFIG# "quoted"\n[Injected]\nRun=bad';
  const ini = readIni(Core.generateIni({ title: label, items: [{ text: label }] }));
  assert.equal(ini.has('Injected'), false);
  for (const options of ini.values()) {
    for (const [key, value] of options) if (key.endsWith('Action')) assert.equal(value.includes('USER_SENTINEL'), false);
  }
  assert.ok(ini.get('MeterTask1').get('Text').includes('［!Quit］'));
  assert.ok(ini.get('MeterTask1').get('Text').includes('＃CURRENTCONFIG＃'));
});

test('empty skin progress is zero and never divides by zero', () => {
  const ini = readIni(Core.generateIni({ items: [] }));
  assert.equal(ini.get('MeasureCompleted').get('Formula'), '0');
  assert.equal(ini.get('MeasureProgress').get('Formula'), '(0)/1*100');
  assert.equal(ini.get('MeterProgress').get('Text'), '[MeasureCompleted] / 0 COMPLETED');
});

test('decode generated Unicode skins and UTF-8 skins without losing non-ASCII text', () => {
  const text = '[Variables]\r\nText=中文与 emoji 🦊';
  assert.equal(Core.decodeSkinBytes(Core.encodeUtf16LE(text)), text);
  assert.equal(Core.decodeSkinBytes(new TextEncoder().encode('\uFEFF' + text)), text);
  assert.throws(() => Core.decodeSkinBytes(new Uint8Array([0xff, 0xfe, 0x12])));
});

test('read completed progress back by task ID after tasks have been reordered and renamed', () => {
  const skin = Core.generateIni({ items: tasks }).replace('Task1Done=0', 'Task1Done=1').replace('Task2Done=1', 'Task2Done=0');
  const current = [tasks[2], { ...tasks[0], text: '重命名后的任务' }, tasks[1]];
  const result = Core.mergeSkinProgress(skin, current);
  assert.equal(result.matched, 3);
  assert.equal(result.changed, 2);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.items.map(task => task.id), ['third', 'first', 'second']);
  assert.equal(result.items[1].text, '重命名后的任务');
  assert.equal(result.items[1].done, true);
  assert.equal(result.items[2].done, false);
  assert.equal(current[1].done, false, 'input objects are never mutated');
});

test('progress read-back only changes matching statuses and never adds removed tasks', () => {
  const skin = Core.generateIni({ items: tasks });
  const current = [tasks[0], { id: 'new', text: '新增任务', done: false }];
  const result = Core.mergeSkinProgress(skin, current);
  assert.equal(result.matched, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1], current[1]);
});

test('progress read-back rejects ambiguous variables, invalid states and unrelated skins', () => {
  for (const source of [
    '[Variables]\nTask1Id=first\nTask1Done=1\ntask1DONE=0',
    '[Variables]\nTask1Id=first\nTask1Done=2',
    '[Variables]\nTask1Id=first\nTask1Done=1\nTask2Id=first\nTask2Done=0',
    '[Variables]\nTask1Id=unrelated\nTask1Done=1',
    '[Variables]\nTask1Done=1'
  ]) assert.throws(() => Core.mergeSkinProgress(source, tasks));
});
