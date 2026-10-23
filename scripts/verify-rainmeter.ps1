param([Parameter(Mandatory=$true)][string]$RainmeterPath)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $RainmeterPath)) { throw 'Rainmeter executable not found.' }
if (Get-Process -Name Rainmeter -ErrorAction SilentlyContinue) { throw 'Close Rainmeter before this isolated verification, or run the manual checks instead.' }
$repository = Split-Path -Parent $PSScriptRoot
$verificationRoot = Join-Path $repository ('.qa-runtime\' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verificationRoot -Force | Out-Null
& node (Join-Path $PSScriptRoot 'rainmeter-fixture.js') $verificationRoot
if ($LASTEXITCODE -ne 0) { throw 'Fixture generation failed.' }
$settings = Join-Path $verificationRoot 'Rainmeter.ini'
$process = Start-Process -FilePath $RainmeterPath -ArgumentList ('"' + $settings + '"') -WorkingDirectory (Split-Path -Parent $RainmeterPath) -WindowStyle Hidden -PassThru
try {
  if (-not $process.WaitForExit(20000)) { throw 'Rainmeter verification timed out after 20 seconds.' }
} finally {
  if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
}
$log = Join-Path $verificationRoot 'Rainmeter.log'
if (-not (Test-Path -LiteralPath $log)) { throw ('No Rainmeter log was created. Check: ' + $verificationRoot) }
$content = Get-Content -LiteralPath $log
$content | Select-String -Pattern 'DESKFLOW_QA_|ERRO|WARN' | ForEach-Object { $_.Line }
foreach ($phase in @('INITIAL','UPDATED','REFRESHED','REOPENED')) {
  if (-not ($content -match ('DESKFLOW_QA_' + $phase))) { throw ('Missing verification phase: ' + $phase) }
}
foreach ($pattern in @('DESKFLOW_QA_INITIAL mark=○ count=1 progress=33\.333','DESKFLOW_QA_UPDATED mark=✓ count=2 progress=66\.666','DESKFLOW_QA_REFRESHED mark=✓ count=2 progress=66\.666','DESKFLOW_QA_REOPENED mark=○ count=1 progress=33\.333')) {
  if (-not ($content -match $pattern)) { throw ('Unexpected progress state. Expected: ' + $pattern) }
}
if ($content -match '^ERRO') { throw ('Rainmeter reported a runtime error. Log: ' + $log) }
& node (Join-Path $PSScriptRoot 'readback-check.js') $verificationRoot
if ($LASTEXITCODE -ne 0) { throw 'Progress read-back check failed.' }
Write-Output ('Verification log: ' + $log)
