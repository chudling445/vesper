$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$buildRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'work\installer-build'))
$expectedBuildRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'work\installer-build'))
$projectPrefix = $projectRoot.TrimEnd('\') + '\'
if ($buildRoot -ne $expectedBuildRoot -or -not $buildRoot.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'The installer build folder is outside the project workspace.'
}
$payloadRoot = Join-Path $buildRoot 'payload'
if (Test-Path -LiteralPath $buildRoot) {
  $existing = Get-Item -LiteralPath $buildRoot -Force
  if ($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'The installer build folder cannot be a link.' }
  $resolvedBuild = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $buildRoot).Path).TrimEnd('\') + '\'
  if (-not $resolvedBuild.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'The installer build folder resolves outside the project workspace.' }
  Remove-Item -LiteralPath $buildRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null

$files = @('app.js', 'avatar.js', 'expressionManager.js', 'animationController.js', 'hitboxManager.js', 'waifuVoice.js', 'audio-viseme-manager.js', 'relationship-memory.js', 'character-cards.js', 'markdown-renderer.js', 'code-lab.js', 'code-worker.js', 'code-lab.html', 'guide.js', 'chess.js', 'arcade-framework.js', 'arcade-extra-games.js', 'arcade-toys.js', 'arcade-utility-pack.js', 'server.mjs', 'character_config.yaml', 'index.html', 'workspace.html', 'workspace.js', 'planner.html', 'planner.js', 'local-tools.js', 'pc-catalog.js', 'quick-capture.html', 'quick-capture.js', 'share.html', 'share.js', 'onboarding.html', 'onboarding.js', 'getting-started.html', 'about.html', 'games.html', 'games.js', 'voices.html', 'voices.js', 'page.js', 'voice-utils.js', 'persistence.js', 'feedback.js', 'theme-provider.js', 'themeManager.js', 'theme-selector.js', 'export-utils.js', 'a11y.js', 'offline-sync.js', 'model-only.html', 'model-only.js', 'welcome.html', 'welcome.js', 'first-run.js', 'styles.css', 'favicon.svg', 'manifest.webmanifest', 'manus-routes.json', 'sw.js', '.env.example', 'README.md', 'ARCADE.md', 'GETTING-STARTED.md', 'DEPLOYMENT.md', 'Start Vesper.bat', 'Start Vesper Desktop.bat', 'Start Vesper Model Only.bat', 'Start Vesper Quick Capture.bat')
foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $payloadRoot $file)
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'arcade-launcher.js') -Destination (Join-Path $payloadRoot 'arcade-launcher.js')
Copy-Item -LiteralPath (Join-Path $projectRoot 'vendor') -Destination (Join-Path $payloadRoot 'vendor') -Recurse
New-Item -ItemType Directory -Path (Join-Path $payloadRoot 'models') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'models\PUT-YOUR-VRM-HERE.txt') -Destination (Join-Path $payloadRoot 'models\PUT-YOUR-VRM-HERE.txt')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install-Vesper.ps1') -Destination (Join-Path $payloadRoot 'Install-Vesper.ps1')

Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(64, 64)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 22, 32))
$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(205, 197, 255))
$softAccent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(148, 209, 232))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(4, 4, 56, 56, 0, 360)
$graphics.FillPath($background, $path)
$diamond = [System.Drawing.Point[]]@((New-Object System.Drawing.Point(32, 14)), (New-Object System.Drawing.Point(49, 32)), (New-Object System.Drawing.Point(32, 50)), (New-Object System.Drawing.Point(15, 32)))
$graphics.FillPolygon($accent, $diamond)
$star = [System.Drawing.Point[]]@((New-Object System.Drawing.Point(32, 23)), (New-Object System.Drawing.Point(35, 30)), (New-Object System.Drawing.Point(42, 32)), (New-Object System.Drawing.Point(35, 34)), (New-Object System.Drawing.Point(32, 41)), (New-Object System.Drawing.Point(29, 34)), (New-Object System.Drawing.Point(22, 32)), (New-Object System.Drawing.Point(29, 30)))
$graphics.FillPolygon($softAccent, $star)
$iconPng = Join-Path $buildRoot 'vesper-icon.png'
$iconFile = Join-Path $buildRoot 'vesper-icon.ico'
$bitmap.Save($iconPng, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = [System.IO.File]::ReadAllBytes($iconPng)
$stream = [System.IO.File]::Create($iconFile)
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([byte]64); $writer.Write([byte]64); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$pngBytes.Length); $writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Dispose(); $stream.Dispose()
$graphics.Dispose(); $background.Dispose(); $accent.Dispose(); $softAccent.Dispose(); $path.Dispose(); $bitmap.Dispose()

Add-Type -AssemblyName System.IO.Compression.FileSystem
$payloadZip = Join-Path $buildRoot 'vesper-payload.zip'
[System.IO.Compression.ZipFile]::CreateFromDirectory($payloadRoot, $payloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework compiler is not available for building the setup executable.' }
$setupExe = Join-Path $projectRoot 'Vesper-Setup.exe'
$resourceArg = "/resource:$payloadZip,VesperInstallerPayload"
$references = @('/reference:System.Windows.Forms.dll', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll')
& $compiler /nologo /target:winexe /optimize+ "/out:$setupExe" "/win32icon:$iconFile" $resourceArg @references (Join-Path $PSScriptRoot 'SetupStub.cs')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $setupExe)) { throw 'Windows could not build Vesper-Setup.exe.' }
Get-Item -LiteralPath $setupExe | Select-Object FullName, Length
