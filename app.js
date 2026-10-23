/* Classic scripts keep index.html usable from file:// as well as static hosting. */
(function () {
  'use strict';
  const Core = window.DeskflowCore;
  const $ = selector => document.querySelector(selector);
  if (!Core) {
    $('#saveStatus').textContent = '核心文件未加载：请将 index.html、core.js、app.js、styles.css 放在同一目录后刷新。';
    $('#saveStatus').classList.add('save-error');
    return;
  }
  const storageKey = 'deskflow-draft-v1';
  const defaultPrompt = $('#prompt').value;
  const undoStack = [];
  const redoStack = [];
  const focusTargets = new Map();
  let state;
  let editingId = null;
  let filter = 'all';
  let query = '';
  let dateView = 'all';
  let draggingId = null;
  let toastTimer;
  let pendingRecovery = null;
  let currentDay = '';
  let renderFrame = null;
  let pendingRemote;

  function localDay(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3600);
  }

  function savingStatus(message, failed = false) {
    if ($('#saveStatus').textContent !== message) $('#saveStatus').textContent = message;
    $('#saveStatus').classList.toggle('save-error', failed);
  }

  function persist() {
    if (pendingRemote !== undefined) {
      savingStatus('另一窗口有更新，本页修改暂未写入', true);
      return false;
    }
    try {
      if (pendingRecovery !== null) {
        localStorage.setItem(storageKey + '-recovery', pendingRecovery);
        pendingRecovery = null;
      }
      localStorage.setItem(storageKey, JSON.stringify(state));
      savingStatus('已保存到本机');
      return true;
    } catch (error) {
      savingStatus('本机保存不可用，请备份清单', true);
      return false;
    }
  }

  function load() {
    try {
      const source = localStorage.getItem(storageKey);
      if (source !== null) {
        try {
          const raw = JSON.parse(source);
          if (!raw || !Array.isArray(raw.items)) throw new Error('invalid saved draft');
          state = Core.normalizeDraft(raw);
          savingStatus('已恢复本机清单');
          return;
        } catch (error) {
          pendingRecovery = source;
          toast('本机旧数据格式异常，原始数据将在保存时保留恢复副本');
        }
      }
    } catch (error) {
      savingStatus('本机保存不可用，请备份清单', true);
    }
    state = Core.normalizeDraft({ prompt: defaultPrompt, items: Core.parsePrompt(defaultPrompt) });
  }

  function snapshot(includeDrafts = false) {
    const result = { items: state.items.map(item => ({ ...item })), title: state.title, theme: state.theme, layout: state.layout };
    if (includeDrafts) Object.assign(result, { prompt: state.prompt, aiPrompt: state.aiPrompt });
    return result;
  }

  function change(action, { includeDrafts = false, reset = false, deferRender = false } = {}) {
    const before = snapshot(includeDrafts);
    action();
    const after = snapshot(includeDrafts);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      undoStack.push({ before, after });
      if (undoStack.length > 30) undoStack.shift();
      redoStack.length = 0;
    }
    if (reset) resetView();
    persist();
    if (deferRender) renderSoon();
    else render();
  }

  function renderSoon() {
    if (renderFrame !== null) cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(() => { renderFrame = null; render(); });
  }

  function travel(from, to, field) {
    const entry = from.pop();
    if (!entry) return;
    to.push(entry);
    Object.assign(state, JSON.parse(JSON.stringify(entry[field])));
    editingId = null;
    resetView();
    syncInputs();
    persist();
    render();
    toast(field === 'before' ? '已撤销，清单已恢复' : '已重做');
  }

  function resetView() {
    filter = 'all';
    query = '';
    dateView = 'all';
    $('#taskSearch').value = '';
    $('#dateView').value = 'all';
  }

  function syncInputs() {
    $('#prompt').value = state.prompt;
    $('#aiPrompt').value = state.aiPrompt;
    $('#listTitle').value = state.title;
    $('#themeSelect').value = state.theme;
    $('#layoutSelect').value = state.layout;
  }

  function visibleTasks() {
    return state.items.filter(item => Core.matchesTask(item, { status: filter, query, dateView, today: localDay() }));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function focusable(node, id, kind) {
    const key = id + ':' + kind;
    node.dataset.focusKey = key;
    focusTargets.set(key, node);
    return node;
  }

  function button(text, className, label, onClick) {
    const node = element('button', className, text);
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  }

  function updateTask(id, patch) {
    if (!state.items.some(item => item.id === id)) return;
    change(() => {
      state.items = state.items.map(item => item.id === id ? { ...item, ...patch } : item);
    });
  }

  function reorder(sourceId, targetId) {
    const ids = visibleTasks().map(item => item.id);
    const next = Core.reorderVisibleTasks(state.items, ids, sourceId, targetId);
    if (next === state.items) return;
    change(() => { state.items = next; });
  }

  function moveRelative(id, offset) {
    const shown = visibleTasks();
    const index = shown.findIndex(item => item.id === id);
    const neighbor = shown[index + offset];
    if (neighbor) reorder(id, neighbor.id);
  }

  function startEditing(id) {
    editingId = id;
    render();
    const input = focusTargets.get(id + ':edit');
    input?.focus();
    input?.select();
  }

  function finishEditing(id, value, deferRender = false) {
    if (editingId !== id) return;
    editingId = null;
    const text = value.trim();
    if (!text) {
      toast('任务文字不能为空，已保留原内容');
      if (deferRender) renderSoon(); else render();
      return;
    }
    if (!state.items.some(item => item.id === id)) return;
    change(() => {
      state.items = state.items.map(item => item.id === id ? { ...item, text: text.slice(0, Core.LIMITS.text) } : item);
    }, { deferRender });
  }

  function renderTask(item, index, shown) {
    const row = element('div', 'task' + (item.done ? ' done' : ''));
    row.dataset.taskId = item.id;
    const main = element('div', 'task-main');
    const controls = element('div', 'task-buttons');
    const drag = focusable(button('⠿', 'task-drag', '拖动调整顺序', () => {}), item.id, 'drag');
    drag.draggable = editingId !== item.id;
    drag.addEventListener('dragstart', event => {
      draggingId = item.id;
      event.dataTransfer.setData('application/x-deskflow-task', item.id);
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    drag.addEventListener('dragend', () => {
      draggingId = null;
      document.querySelectorAll('.dragging,.drag-over').forEach(node => node.classList.remove('dragging', 'drag-over'));
    });
    row.addEventListener('dragover', event => {
      if (!draggingId || draggingId === item.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', event => {
      if (!row.contains(event.relatedTarget)) row.classList.remove('drag-over');
    });
    row.addEventListener('drop', event => {
      if (!draggingId) return;
      event.preventDefault();
      const source = draggingId;
      draggingId = null;
      reorder(source, item.id);
    });
    row.addEventListener('keydown', event => {
      if (!event.altKey || event.target.matches('input,select,textarea')) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveRelative(item.id, event.key === 'ArrowUp' ? -1 : 1);
      }
    });
    const check = focusable(button(item.done ? '✓' : '', 'check', (item.done ? '标记未完成：' : '标记完成：') + item.text, () => updateTask(item.id, { done: !item.done })), item.id, 'check');
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(item.done));
    main.append(drag, check);
    if (editingId === item.id) {
      const input = focusable(element('input', 'task-edit'), item.id, 'edit');
      input.value = item.text;
      input.maxLength = Core.LIMITS.text;
      input.setAttribute('aria-label', '编辑待办事项');
      input.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          finishEditing(item.id, input.value);
          focusTargets.get(item.id + ':text')?.focus();
        } else if (event.key === 'Escape') {
          editingId = null;
          render();
          focusTargets.get(item.id + ':text')?.focus();
        }
      });
      input.addEventListener('blur', () => {
        // Commit by stable ID now; defer DOM replacement so a pending click still lands.
        finishEditing(item.id, input.value, true);
      });
      main.append(input);
    } else {
      main.append(focusable(button(item.text, 'tasktext', '编辑：' + item.text, () => startEditing(item.id)), item.id, 'text'));
    }
    const up = focusable(button('↑', 'task-move', '上移：' + item.text, () => moveRelative(item.id, -1)), item.id, 'up');
    const down = focusable(button('↓', 'task-move', '下移：' + item.text, () => moveRelative(item.id, 1)), item.id, 'down');
    up.disabled = index === 0;
    down.disabled = index === shown.length - 1;
    const remove = focusable(button('×', 'task-remove', '删除：' + item.text, () => {
      editingId = null;
      change(() => { state.items = state.items.filter(task => task.id !== item.id); });
      toast('已删除，可点击“撤销”恢复');
    }), item.id, 'remove');
    controls.append(up, down, remove);
    main.append(controls);
    const meta = element('div', 'task-meta');
    const priorityLabel = element('label', '', '优先级');
    const priority = focusable(element('select', 'task-priority-' + item.priority), item.id, 'priority');
    for (const [value, label] of Object.entries(Core.PRIORITIES)) {
      const option = element('option', '', label);
      option.value = value;
      priority.append(option);
    }
    priority.value = item.priority;
    priority.setAttribute('aria-label', '设置优先级：' + item.text);
    priority.addEventListener('change', () => updateTask(item.id, { priority: priority.value }));
    priorityLabel.append(priority);
    const dueLabel = element('label', '', '截止');
    const due = focusable(element('input'), item.id, 'due');
    due.type = 'date';
    due.value = item.due;
    due.setAttribute('aria-label', '设置截止日期：' + item.text);
    due.addEventListener('change', () => updateTask(item.id, { due: Core.isValidDate(due.value) ? due.value : '' }));
    dueLabel.append(due);
    meta.append(priorityLabel, dueLabel);
    if (!item.done && item.due && item.due <= localDay()) {
      meta.append(element('span', 'due-badge' + (item.due < localDay() ? ' overdue' : ''), item.due < localDay() ? '已逾期' : '今天截止'));
    }
    row.append(main, meta);
    return row;
  }

  function render() {
    if (renderFrame !== null) { cancelAnimationFrame(renderFrame); renderFrame = null; }
    const focused = document.activeElement?.dataset.focusKey;
    focusTargets.clear();
    $('#tasks').replaceChildren();
    const shown = visibleTasks();
    shown.forEach((item, index) => $('#tasks').append(renderTask(item, index, shown)));
    if (!shown.length) {
      const message = !state.items.length ? '清单是空的。添加第一项待办吧。' : query || dateView !== 'all' ? '没有匹配的待办，试试其他关键词或日期范围。' : filter === 'done' ? '还没有已完成的待办。' : '这一组任务已全部完成。';
      $('#tasks').append(element('div', 'empty-filter', message));
    }
    const completed = state.items.filter(item => item.done).length;
    const percent = state.items.length ? Math.round(completed / state.items.length * 100) : 0;
    $('#skinTitle').textContent = state.title;
    $('#skinSub').textContent = `共 ${state.items.length} 件事，按自己的节奏来。`;
    $('#progress').textContent = `${completed} / ${state.items.length} COMPLETED`;
    $('#progressBar').style.width = percent + '%';
    $('.progress-track').setAttribute('aria-valuenow', String(percent));
    $('#allCount').textContent = state.items.length;
    $('#activeCount').textContent = state.items.length - completed;
    $('#doneCount').textContent = completed;
    $('#visibleCount').textContent = shown.length === state.items.length ? '显示全部任务' : `显示 ${shown.length} / ${state.items.length} 项`;
    $('#clearDone').disabled = !completed;
    $('#undo').disabled = !undoStack.length;
    $('#redo').disabled = !redoStack.length;
    $('#addTask').disabled = state.items.length >= Core.LIMITS.tasks;
    document.querySelectorAll('[data-filter]').forEach(node => {
      node.classList.toggle('active', node.dataset.filter === filter);
      node.setAttribute('aria-pressed', String(node.dataset.filter === filter));
    });
    $('#skin').dataset.theme = state.theme;
    $('#skin').dataset.layout = state.layout;
    $('#listTitle').value = state.title;
    $('#themeSelect').value = state.theme;
    $('#layoutSelect').value = state.layout;
    if (focused) {
      const target = focusTargets.get(focused) || (shown[0] && focusTargets.get(shown[0].id + ':check')) || $('#addTask');
      target.focus({ preventScroll: true });
    }
  }

  function download(content, type, name) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy(text, message, hint = '') {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch (error) {
      $('#copyFallback').value = text;
      $('#copyHint').textContent = hint || '浏览器未允许直接复制，请全选后按 Ctrl+C（Mac 为 ⌘C）。';
      $('#copyDialog').showModal();
      $('#copyFallback').focus();
      $('#copyFallback').select();
    }
  }

  function generate(prompt) {
    try {
      const items = Core.normalizeTasks(Core.parsePrompt(prompt), true);
      if (!items.length) { toast('先写下至少一件要做的事'); $('#prompt').focus(); return; }
      editingId = null;
      change(() => { state.items = items; state.title = Core.inferTitle(prompt); }, { reset: true });
      toast('已生成清单，可直接编辑右侧预览');
    } catch (error) { toast(error.message); }
  }

  $('#prompt').addEventListener('input', event => { state.prompt = event.target.value; persist(); });
  $('#aiPrompt').addEventListener('input', event => { state.aiPrompt = event.target.value; persist(); });
  $('#generate').addEventListener('click', () => generate(state.prompt));
  document.querySelectorAll('[data-prompt]').forEach(node => node.addEventListener('click', () => {
    state.prompt = node.dataset.prompt;
    $('#prompt').value = state.prompt;
    generate(state.prompt);
  }));
  $('#copyAiPrompt').addEventListener('click', () => {
    if (!state.aiPrompt.trim()) { toast('先在 AI 模块写下要整理的任务'); $('#aiPrompt').focus(); return; }
    const instruction = '请把下面这段描述整理成可执行的待办清单。保留原意，不补充用户未提到的任务；把复合任务拆成清晰、简短的行动项。只返回合法 JSON，不要 Markdown 或解释。格式：{"title":"清单标题","tasks":["任务一","任务二"]}\n\n用户描述：\n' + state.aiPrompt.trim();
    return copy(instruction, 'AI 指令已复制，请到 ChatGPT 粘贴发送');
  });
  $('#importAiResult').addEventListener('click', () => {
    try {
      if (!$('#aiResult').value.trim()) { toast('先粘贴 ChatGPT 返回的 JSON'); $('#aiResult').focus(); return; }
      const imported = Core.parseAiResult($('#aiResult').value);
      editingId = null;
      change(() => Object.assign(state, imported), { reset: true });
      toast(`已导入 ${imported.items.length} 项任务；可撤销恢复原清单`);
    } catch (error) { toast('无法导入：' + (error instanceof SyntaxError ? 'JSON 格式有误，请检查返回结果' : error.message)); }
  });
  $('#listTitle').addEventListener('input', event => { $('#skinTitle').textContent = event.target.value || '今日待办'; });
  $('#listTitle').addEventListener('change', event => {
    const title = event.target.value.trim().slice(0, Core.LIMITS.title) || '今日待办';
    change(() => { state.title = title; }, { deferRender: true });
  });
  $('#themeSelect').addEventListener('change', event => change(() => { state.theme = event.target.value; }));
  $('#layoutSelect').addEventListener('change', event => change(() => { state.layout = event.target.value; }));
  $('#taskSearch').addEventListener('input', event => { query = event.target.value; render(); });
  $('#dateView').addEventListener('change', event => { dateView = event.target.value; render(); });
  for (const [id, mode] of [['sortDue', 'due'], ['sortPriority', 'priority']]) {
    $('#' + id).addEventListener('click', () => {
      $('.sort-menu').open = false;
      change(() => { state.items = Core.sortTasks(state.items, mode); });
      toast(mode === 'due' ? '已按截止日期整理；无日期任务在后，已完成任务置底' : '已按高、中、低优先级整理；已完成任务置底');
    });
  }
  document.querySelectorAll('[data-filter]').forEach(node => node.addEventListener('click', () => { filter = node.dataset.filter; render(); }));
  $('#addTask').addEventListener('click', () => {
    if (state.items.length >= Core.LIMITS.tasks) return;
    const [item] = Core.normalizeTasks(['新待办']);
    change(() => { state.items.push(item); }, { reset: true });
    startEditing(item.id);
  });
  $('#clearDone').addEventListener('click', () => {
    const count = state.items.filter(item => item.done).length;
    if (!count || !confirm(`清理 ${count} 项已完成任务？之后可点击“撤销”恢复。`)) return;
    editingId = null;
    change(() => { state.items = state.items.filter(item => !item.done); });
    toast(`已清理 ${count} 项，可撤销恢复`);
  });
  $('#undo').addEventListener('click', () => travel(undoStack, redoStack, 'before'));
  $('#redo').addEventListener('click', () => travel(redoStack, undoStack, 'after'));
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.target.matches('input,textarea,select,[contenteditable="true"]') || $('#copyDialog').open) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) travel(redoStack, undoStack, 'after');
      else travel(undoStack, redoStack, 'before');
    }
  });
  $('#download').addEventListener('click', () => {
    if (!state.items.length) { toast('先添加至少一项任务再下载皮肤'); return; }
    download(Core.encodeUtf16LE(Core.generateIni(state)), 'application/octet-stream', 'DeskflowTodo.ini');
    $('#installGuide').open = true;
    toast('皮肤已下载，中文编码已处理；下方有安装步骤');
  });
  $('#copy').addEventListener('click', () => {
    if (!state.items.length) { toast('先添加至少一项任务再复制配置'); return; }
    return copy(Core.generateIni(state), '配置已复制；保存文件请选择 UTF-16 LE 编码', '手动保存配置时请选择 UTF-16 LE 编码；直接下载 .ini 会自动处理中文编码。');
  });
  $('#exportBackup').addEventListener('click', () => {
    download(JSON.stringify(Core.makeBackup(state), null, 2), 'application/json;charset=utf-8', 'Deskflow-backup-' + localDay() + '.json');
    $('.backup-menu').open = false;
    toast('已下载完整清单备份');
  });
  $('#importBackup').addEventListener('click', () => { $('.backup-menu').open = false; $('#backupFile').click(); });
  $('#backupFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > Core.LIMITS.backupBytes) throw new Error('备份文件不能大于 2 MB');
      const { draft, includesDrafts } = Core.parseBackup(await file.text());
      if (state.items.length && !confirm('导入备份将替换当前清单，之后可撤销恢复。继续导入吗？')) return;
      editingId = null;
      change(() => {
        if (!includesDrafts) Object.assign(draft, { prompt: state.prompt, aiPrompt: state.aiPrompt });
        state = draft;
      }, { includeDrafts: true, reset: true });
      syncInputs();
      toast('清单备份已恢复；原清单可通过撤销恢复');
    } catch (error) { toast('无法恢复：' + (error instanceof SyntaxError ? '文件不是合法 JSON' : error.message)); }
    finally { event.target.value = ''; }
  });
  $('#importSkinProgress').addEventListener('click', () => { $('.backup-menu').open = false; $('#skinFile').click(); });
  $('#skinFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > Core.LIMITS.skinBytes) throw new Error('皮肤文件不能大于 8 MB');
      const text = Core.decodeSkinBytes(await file.arrayBuffer());
      const result = Core.mergeSkinProgress(text, state.items);
      if (result.changed) change(() => { state.items = result.items; });
      toast(`已匹配 ${result.matched} 项任务，更新 ${result.changed} 项完成状态` + (result.skipped ? `，跳过 ${result.skipped} 项不在当前清单中的任务` : ''));
    } catch (error) { toast('无法读回进度：' + error.message); }
    finally { event.target.value = ''; }
  });
  $('#closeCopyDialog').addEventListener('click', () => $('#copyDialog').close());
  $('#selectCopyText').addEventListener('click', () => { $('#copyFallback').focus(); $('#copyFallback').select(); });
  document.addEventListener('click', event => {
    if (!event.target.closest('.backup-menu')) $('.backup-menu').open = false;
    if (!event.target.closest('.sort-menu')) $('.sort-menu').open = false;
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const raw = event.newValue === null ? { items: [] } : JSON.parse(event.newValue);
      if (!raw || !Array.isArray(raw.items)) throw new Error('invalid remote draft');
      const incoming = Core.normalizeDraft(raw);
      if (JSON.stringify(incoming) === JSON.stringify(state)) {
        pendingRemote = undefined;
        $('#syncBanner').hidden = true;
        savingStatus('已保存到本机');
        return;
      }
      pendingRemote = incoming;
      $('#syncBanner').hidden = false;
      $('#syncMessage').textContent = '另一窗口更新了清单。请选择载入它，或保留本页的修改。';
      savingStatus('另一窗口有更新，等待选择', true);
      toast('检测到另一窗口的清单更新，请在预览顶部选择处理方式');
    } catch (error) { toast('另一窗口写入的数据格式异常，已保留本页清单'); }
  });
  $('#loadRemote').addEventListener('click', () => {
    if (pendingRemote === undefined) return;
    const incoming = pendingRemote;
    pendingRemote = undefined;
    $('#syncBanner').hidden = true;
    editingId = null;
    change(() => { state = incoming; }, { includeDrafts: true, reset: true });
    syncInputs();
    toast('已载入另一窗口的清单，本页旧内容可撤销恢复');
  });
  $('#keepLocal').addEventListener('click', () => {
    pendingRemote = undefined;
    $('#syncBanner').hidden = true;
    const saved = persist();
    toast(saved ? '已保存本页内容' : '本页内容仍在当前页面，请导出 JSON 备份');
  });

  function updateDate() {
    const day = localDay();
    if (day === currentDay) return;
    currentDay = day;
    $('#date').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date());
    if (state) render();
  }

  load();
  syncInputs();
  updateDate();
  render();
  // Saving here also migrates legacy tasks to stable IDs, without changing the storage key.
  persist();
  setInterval(updateDate, 60000);
})();
