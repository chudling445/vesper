param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
Set-Location $ProjectRoot
$required = @('index.html','app.js','avatar.js','styles.css','server.mjs','model-only.html','model-only.js','games.html','games.js','voice-utils.js','welcome.html','first-run.js','manus-routes.json','sw.js','installer\build-installer.ps1','installer\Install-Vesper.ps1')
foreach ($file in $required) { if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $file))) { throw "Missing required file: $file" } }
$null = Get-Content -Raw 'manus-routes.json' | ConvertFrom-Json
foreach ($file in @('index.html','welcome.html','games.html','model-only.html','about.html','getting-started.html')) {
  $html = Get-Content -Raw $file
  if (([regex]::Matches($html,'<html')).Count -ne ([regex]::Matches($html,'</html>')).Count) { throw "Unbalanced html tags: $file" }
  if (([regex]::Matches($html,'<body')).Count -ne ([regex]::Matches($html,'</body>')).Count) { throw "Unbalanced body tags: $file" }
}
$checks = @('startLocalOllama','model-only','data-background','setAvatarSpeechWord','Reflex Test','Star Catch','High-Low','Vesper-Setup.exe')
$all = ($required | ForEach-Object { if (Test-Path $_) { Get-Content -Raw $_ } }) -join "`n"
foreach ($check in $checks) { if ($all -notmatch [regex]::Escape($check)) { throw "Missing feature marker: $check" } }
$installer = Get-Item 'Vesper-Setup.exe' -ErrorAction SilentlyContinue
if ($installer) { Write-Output "installer=$($installer.Length) bytes; updated=$($installer.LastWriteTime)" } else { Write-Output 'installer=not built' }
Write-Output "Vesper static integrity checks passed: $ProjectRoot"
