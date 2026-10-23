param([Parameter(Mandatory=$true)][string]$OutputPath)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$destination = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $destination) { throw 'Output already exists. Choose a new ZIP filename.' }
$parent = Split-Path -Parent $destination
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
$stage = Join-Path $repository ('.qa-runtime\release-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$entries = @('index.html','styles.css','core.js','app.js','README.md','LICENSE','ROADMAP.md','CHANGELOG.md','package.json','.gitignore','.github','docs','examples','tests','scripts')
foreach ($entry in $entries) {
  $source = Join-Path $repository $entry
  if (-not (Test-Path -LiteralPath $source)) { throw ('Missing release asset: ' + $entry) }
  Copy-Item -LiteralPath $source -Destination $stage -Recurse
}
$version = (Get-Content -Raw -LiteralPath (Join-Path $repository 'package.json') | ConvertFrom-Json).version
$hashes = Get-ChildItem -LiteralPath $stage -Recurse -File | ForEach-Object {
  [PSCustomObject]@{
    path = $_.FullName.Substring($stage.Length + 1).Replace('\','/')
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
[PSCustomObject]@{ version = $version; files = @($hashes) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'manifest.json') -Encoding utf8
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $destination)
Write-Output ('Created release: ' + $destination)
