const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const { createHarness } = require('./dom-harness');

const workspace = {
  title: '我的计划', activeProject: 'work',
  projects: [{ id: 'work', name: '工作' }, { id: 'study', name: '学习' }],
  items: [
    { id: 'a', text: '修复登录', projectId: 'work', done: true },
    { id: 'b', text: '复习数据结构', projectId: 'study', done: true },
    { id: 'c', text: '写测试', projectId: 'work' },
    { id: 'd', text: '晚上跑步', projectId: 'inbox' }
  ]
};

async function selectProject(h, id) {
  h.get('#projectSelect').value = id;
  await h.get('#projectSelect').dispatch('change');
}

test('legacy and orphan tasks migrate to inbox without losing identity or completion', () => {
  const migrated = Core.normalizeDraft({ items: [{ id: 'old', text: '旧任务', done: true, projectId: 'missing' }] });
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.projects, []);
  assert.equal(migrated.items[0].projectId, 'inbox');
  assert.equal(migrated.items[0].id, 'old');
  assert.equal(migrated.items[0].done, true);
  assert.deepEqual(Core.normalizeDraft(migrated), migrated);
});

test('workspace backup round trip retains archived projects, selection and all tasks', () => {
  const draft = Core.normalizeDraft({ ...workspace, projects: [{ id: 'work', name: '工作', archived: true }] });
  const backup = Core.makeBackup(draft);
  assert.equal(backup.schemaVersion, 2);
  assert.deepEqual(Core.parseBackup(JSON.stringify(backup)).draft, draft);
  assert.equal(Core.projectTasks(draft, 'all').length, 2);
  assert.equal(Core.projectTasks(draft, 'work').length, 2);
  for (const projects of [[{ id: 'inbox', name: '保留 ID' }], [{ id: 'x', name: 'x' }, { id: 'x', name: 'y' }], [{ id: 'x', name: '' }], Array(51).fill({ id: 'x', name: 'x' })]) {
    assert.throws(() => Core.normalizeDraft({ items: [], projects }));
  }
  assert.throws(() => Core.parseBackup({ schemaVersion: 2, items: [] }));
});

test('project creation, task movement and generation preserve tasks in other projects', async () => {
  const h = createHarness({ draft: workspace });
  assert.equal(h.all('.task').length, 2);
  h.get('#projectName').value = '生活';
  await h.get('#createProject').click();
  const id = h.saved().activeProject;
  assert.equal(h.saved().projects.length, 3);
  assert.equal(h.all('.task').length, 0);
  h.get('#prompt').value = '今天要完成：跑步、买菜';
  await h.get('#prompt').dispatch('input');
  await h.get('#generate').click();
  assert.equal(h.saved().items.length, 6);
  assert.ok(h.saved().items.slice(-2).every(item => item.projectId === id));
  await selectProject(h, 'work');
  const move = h.row('c').querySelector('.task-project');
  move.value = id;
  await move.dispatch('change');
  assert.equal(h.row('c'), undefined);
  assert.equal(h.saved().items.find(item => item.id === 'c').projectId, id);
  await h.get('#undo').click();
  assert.equal(h.saved().items.find(item => item.id === 'c').projectId, 'work');
});

test('AI import replaces only its selected project and all-project import targets inbox', async () => {
  const h = createHarness({ draft: workspace });
  h.get('#aiResult').value = '{"title":"AI 工作","tasks":["发布"]}';
  await h.get('#importAiResult').click();
  assert.deepEqual(h.saved().items.map(item => item.text), ['复习数据结构', '晚上跑步', '发布']);
  await selectProject(h, 'all');
  await h.get('#importAiResult').click();
  assert.equal(h.saved().activeProject, 'inbox');
  assert.equal(h.saved().items.length, 3);
  assert.ok(h.saved().items.some(item => item.projectId === 'study'));
  assert.ok(h.saved().items.some(item => item.projectId === 'work'));
});

test('archive hides a project from all-project date views and restore is undoable', async () => {
  const h = createHarness({ draft: workspace });
  await h.get('#archiveProject').click();
  assert.equal(h.saved().projects[0].archived, true);
  assert.equal(h.get('#addTask').disabled, true);
  await selectProject(h, 'all');
  assert.deepEqual(h.all('.task').map(row => row.dataset.taskId), ['b', 'd']);
  await selectProject(h, 'work');
  await h.get('#archiveProject').click();
  assert.equal(h.saved().projects[0].archived, false);
  await h.get('#undo').click();
  assert.equal(h.saved().projects[0].archived, true);
  assert.equal(h.saved().items.length, 4);
});

