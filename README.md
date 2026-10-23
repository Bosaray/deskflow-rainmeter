# Deskflow for Rainmeter

**把自然语言计划整理成可编辑的待办，并生成 Rainmeter 桌面皮肤。**

Deskflow 以本机数据为起点，让你在桌面上持续看到需要做的事。长期产品方向是达到 Todoist 级别的任务管理体验，当前 v0.3 聚焦单清单与可靠的 Rainmeter 导出。[查看路线图](ROADMAP.md)。

## 直接使用

下载完整项目后，在现代浏览器中打开 `index.html`。无需安装网页依赖、创建账号或填写 API Key。

请将 `index.html`、`styles.css`、`core.js`、`app.js` 放在同一目录。也可把整个目录部署为静态网站。

1. 在上方描述框输入任务，用逗号、顿号、分号或换行分隔，点击“生成桌面皮肤”。
2. 在右侧编辑标题和任务，设置优先级与截止日期，选择主题和布局。
3. 点击“下载 .ini”，按下方说明安装到 Rainmeter。

模板拆分适合清楚的任务列表。对于复杂描述，可使用独立的“借助 ChatGPT 拆解任务”模块：输入描述 → 复制完整指令 → 到 ChatGPT 发送 → 将 JSON 结果贴回来导入。两个输入框分别保存，互不覆盖。Deskflow 本身不会调用 AI 服务或上传任务内容。

可通过“清单备份 → 导入 JSON 备份”导入 [示例学习清单](examples/study-plan.json)。导入会替换当前清单，当前会话内可以撤销。

## 管理清单

- 点击任务文字编辑；勾选完成，或直接添加、删除任务。
- 拖动左侧手柄或使用 ↑↓ 排序。筛选后排序只交换可见任务，隐藏任务保留原位置。
- 搜索任务名称、日期或优先级；叠加全部、未完成、已完成状态筛选。
- 日期范围支持今天到期、逾期未完成、未来七天和未设置日期。“未来七天”指明天至第七天；“今天到期”按截止日期筛选。
- 按截止日期或优先级整理真实清单顺序；已完成任务置底。下载皮肤使用完整清单与当前真实顺序，搜索和筛选不会裁剪导出内容。
- “撤销 / 重做”覆盖生成、导入、编辑、删除、清理、排序、主题和标题修改，保留当前页面会话内最近 30 步。刷新网页会清空撤销历史。
- 支持深色、浅色、终端绿三种主题，以及舒展和紧凑布局。

键盘可用 Tab 导航按钮与字段；编辑任务时 Enter 保存、Esc 取消；任务控件上可用 Alt+↑/↓ 调整顺序。焦点不在输入框时，Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 重做。中文输入法组词时的 Enter 不会提前提交任务。

## 安装到 Rainmeter

