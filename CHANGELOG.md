# Changelog

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
