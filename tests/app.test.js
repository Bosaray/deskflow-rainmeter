const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./dom-harness');
const Core = require('../core');

const original = {
  title: '已有清单', prompt: '模板独立描述', aiPrompt: 'AI 独立描述', theme: 'dark', layout: 'comfortable',
  items: [
    { id: 'a', text: '第一项', done: false, due: '', priority: 'high' },
    { id: 'b', text: '第二项已完成', done: true, due: '', priority: 'medium' },
    { id: 'c', text: '第三项', done: false, due: '2026-11-02', priority: 'low' }
  ]
};

test('boot migrates existing data and keeps prompt inputs independent', () => {
  const h = createHarness({ draft: original });
  assert.equal(h.get('#prompt').value, '模板独立描述');
  assert.equal(h.get('#aiPrompt').value, 'AI 独立描述');
  assert.equal(h.saved().items[1].done, true);
  assert.equal(h.get('#progress').textContent, '1 / 3 COMPLETED');
  assert.equal(h.get('#progressBar').style.width, '33%');
  assert.equal(h.saved().items[0].id, 'a');
});

test('generate changes only the main list while preserving the AI draft', async () => {
  const h = createHarness({ draft: original });
  h.get('#prompt').value = '今天要完成：写测试、发布版本';
  await h.get('#prompt').dispatch('input');
  await h.get('#generate').click();
  assert.deepEqual(h.saved().items.map(task => task.text), ['写测试', '发布版本']);
  assert.equal(h.saved().aiPrompt, 'AI 独立描述');
  await h.get('#undo').click();
  assert.deepEqual(h.saved().items.map(task => task.id), ['a', 'b', 'c']);
  assert.equal(h.saved().prompt, '今天要完成：写测试、发布版本');
  await h.get('#redo').click();
  assert.deepEqual(h.saved().items.map(task => task.text), ['写测试', '发布版本']);
});

test('AI import is independent, undoable and atomic for malformed JSON', async () => {
  const h = createHarness({ draft: original });
  h.get('#aiResult').value = '{"title":"AI 清单","tasks":["AI 任务"]}';
  await h.get('#importAiResult').click();
  assert.equal(h.saved().title, 'AI 清单');
  assert.equal(h.saved().prompt, original.prompt);
  await h.get('#undo').click();
  assert.equal(h.saved().title, original.title);
  const before = JSON.stringify(h.saved().items);
  h.get('#aiResult').value = '{"tasks":["保留",null]}';
  await h.get('#importAiResult').click();
  assert.equal(JSON.stringify(h.saved().items), before);
});

test('completion filtering updates counts without losing the full list', async () => {
  const h = createHarness({ draft: original });
  await h.get('[data-filter="active"]').click();
  assert.equal(h.all('.task').length, 2);
  await h.row('a').querySelector('.check').click();
  assert.equal(h.all('.task').length, 1);
  assert.equal(h.saved().items.length, 3);
  assert.equal(h.get('#doneCount').textContent, '2');
  assert.equal(h.get('#progressBar').style.width, '67%');
  assert.equal(h.document.activeElement, h.row('c').querySelector('.check'));
});

test('moving within a filtered list preserves the position of hidden tasks', async () => {
  const h = createHarness({ draft: original });
  await h.get('[data-filter="active"]').click();
  await h.row('c').querySelectorAll('.task-move')[0].click();
  assert.deepEqual(h.saved().items.map(task => task.id), ['c', 'b', 'a']);
  await h.get('#undo').click();
  assert.deepEqual(h.saved().items.map(task => task.id), ['a', 'b', 'c']);
});

test('search finds dates and priorities, and adding a task resets the view', async () => {
  const h = createHarness({ draft: original });
  h.get('#taskSearch').value = '2026-11';
  await h.get('#taskSearch').dispatch('input');
  assert.equal(h.all('.task').length, 1);
  assert.ok(h.row('c'));
  await h.get('#addTask').click();
  assert.equal(h.get('#taskSearch').value, '');
  assert.equal(h.all('.task').length, 4);
  assert.ok(h.get('.task-edit'));
});

