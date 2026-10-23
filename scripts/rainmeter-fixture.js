const fs = require('node:fs');
const path = require('node:path');
const Core = require('../core.js');

const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination)) throw new Error('Provide an absolute temporary output directory');
const skinRoot = path.join(destination, 'Skins');
const skinDirectory = path.join(skinRoot, 'DeskflowVerification');
fs.mkdirSync(skinDirectory, { recursive: true });
let skin = Core.generateIni({
  title: 'Deskflow 中文验证',
  items: [
    { id: 'qa-first', text: '验证中文、勾选与刷新', done: false, priority: 'high', due: '2026-11-01' },
    { id: 'qa-second', text: '已完成任务', done: true, priority: 'low', due: '' },
    { id: 'qa-third', text: '进度条应为三分之一', done: false, priority: 'medium', due: '' }
  ]
});
skin = skin.replace('[Variables]\r\n', '[Variables]\r\nQAPhase=0\r\n');
const completeAction = skin.match(/^LeftMouseUpAction=(.+)$/m)[1].trim();
const reopenAction = skin.match(/^RightMouseUpAction=(.+)$/m)[1].trim();
skin += [
  '[MeasureQACounter]', 'Measure=Calc', 'Formula=Counter', 'DynamicVariables=1', 'IfConditionMode=1',
  'IfCondition=(#QAPhase# = 0) && (MeasureQACounter >= 2)',
  'IfTrueAction=[!Log "DESKFLOW_QA_INITIAL mark=[MeasureTask1State] count=[MeasureCompleted] progress=[MeasureProgress]" Notice]' + completeAction + '[!SetVariable QAPhase 1]',
  'IfCondition2=(#QAPhase# = 1) && (MeasureQACounter >= 4)',
  'IfTrueAction2=[!Log "DESKFLOW_QA_UPDATED mark=[MeasureTask1State] count=[MeasureCompleted] progress=[MeasureProgress]" Notice][!WriteKeyValue Variables QAPhase 2][!SetVariable QAPhase 99][!Refresh]',
  'IfCondition3=(#QAPhase# = 2) && (MeasureQACounter >= 2)',
  'IfTrueAction3=[!Log "DESKFLOW_QA_REFRESHED mark=[MeasureTask1State] count=[MeasureCompleted] progress=[MeasureProgress]" Notice]' + reopenAction + '[!WriteKeyValue Variables QAPhase 4][!SetVariable QAPhase 99][!Refresh]',
  'IfCondition4=(#QAPhase# = 4) && (MeasureQACounter >= 2)',
  'IfTrueAction4=[!Log "DESKFLOW_QA_REOPENED mark=[MeasureTask1State] count=[MeasureCompleted] progress=[MeasureProgress]" Notice][!SetVariable QAPhase 5][!Delay 700][!Quit]', ''
].join('\r\n');
fs.writeFileSync(path.join(skinDirectory, 'DeskflowTodo.ini'), Core.encodeUtf16LE(skin));
const settings = [
  '[Rainmeter]', 'SkinPath=' + skinRoot + path.sep, 'Logging=1', 'Debug=1',
  'DisableVersionCheck=1', 'DisableAutoUpdate=1', 'TrayIcon=0', 'Language=1033', '',
  '[DeskflowVerification]', 'Active=1', 'WindowX=0', 'WindowY=0', 'AlphaValue=0',
  'ClickThrough=1', 'Draggable=0', 'KeepOnScreen=1', ''
].join('\r\n');
fs.writeFileSync(path.join(destination, 'Rainmeter.ini'), Core.encodeUtf16LE(settings));
