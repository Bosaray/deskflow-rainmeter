# Changelog

## 0.4.0 预览版 — 2026-10-23

- 收件箱快速收集任务，支持 Enter 与中文输入法。
- 新建、重命名、归档与恢复项目；任务可在项目之间移动。
- 跨项目搜索与日期视图；生成、AI 导入、清理及排序限定当前项目。
- 旧单清单迁移到收件箱，保持任务 ID、完成状态及日期。
- 工作区备份格式升级到版本 2，包含所有项目及归档任务，兼容旧版备份。
- 皮肤按当前项目导出，备份始终包含整个工作区。
- 新增工作区数据迁移、隔离、容量、归档、导出及撤销验证。
- 任务备注、标签、子任务仍未实现；浏览器视觉验收仍待完成。

## 0.3.0 — 2026-10-23

### Added

- Editable list title; local-session undo/redo for task and skin changes.
- Date views for today, overdue active tasks, the next seven days, and undated tasks.
- Stable due-date and priority sorting with completed tasks at the end.
- Stable task IDs and manual completion-state read-back from Rainmeter `.ini` files.
- JSON backups also retain independent template/AI description drafts.
- Copy fallback dialog, local-save feedback, and inline Rainmeter installation instructions.
- Explicit conflict resolution when another browser window changes the saved list.
- Dependency-free core and page-flow tests, isolated Rainmeter runtime verification, and GitHub Actions checks.
- A phased product roadmap toward Todoist-level task management.

### Fixed

- Chinese skin encoding: downloads now use UTF-16 LE with BOM.
- Skin completion marks and colors now read persisted variables after refresh.
- User task labels are kept out of executable Rainmeter bang actions.
- Invalid external drag payloads cannot move tasks.
- Reordering filtered tasks preserves hidden-task positions.
- Editing a task then deleting/switching rows cannot edit a stale array index.
- Search input styling, narrow-screen layout, long task labels, and preview scrolling.
- Empty or punctuation-only descriptions no longer invent tasks.

### Internal

- Split the page into readable HTML, CSS, UI logic and a shared testable core. Classic scripts preserve direct `file://` use.