test('date views combine with status filters and sorting is undoable', async () => {
  const h = createHarness({ draft: original });
  h.get('#dateView').value = 'undated';
  await h.get('#dateView').dispatch('change');
  assert.deepEqual(h.all('.task').map(row => row.dataset.taskId), ['a', 'b']);
  await h.get('[data-filter="active"]').click();
  assert.deepEqual(h.all('.task').map(row => row.dataset.taskId), ['a']);
  await h.get('#sortDue').click();
  assert.deepEqual(h.saved().items.map(item => item.id), ['c', 'a', 'b']);
  await h.get('#undo').click();
  assert.deepEqual(h.saved().items.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(h.get('#dateView').value, 'all');
});

test('editing then selecting another task commits the first edit', async () => {
  const h = createHarness({ draft: original });
  await h.row('a').querySelector('.tasktext').click();
  h.get('.task-edit').value = '已修改第一项';
  await h.row('c').querySelector('.tasktext').click();
  await h.frames();
  assert.equal(h.saved().items.find(task => task.id === 'a').text, '已修改第一项');
  assert.equal(h.get('.task-edit').value, '第三项');
});

test('editing then deleting the same task cannot change a different task', async () => {
  const h = createHarness({ draft: original });
  await h.row('a').querySelector('.tasktext').click();
  h.get('.task-edit').value = '这项马上删除';
  await h.row('a').querySelector('.task-remove').click();
  await h.frames();
  assert.deepEqual(h.saved().items.map(task => task.text), ['第二项已完成', '第三项']);
  await h.get('#undo').click();
  assert.equal(h.saved().items[0].id, 'a');
});

test('IME composition Enter does not commit, and Escape cancels the edit', async () => {
  const h = createHarness({ draft: original });
  await h.row('a').querySelector('.tasktext').click();
  const input = h.get('.task-edit');
  input.value = '中文输入中';
  await input.dispatch('keydown', { key: 'Enter', isComposing: true });
  assert.equal(h.saved().items[0].text, '第一项');
  assert.ok(h.get('.task-edit'));
  await input.dispatch('keydown', { key: 'Escape' });
  assert.equal(h.saved().items[0].text, '第一项');
  assert.equal(h.get('.task-edit'), null);
});

test('cleanup confirmation can cancel and a confirmed cleanup can be undone', async () => {
  const cancelled = createHarness({ draft: original, confirm: false });
  await cancelled.get('#clearDone').click();
  assert.equal(cancelled.saved().items.length, 3);
  const h = createHarness({ draft: original });
  await h.get('#clearDone').click();
  assert.deepEqual(h.saved().items.map(task => task.id), ['a', 'c']);
  await h.get('#undo').click();
  assert.deepEqual(h.saved().items.map(task => task.id), ['a', 'b', 'c']);
});

test('a new edit after undo clears redo history', async () => {
  const h = createHarness({ draft: original });
  await h.row('a').querySelector('.check').click();
  await h.get('#undo').click();
  assert.equal(h.get('#redo').disabled, false);
  await h.row('c').querySelector('.check').click();
  assert.equal(h.get('#redo').disabled, true);
});

test('custom title persists and can be undone without affecting drafts', async () => {
  const h = createHarness({ draft: original });
  h.get('#listTitle').value = '下周学习计划';
  await h.get('#listTitle').dispatch('input');
  assert.equal(h.get('#skinTitle').textContent, '下周学习计划');
  await h.get('#listTitle').dispatch('change');
  await h.frames();
  assert.equal(h.saved().title, '下周学习计划');
  await h.get('#undo').click();
  assert.equal(h.get('#listTitle').value, original.title);
});

test('clipboard denial shows the complete AI instruction for manual copying', async () => {
  const h = createHarness({ draft: original, rejectClipboard: true });
  await h.get('#copyAiPrompt').click();
  assert.equal(h.get('#copyDialog').open, true);
  assert.ok(h.get('#copyFallback').value.includes('只返回合法 JSON'));
  assert.ok(h.get('#copyFallback').value.includes(original.aiPrompt));
  assert.equal(h.get('#copyFallback').value.includes(original.prompt), false);
});

test('skin download is UTF-16 LE and includes all tasks regardless of UI filtering', async () => {
  const h = createHarness({ draft: original });
  await h.get('[data-filter="done"]').click();
  await h.get('#download').click();
  const download = h.document.downloads[0];
  assert.equal(download.name, 'DeskflowTodo.ini');
  const bytes = Buffer.from(await h.blobs.get(download.url).arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 2)], [255, 254]);
  const content = bytes.subarray(2).toString('utf16le');
  for (const task of original.items) assert.ok(content.includes(task.text));
  assert.equal(h.get('#installGuide').open, true);
});