先安装 [Rainmeter](https://www.rainmeter.net/)。

1. 将下载的 `DeskflowTodo.ini` 放进 Rainmeter `Skins` 目录下的独立文件夹，例如 `Skins/Deskflow/DeskflowTodo.ini`。
2. 打开“管理 Rainmeter”，点击“全部刷新”，展开 `Deskflow`，选中 `DeskflowTodo.ini` 并点击“加载”。
3. 桌面上左键点击任务会完成，右键点击会恢复。任务变量会写入皮肤文件，刷新后仍会恢复对应标记和进度。

默认皮肤目录通常是 `文档/Rainmeter/Skins`，自定义安装或重定向的文档目录以 Rainmeter 设置为准。

下载的皮肤自动使用带 BOM 的 UTF-16 LE 编码，以保留中文和符号。若使用“复制配置”手动保存，请在编辑器中选择相同编码。[Rainmeter 的 Unicode 说明](https://docs.rainmeter.net/tips/unicode-in-rainmeter/)。

较长的任务会在桌面皮肤中截断显示，可以悬停查看完整内容。

### 把桌面进度读回网页

网页和皮肤目前不会自动互相同步。

1. 在桌面完成或恢复任务后，打开网页的“清单备份 → 读回皮肤完成进度”。
2. 选择 **Rainmeter 正在使用的** `DeskflowTodo.ini`，不是浏览器下载目录中的旧副本。
3. Deskflow 按稳定的任务标识匹配，只更新完成状态；已重命名或重排的任务仍能对应，不会添加已删除的任务。读回操作可以撤销。

v0.2 及更早皮肤不含任务标识。此功能需要使用 v0.3 或更新版本导出的皮肤。更改网页清单后，请重新下载并替换桌面皮肤。

## 本机保存与备份

任务、标题、主题、布局及两个输入框分别保存在当前浏览器的本机存储中。旧版本清单会自动迁移。页面会显示保存是否成功；若浏览器禁用存储或空间不足，会提示导出备份。

同一浏览器的另一窗口修改清单时，本页会暂停写入，显示“载入另一窗口 / 保留本页修改”的选择，避免后台静默覆盖。

- “清单备份 → 导出 JSON 备份”可保存任务顺序、完成状态、优先级、日期、皮肤设置及两个描述框。
- 导入旧版 JSON 备份时仍可恢复任务；旧备份没有描述框字段时，会保留网页当前的描述。
- 清除浏览器数据、更换浏览器、换设备或改变本地文件位置，可能使用不同的存储空间。迁移时使用 JSON 备份。
- 当前上限：500 项任务，单项文字 500 个字符，标题 80 个字符；JSON 备份 2 MB，读回皮肤 8 MB。

## 开发与验证

运行页面无需 Node.js。开发检查使用 Node.js 22 或更新版本，无第三方依赖，也无需先运行 `npm install`。

```sh
npm run check
npm test
```

核心逻辑测试包含描述解析、备份往返、日期、排序、编码与 Rainmeter 配置。页面操作测试使用轻量 DOM/事件适配器验证保存和按钮流程；它不代替真实浏览器视觉检查。

Windows 上可以使用独立临时配置执行 Rainmeter 运行验证。先关闭已有 Rainmeter 进程，再在 PowerShell 7 中运行：

```powershell
.\scripts\verify-rainmeter.ps1 -RainmeterPath 'G:\Rainmeter.exe'
```

将路径改成你的 Rainmeter 程序位置。该脚本会在项目 `.qa-runtime` 下建立临时设置和皮肤，执行生成的完成/恢复命令、刷新和进度读回，随后退出测试实例。[验证记录与人工验收项](docs/VERIFICATION.md)。

`.github/workflows/check.yml` 已配置提交和 PR 检查；实际运行结果以 GitHub Actions 为准。

生成完整源码 ZIP（输出文件须不存在）：

```powershell
.\scripts\package-release.ps1 -OutputPath 'C:\你的目录\Deskflow-v0.3.zip'
```

发布包包含页面资源、文档、示例、检查脚本和 SHA-256 文件清单，排除 Git 历史与临时运行数据。

代码入口：

- `core.js`：数据规范、日期/筛选/排序、备份、皮肤生成和 Unicode 编码。
- `app.js`：页面交互、本机保存、撤销与恢复。
- `styles.css`：页面与预览样式。
- `tests/`：核心与页面操作回归检查。

## 反馈

欢迎在 [GitHub Issues](https://github.com/Bosaray/deskflow-rainmeter/issues) 提交问题。请提供操作步骤、预期结果、实际结果，以及浏览器/Rainmeter 版本；描述解析问题附上简短示例会更容易复现。

当前版本没有自动跨设备同步、后台提醒、重复任务或多人协作。这些能力会按 [路线图](ROADMAP.md) 分阶段推进。

## English summary

Deskflow turns task descriptions into editable lists and exports standalone Rainmeter desktop skins. It supports priorities, due dates, date views, themes, local saving, undo/redo, JSON backups, and manual completion-state read-back from generated skins. An optional ChatGPT copy/paste workflow organizes complex descriptions without an API key; Deskflow does not call an AI service itself.

Open `index.html` with its sibling CSS/JS files. Download the skin into a new folder under Rainmeter's `Skins` directory, refresh Rainmeter and load it. Left-click to complete; right-click to reopen. Exported skins use UTF-16 LE with a BOM. The long-term task-management benchmark is Todoist; the current release focuses on the local single-list and desktop workflow.

## License

MIT. See [LICENSE](LICENSE).
