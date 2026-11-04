# Stops a Vesper server that was started BEFORE its code last changed, so the launcher
# always serves the current build instead of silently reusing an out-of-date process
# (which made new pages like /studio and /markets return "Not found").
param([int]$Port = 3174)
$ErrorActionPreference = 'SilentlyContinue'

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen | Select-Object -First 1
if (-not $listener) { exit 0 }

$proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if (-not $proc -or $proc.CommandLine -notmatch 'server\.mjs') { exit 0 }   # not a Vesper server; leave it alone

# Files the server reads once at startup (everything else is read from disk per request).
$watched = 'server.mjs', 'india-money-tracker.mjs', 'pc-price-tracker.mjs', 'pc-price-catalog.mjs',
           'delinquency-tracker.mjs', 'market-archive.mjs', 'tracker-calculations.mjs',
           'character_config.yaml', '.env'
$newest = $watched |
  ForEach-Object { Get-Item -LiteralPath (Join-Path $PSScriptRoot $_) -Force } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($newest -and $newest.LastWriteTime -gt $proc.CreationDate) {
  Stop-Process -Id $proc.ProcessId -Force
  for ($i = 0; $i -lt 20 -and (Get-NetTCPConnection -LocalPort $Port -State Listen); $i++) { Start-Sleep -Milliseconds 250 }
}
exit 0