test('empty-list export does not recreate old tasks from an old prompt', async () => {
  const h = createHarness({ draft: { ...original, items: [] } });
  await h.get('#download').click();
  assert.equal(h.document.downloads.length, 0);
  assert.equal(h.saved().items.length, 0);
});

test('JSON backup includes independent drafts and settings', async () => {
  const h = createHarness({ draft: original });
  await h.get('#exportBackup').click();
  const data = JSON.parse(await h.blobs.get(h.document.downloads[0].url).text());
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.items[0].id, 'a');
  assert.equal(data.drafts.prompt, original.prompt);
  assert.equal(data.drafts.aiPrompt, original.aiPrompt);
  assert.equal(data.appearance.theme, original.theme);
});

test('legacy backup import preserves drafts and undo restores the original list', async () => {
  const h = createHarness({ draft: original });
  h.get('#backupFile').files = [{ size: 200, text: async () => JSON.stringify({ schemaVersion: 1, title: '新备份', items: [{ text: '导入任务' }], appearance: { theme: 'light' } }) }];
  await h.get('#backupFile').dispatch('change');
  assert.equal(h.saved().title, '新备份');
  assert.equal(h.saved().prompt, original.prompt);
  assert.equal(h.saved().aiPrompt, original.aiPrompt);
  await h.get('#undo').click();
  assert.equal(h.saved().title, original.title);
  assert.equal(h.saved().items.length, 3);
});

test('oversized backup is rejected before reading file content', async () => {
  const h = createHarness({ draft: original });
  let read = false;
  h.get('#backupFile').files = [{ size: 2 * 1024 * 1024 + 1, text: async () => { read = true; return '{}'; } }];
  await h.get('#backupFile').dispatch('change');
  assert.equal(read, false);
  assert.equal(h.saved().items.length, 3);
});

test('corrupt local data is preserved before replacement and blocked storage is visible', () => {
  const h = createHarness({ rawDraft: '{corrupt' });
  assert.equal(h.storage.get('deskflow-draft-v1-recovery'), '{corrupt');
  assert.ok(h.saved().items.length);
  const blocked = createHarness({ blockStorage: true });
  assert.ok(blocked.get('#saveStatus').textContent.includes('不可用'));
  assert.equal(blocked.get('#saveStatus').classList.contains('save-error'), true);
});

test('external drag data cannot reorder tasks', async () => {
  const h = createHarness({ draft: original });
  await h.row('c').dispatch('drop', { dataTransfer: { getData: () => 'a' } });
  assert.deepEqual(h.saved().items.map(task => task.id), ['a', 'b', 'c']);
});

test('native input undo is not intercepted by list-level keyboard shortcuts', async () => {
  const h = createHarness({ draft: original });
  await h.row('a').querySelector('.check').click();
  await h.get('#prompt').dispatch('keydown', { key: 'z', ctrlKey: true });
  assert.equal(h.saved().items[0].done, true);
  await h.document.body.dispatch('keydown', { key: 'z', ctrlKey: true });
  assert.equal(h.saved().items[0].done, false);
});