test('cleanup and skin exports stay within the selected project while backups include everything', async () => {
  const h = createHarness({ draft: workspace });
  await h.get('#clearDone').click();
  assert.deepEqual(h.saved().items.map(item => item.id), ['b', 'c', 'd']);
  await h.get('#undo').click();
  h.get('#taskSearch').value = '写测试';
  await h.get('#taskSearch').dispatch('input');
  await h.get('#download').click();
  const bytes = new Uint8Array(await h.blobs.get(h.document.downloads[0].url).arrayBuffer());
  const ini = Core.decodeSkinBytes(bytes);
  assert.ok(ini.includes('Task1Id=a'));
  assert.ok(ini.includes('Task2Id=c'));
  assert.ok(!ini.includes('Task3Id='));
  await h.get('#exportBackup').click();
  const backup = JSON.parse(await h.blobs.get(h.document.downloads[1].url).text());
  assert.equal(backup.items.length, 4);
  assert.equal(backup.projects.length, 2);
});

test('quick capture always enters inbox, respects IME and survives reload', async () => {
  const h = createHarness({ draft: workspace });
  h.get('#quickTask').value = '随手记';
  await h.get('#quickTask').dispatch('keydown', { key: 'Enter', isComposing: true });
  assert.equal(h.saved().items.length, 4);
  await h.get('#quickTask').dispatch('keydown', { key: 'Enter' });
  assert.equal(h.saved().items.length, 5);
  assert.equal(h.saved().activeProject, 'inbox');
  const added = h.saved().items.at(-1);
  assert.equal(added.projectId, 'inbox');
  const reloaded = createHarness({ draft: h.saved() });
  assert.equal(reloaded.row(added.id).querySelector('.tasktext').textContent, '随手记');
  await h.get('#undo').click();
  assert.equal(h.saved().activeProject, 'work');
  assert.equal(h.saved().items.length, 4);
});

test('cross-project date filtering and scope sorting retain hidden task positions', async () => {
  const h = createHarness({ draft: { ...workspace, items: workspace.items.map(item => ({ ...item, due: item.id === 'b' ? '2020-01-01' : '2099-01-01', done: false })) } });
  await selectProject(h, 'all');
  h.get('#dateView').value = 'overdue';
  await h.get('#dateView').dispatch('change');
  assert.deepEqual(h.all('.task').map(row => row.dataset.taskId), ['b']);
  await selectProject(h, 'work');
  await h.get('#sortDue').click();
  assert.deepEqual(h.saved().items.map(item => item.id), ['a', 'b', 'c', 'd']);
});

test('workspace import and undo restore the complete prior project structure', async () => {
  const h = createHarness({ draft: workspace });
  const replacement = Core.makeBackup({ items: [{ text: '替代任务' }], projects: [{ id: 'new', name: '新项目' }], activeProject: 'new' });
  h.get('#backupFile').files = [{ size: 500, text: async () => JSON.stringify(replacement) }];
  await h.get('#backupFile').dispatch('change');
  assert.equal(h.saved().projects[0].id, 'new');
  await h.get('#undo').click();
  assert.deepEqual(h.saved().projects, Core.normalizeDraft(workspace).projects);
  assert.equal(h.saved().activeProject, 'work');
  assert.equal(h.saved().items.length, 4);
});

test('generation rejects global capacity overflow atomically and duplicate project names are rejected', async () => {
  const h = createHarness({ draft: { ...workspace, items: Array.from({ length: 500 }, (_, index) => ({ id: 't' + index, text: '已有', projectId: 'study' })) } });
  const before = h.saved();
  await h.get('#generate').click();
  assert.deepEqual(h.saved(), before);
  h.get('#projectName').value = '学习';
  await h.get('#createProject').click();
  assert.equal(h.saved().projects.length, 2);
  h.get('#projectName').value = '开发';
  await h.get('#renameProject').click();
  assert.equal(h.saved().projects[0].name, '开发');
  await h.get('#undo').click();
  assert.equal(h.saved().projects[0].name, '工作');
});
