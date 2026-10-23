(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeskflowCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.4.0';
  const LIMITS = Object.freeze({ tasks: 500, text: 500, title: 80, backupBytes: 2 * 1024 * 1024, skinBytes: 8 * 1024 * 1024 });
  const THEMES = Object.freeze({
    dark: { bg: '19,23,24,255', border: '53,60,60', accent: '200,241,105', text: '235,238,228', muted: '137,148,141', row: '25,30,31', high: '255,156,106' },
    light: { bg: '245,246,239,255', border: '205,211,196', accent: '97,125,28', text: '32,37,30', muted: '105,114,103', row: '237,240,232', high: '166,67,28' },
    terminal: { bg: '7,19,14,255', border: '24,67,46', accent: '83,255,148', text: '196,255,216', muted: '104,169,129', row: '10,29,19', high: '255,179,102' }
  });
  const PRIORITIES = Object.freeze({ high: '高', medium: '中', low: '低' });
  let sequence = 0;

  function createId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    sequence += 1;
    return 'task-' + Date.now().toString(36) + '-' + sequence.toString(36);
  }

  function isValidDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }

  function normalizeTasks(value, strict = false) {
    if (!Array.isArray(value) || value.length > LIMITS.tasks) throw new Error('清单最多支持 500 项任务');
    const ids = new Set();
    const result = [];
    for (const candidate of value) {
      const raw = typeof candidate === 'string' ? { text: candidate } : candidate;
      if (!raw || typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > LIMITS.text) {
        if (strict) throw new Error('任务须包含 1–500 个字符的文字');
        continue;
      }
      let id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raw.id) ? raw.id : createId();
      if (ids.has(id)) id = createId();
      ids.add(id);
      result.push({
        id,
        text: raw.text.trim(),
        done: raw.done === true || raw.done === 1,
        due: isValidDate(raw.due) ? raw.due : '',
        priority: Object.hasOwn(PRIORITIES, raw.priority) ? raw.priority : 'medium',
        ...(typeof raw.projectId === 'string' ? { projectId: raw.projectId } : {})
      });
    }
    return result;
  }

  function normalizeDraft(raw = {}) {
    if (!raw || typeof raw !== 'object') throw new Error('清单数据无效');
    const projects = normalizeProjects(raw.projects);
    const projectIds = new Set(projects.map(project => project.id));
    return {
      schemaVersion: 3,
      projects,
      activeProject: raw.activeProject === 'inbox' || projectIds.has(raw.activeProject) ? raw.activeProject : 'all',
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, LIMITS.title) : '今日待办',
      items: normalizeTasks(raw.items || []).map(item => ({ ...item, projectId: projectIds.has(item.projectId) ? item.projectId : 'inbox' })),
      prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
      aiPrompt: typeof raw.aiPrompt === 'string' ? raw.aiPrompt : '',
      theme: Object.hasOwn(THEMES, raw.theme) ? raw.theme : 'dark',
      layout: raw.layout === 'compact' ? 'compact' : 'comfortable'
    };
  }

  function normalizeProjects(value = []) {
    if (!Array.isArray(value) || value.length > 50) throw new Error('工作区最多支持 50 个项目');
    const ids = new Set(['all', 'inbox']);
    return value.map(project => {
      if (!project || typeof project.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(project.id) || ids.has(project.id) || typeof project.name !== 'string' || !project.name.trim() || project.name.length > 40) throw new Error('项目标识或名称无效');
      ids.add(project.id);
      return { id: project.id, name: project.name.trim(), archived: project.archived === true };
    });
  }

  function projectTasks(draft, projectId = draft.activeProject) {
    const archived = new Set(draft.projects.filter(project => project.archived).map(project => project.id));
    return draft.items.filter(item => projectId === 'all' ? !archived.has(item.projectId) : item.projectId === projectId);
  }

  function parsePrompt(value) {
    let body = String(value || '').trim();
    // Strip instruction wrappers, not occurrences of these words inside a task.
    body = body.replace(/(?:[。.!！,，]\s*)?(?:简洁|简约)?(?:暗色|深色|浅色|终端绿)风格[。.!！]?\s*$/, '');
    const listIntro = /^(?:做|创建|生成|制作|帮我做|请做)[\s\S]*?(?:列出|包括)[：:，,\s]*/;
    if (listIntro.test(body)) body = body.replace(listIntro, '');
    else body = body.replace(/^(?:今天(?:的)?(?:要完成|要做|任务|待办|学习清单)|本周(?:的)?(?:计划|要完成)|明天(?:的)?(?:计划|要完成|待办)|今日待办|任务如下|待办(?:事项|清单)?|学习清单|清单|计划|today(?:'s)?(?: tasks| todo)?|tasks|todo)\s*[：:]\s*/i, '');
    const parts = body.split(/[，,、;；\n]+/).map(part => part
      .trim()
      .replace(/^\s*(?:[-*•]\s+(?:\[[ xX]\]\s*)?|\d+[.)、]\s*)/, '')
      .replace(/^(?:以及|还有|然后|并且)\s*/, '')
      .replace(/[。.!！?？]+$/, '')
      .trim()).filter(Boolean);
    if (parts.length > LIMITS.tasks) throw new Error('清单最多支持 500 项任务');
    if (parts.some(text => text.length > LIMITS.text)) throw new Error('单项任务最多支持 500 个字符，请拆分后重试');
    return parts;
  }

  function inferTitle(prompt) {
    if (prompt.includes('本周')) return '本周计划';
    if (prompt.includes('学习')) return '学习清单';
    if (prompt.includes('冲刺')) return '开发冲刺';
    if (prompt.includes('明天')) return '明日待办';
    return '今日待办';
  }

  function parseAiResult(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tasks) || !data.tasks.length) throw new Error('JSON 中需要一个非空 tasks 数组');
    const items = normalizeTasks(data.tasks, true);
    return { title: typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, LIMITS.title) : '今日待办', items };
  }

  function dateOnly(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function addDateDays(value, days) {
    if (!isValidDate(value)) throw new Error('日期格式无效');
    const date = new Date(value + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function matchesTask(task, { status = 'all', query = '', dateView = 'all', today = dateOnly() } = {}) {
    if (status === 'active' && task.done) return false;
    if (status === 'done' && !task.done) return false;
    if (dateView === 'today' && task.due !== today) return false;
    if (dateView === 'overdue' && (task.done || !task.due || task.due >= today)) return false;
    if (dateView === 'upcoming' && (!task.due || task.due <= today || task.due > addDateDays(today, 7))) return false;
    if (dateView === 'undated' && task.due) return false;
    const needle = query.trim().toLocaleLowerCase();
    const priority = task.priority || 'medium';
    return !needle || [task.text, task.due || '', priority, PRIORITIES[priority]].join(' ').toLocaleLowerCase().includes(needle);
  }

  function sortTasks(items, mode) {
    if (mode !== 'due' && mode !== 'priority') return items;
    const rank = { high: 0, medium: 1, low: 2 };
    return items.map((item, index) => ({ item, index })).sort((a, b) => {
      const completion = Number(a.item.done) - Number(b.item.done);
      if (completion) return completion;
      const difference = mode === 'due'
        ? (a.item.due || '9999-12-31').localeCompare(b.item.due || '9999-12-31')
        : (rank[a.item.priority || 'medium'] - rank[b.item.priority || 'medium']);
      return difference || a.index - b.index;
    }).map(entry => entry.item);
  }

  function reorderVisibleTasks(items, visibleIds, sourceId, targetId) {
    if (sourceId === targetId) return items;
    const visible = new Set(visibleIds);
    const ordered = items.filter(item => visible.has(item.id));
    const from = ordered.findIndex(item => item.id === sourceId);
    const to = ordered.findIndex(item => item.id === targetId);
    if (from < 0 || to < 0) return items;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    let index = 0;
    return items.map(item => visible.has(item.id) ? ordered[index++] : item);
  }

  function makeBackup(draft, now = new Date()) {
    const clean = normalizeDraft(draft);
    return {
      schemaVersion: 2,
      projects: clean.projects,
      activeProject: clean.activeProject,
      title: clean.title,
      items: clean.items,
      appearance: { theme: clean.theme, layout: clean.layout },
      drafts: { prompt: clean.prompt, aiPrompt: clean.aiPrompt },
      exportedAt: now.toISOString()
    };
  }

  function parseBackup(source) {
    const data = typeof source === 'string' ? JSON.parse(source.replace(/^\uFEFF/, '')) : source;
    if (!data || ![1, 2].includes(data.schemaVersion) || !Array.isArray(data.items)) throw new Error('备份格式版本不支持');
    if (data.schemaVersion === 2 && !Array.isArray(data.projects)) throw new Error('工作区备份缺少项目列表');
    const items = normalizeTasks(data.items, true);
    const draft = normalizeDraft({ ...data, items, ...data.appearance, ...data.drafts });
    return { draft, includesDrafts: !!data.drafts && typeof data.drafts === 'object' };
  }

  function decodeSkinBytes(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (bytes.length > LIMITS.skinBytes) throw new Error('皮肤文件不能大于 8 MB');
    let encoding = 'utf-8';
    let offset = 0;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; offset = 2; }
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; offset = 2; }
    return new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset)).replace(/^\uFEFF/, '');
  }

  function mergeSkinProgress(source, items) {
    let section = '';
    const variables = new Map();
    for (const rawLine of String(source).replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith(';')) continue;
      const heading = line.match(/^\[([^\]]+)\]$/);
      if (heading) { section = heading[1].toLowerCase(); continue; }
      if (section !== 'variables') continue;
      const separator = line.indexOf('=');
      if (separator > 0) {
        const key = line.slice(0, separator).trim().toLowerCase();
        if (/^task\d+(?:id|done)$/.test(key)) {
          if (variables.has(key)) throw new Error('皮肤中有重复的任务变量');
          variables.set(key, line.slice(separator + 1).trim());
        }
      }
    }
    const statuses = new Map();
    for (const [key, id] of variables) {
      const match = key.match(/^task(\d+)id$/);
      if (!match) continue;
      const done = variables.get('task' + match[1] + 'done');
      if (done !== '0' && done !== '1') throw new Error('皮肤中的完成状态无效');
      if (statuses.has(id)) throw new Error('皮肤中有重复的任务标识');
      statuses.set(id, done === '1');
    }
    if (!statuses.size) throw new Error('皮肤不含任务标识，请用 Deskflow v0.3 或更新版本重新导出');
    let matched = 0;
    let changed = 0;
    const next = items.map(item => {
      if (!statuses.has(item.id)) return item;
      matched += 1;
      const done = statuses.get(item.id);
      if (item.done === done) return item;
      changed += 1;
      return { ...item, done };
    });
    if (!matched) throw new Error('这个皮肤与当前清单没有可匹配的任务');
    return { items: next, matched, changed, skipped: statuses.size - matched };
  }

  function safeRainmeterText(value) {
    // Text stays out of all bang actions. Neutralize dynamic references in String meters.
    return String(value).replace(/[\x00-\x1f\x7f\u2028\u2029]/g, ' ')
      .replace(/\[/g, '［').replace(/\]/g, '］').replace(/#/g, '＃')
      .replace(/%([1-9]\d*)/g, '％$1').replace(/"/g, '“');
  }

  function dynamicColor(doneVariable, active, muted) {
    const a = active.split(',');
    const b = muted.split(',');
    return a.slice(0, 3).map((channel, i) => `(#${doneVariable}# = 1 ? ${b[i]} : ${channel})`).join(',') + ',255';
  }

  function generateIni(draft) {
    const clean = normalizeDraft(draft);
    const { items, title, theme, layout } = clean;
    const colors = THEMES[theme];
    const compact = layout === 'compact';
    const width = compact ? 320 : 360;
    const rowHeight = compact ? 44 : 52;
    const step = rowHeight + (compact ? 6 : 8);
    const taskY = 106;
    const progressY = taskY + items.length * step + 4;
    const height = progressY + 34;
    const sum = items.map((_, i) => `#Task${i + 1}Done#`).join('+') || '0';
    const lines = [];
    function section(name, options) {
      lines.push('[' + name + ']');
      for (const [key, value] of Object.entries(options)) lines.push(key + '=' + value);
      lines.push('');
    }
    const stringStyle = { FontFace: '#FontFace#', AntiAlias: 1, DynamicVariables: 1 };
    section('Rainmeter', { Update: 1000, AccurateText: 1, DynamicWindowSize: 1 });
    section('Metadata', { Name: 'Deskflow Todo', Author: 'Bosaray', License: 'MIT', Version: VERSION, Information: 'Generated by Deskflow. Left-click completes; right-click reopens.' });
    section('Variables', {
      FontFace: 'Microsoft YaHei UI', Accent: colors.accent, TextColor: colors.text, Muted: colors.muted,
      ...Object.fromEntries(items.flatMap((task, i) => [['Task' + (i + 1) + 'Id', task.id], ['Task' + (i + 1) + 'Done', task.done ? 1 : 0]]))
    });
    section('MeasureCompleted', { Measure: 'Calc', Formula: sum, DynamicVariables: 1 });
    section('MeasureProgress', { Measure: 'Calc', Formula: `(${sum})/${Math.max(items.length, 1)}*100`, MinValue: 0, MaxValue: 100, DynamicVariables: 1 });
    section('MeasureDate', { Measure: 'Time', Format: '%m月%d日' });
    items.forEach((task, index) => section('MeasureTask' + (index + 1) + 'State', {
      Measure: 'Calc', Formula: '#Task' + (index + 1) + 'Done#', Substitute: '"0":"○","1":"✓"', DynamicVariables: 1
    }));
    section('MeterBackground', { Meter: 'Shape', Shape: `Rectangle 0,0,${width},${height},10 | Fill Color ${colors.bg} | StrokeWidth 1 | Stroke Color ${colors.border}` });
    section('MeterBrand', { Meter: 'String', ...stringStyle, X: 18, Y: 15, FontSize: 9, FontColor: '#Accent#', StringStyle: 'Bold', Text: 'DESKFLOW  /  TODAY' });
    section('MeterDate', { Meter: 'String', ...stringStyle, MeasureName: 'MeasureDate', X: width - 18, Y: 15, StringAlign: 'Right', FontSize: 8, FontColor: '#Muted#', Text: '%1' });
    section('MeterHeading', { Meter: 'String', ...stringStyle, X: 18, Y: 39, W: width - 36, H: 30, ClipString: 1, FontSize: 18, FontColor: '#TextColor#', StringStyle: 'Bold', Text: safeRainmeterText(title), ToolTipText: safeRainmeterText(title) });
    section('MeterSubtitle', { Meter: 'String', ...stringStyle, X: 18, Y: 76, FontSize: 9, FontColor: '#Muted#', Text: `共 ${items.length} 件事，按自己的节奏来。` });
    items.forEach((task, index) => {
      const n = index + 1;
      const y = taskY + index * step;
      const variable = 'Task' + n + 'Done';
      const group = 'Task' + n;
      const action = done => `[!SetVariable ${variable} ${done}][!WriteKeyValue Variables ${variable} ${done}][!UpdateMeasure MeasureTask${n}State][!UpdateMeasure MeasureCompleted][!UpdateMeasure MeasureProgress][!UpdateMeterGroup ${group}][!UpdateMeter MeterProgressBar][!UpdateMeter MeterProgress][!Redraw]`;
      const color = dynamicColor(variable, colors.text, colors.muted);
      const metadata = PRIORITIES[task.priority] + '优先级' + (task.due ? '  ·  截止 ' + task.due : '');
      section('MeterTask' + n + 'Background', { Meter: 'Shape', Group: group, X: 18, Y: y, Shape: `Rectangle 0,0,${width - 36},${rowHeight},6 | Fill Color ${colors.row} | StrokeWidth 1 | Stroke Color ${colors.border}` });
      section('MeterTask' + n + 'Check', { Meter: 'String', ...stringStyle, Group: group, MeasureName: 'MeasureTask' + n + 'State', X: 28, Y: y + 8, FontSize: 12, FontColor: color, Text: '%1' });
      section('MeterTask' + n, { Meter: 'String', ...stringStyle, Group: group, X: 52, Y: y + 5, W: width - 82, H: 23, ClipString: 1, FontSize: compact ? 10 : 11, FontColor: color, Text: safeRainmeterText(task.text) });
      section('MeterTask' + n + 'Meta', { Meter: 'String', ...stringStyle, Group: group, X: 52, Y: y + (compact ? 25 : 29), W: width - 82, H: 16, ClipString: 1, FontSize: 8, FontColor: dynamicColor(variable, task.priority === 'high' ? colors.high : colors.muted, colors.muted), Text: metadata });
      section('MeterTask' + n + 'Hit', { Meter: 'Shape', Group: group, X: 18, Y: y, Shape: `Rectangle 0,0,${width - 36},${rowHeight},6 | Fill Color 0,0,0,1 | StrokeWidth 0`, LeftMouseUpAction: action(1), RightMouseUpAction: action(0), ToolTipText: safeRainmeterText(task.text + '\n' + metadata) });
    });
    section('MeterProgressBar', { Meter: 'Bar', MeasureName: 'MeasureProgress', X: 18, Y: progressY, W: width - 36, H: 4, BarColor: '#Accent#', SolidColor: colors.border, BarOrientation: 'Horizontal', DynamicVariables: 1 });
    section('MeterProgress', { Meter: 'String', ...stringStyle, X: 18, Y: progressY + 10, FontSize: 8, FontColor: '#Accent#', Text: `[MeasureCompleted] / ${items.length} COMPLETED` });
    return lines.join('\r\n');
  }

  function encodeUtf16LE(text) {
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      bytes[2 + i * 2] = code & 0xff;
      bytes[3 + i * 2] = code >>> 8;
    }
    return bytes;
  }

  return Object.freeze({ VERSION, LIMITS, THEMES, PRIORITIES, createId, isValidDate, normalizeTasks, normalizeProjects, projectTasks, normalizeDraft, parsePrompt, inferTitle, parseAiResult, dateOnly, addDateDays, matchesTask, sortTasks, reorderVisibleTasks, makeBackup, parseBackup, decodeSkinBytes, mergeSkinProgress, safeRainmeterText, generateIni, encodeUtf16LE });
});