test('read-back applies desktop progress and remains undoable', async () => {
  const h = createHarness({ draft: original });
  const skin = Core.generateIni(original).replace('Task1Done=0', 'Task1Done=1');
  const encoded = Core.encodeUtf16LE(skin);
  h.get('#skinFile').files = [{ size: encoded.byteLength, arrayBuffer: async () => encoded.buffer }];
  await h.get('#skinFile').dispatch('change');
  assert.equal(h.saved().items[0].done, true);
  assert.equal(h.get('#progress').textContent, '2 / 3 COMPLETED');
  await h.get('#undo').click();
  assert.equal(h.saved().items[0].done, false);
  assert.equal(h.saved().items[1].done, true);
});

test('unrelated skin cannot overwrite the current list', async () => {
  const h = createHarness({ draft: original });
  const encoded = Core.encodeUtf16LE('[Variables]\nTask1Id=not-current\nTask1Done=1');
  h.get('#skinFile').files = [{ size: encoded.byteLength, arrayBuffer: async () => encoded.buffer }];
  await h.get('#skinFile').dispatch('change');
  assert.deepEqual(h.saved().items, Core.normalizeDraft(original).items);
  assert.ok(h.get('#toast').textContent.includes('没有可匹配'));
});

test('cross-window changes pause writes until the user chooses which list to keep', async () => {
  const h = createHarness({ draft: original });
  const remote = { ...h.saved(), title: '另一窗口的清单', items: [{ id: 'remote', text: '远程任务', done: false, priority: 'medium', due: '' }] };
  h.storage.set('deskflow-draft-v1', JSON.stringify(remote));
  await h.window.dispatch('storage', { key: 'deskflow-draft-v1', newValue: JSON.stringify(remote) });
  assert.equal(h.get('#syncBanner').hidden, false);
  await h.row('a').querySelector('.check').click();
  assert.equal(h.saved().title, '另一窗口的清单', 'a local edit must not silently overwrite the remote version');
  await h.get('#keepLocal').click();
  assert.equal(h.saved().title, original.title);
  assert.equal(h.saved().items[0].done, true);
  assert.equal(h.get('#syncBanner').hidden, true);
});

test('loading another window is undoable, including the independent prompt drafts', async () => {
  const h = createHarness({ draft: original });
  const remote = { ...h.saved(), title: '远程清单', prompt: '远程模板', aiPrompt: '远程 AI' };
  h.storage.set('deskflow-draft-v1', JSON.stringify(remote));
  await h.window.dispatch('storage', { key: 'deskflow-draft-v1', newValue: JSON.stringify(remote) });
  await h.get('#loadRemote').click();
  assert.equal(h.get('#prompt').value, '远程模板');
  await h.get('#undo').click();
  assert.equal(h.saved().title, original.title);
  assert.equal(h.get('#prompt').value, original.prompt);
  assert.equal(h.get('#aiPrompt').value, original.aiPrompt);
});

test('a matching remote revision clears a previously pending conflict', async () => {
  const h = createHarness({ draft: original });
  const local = h.saved();
  await h.window.dispatch('storage', { key: 'deskflow-draft-v1', newValue: JSON.stringify({ ...local, title: '另一份' }) });
  assert.equal(h.get('#syncBanner').hidden, false);
  await h.window.dispatch('storage', { key: 'deskflow-draft-v1', newValue: JSON.stringify(local) });
  assert.equal(h.get('#syncBanner').hidden, true);
  await h.row('a').querySelector('.check').click();
  assert.equal(h.saved().items[0].done, true);
});

test('missing core asset displays a useful recovery message instead of throwing', () => {
  const h = createHarness({ loadCore: false });
  assert.ok(h.get('#saveStatus').textContent.includes('核心文件未加载'));
});

test('a failed local save never claims that conflict resolution was saved', async () => {
  const h = createHarness({ blockStorage: true });
  await h.window.dispatch('storage', { key: 'deskflow-draft-v1', newValue: JSON.stringify(original) });
  await h.get('#keepLocal').click();
  assert.ok(h.get('#toast').textContent.includes('请导出 JSON 备份'));
  assert.ok(h.get('#saveStatus').textContent.includes('不可用'));
});
