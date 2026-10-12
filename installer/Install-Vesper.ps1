$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:PayloadRoot = $PSScriptRoot
$script:InstalledPath = $null
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Vesper Setup'
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ClientSize = New-Object System.Drawing.Size(660, 545)
$form.BackColor = [System.Drawing.Color]::FromArgb(14, 17, 24)
$form.ForeColor = [System.Drawing.Color]::FromArgb(239, 243, 250)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

function New-Label([string]$Text, [int]$X, [int]$Y, [int]$Width, [int]$Height, [int]$Size = 10, [bool]$Bold = $false, [System.Drawing.Color]$Color = [System.Drawing.Color]::Empty) {
  $control = New-Object System.Windows.Forms.Label
  $control.Text = $Text
  $control.Location = New-Object System.Drawing.Point($X, $Y)
  $control.Size = New-Object System.Drawing.Size($Width, $Height)
  $control.Font = New-Object System.Drawing.Font('Segoe UI', $Size, $(if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }))
  if ($Color -ne [System.Drawing.Color]::Empty) { $control.ForeColor = $Color }
  return $control
}

function New-Button([string]$Text, [int]$X, [int]$Y, [int]$Width, [bool]$Primary = $false) {
  $control = New-Object System.Windows.Forms.Button
  $control.Text = $Text
  $control.Location = New-Object System.Drawing.Point($X, $Y)
  $control.Size = New-Object System.Drawing.Size($Width, 38)
  $control.FlatStyle = 'Flat'
  $control.FlatAppearance.BorderSize = 1
  if ($Primary) {
    $control.BackColor = [System.Drawing.Color]::FromArgb(202, 195, 255)
    $control.ForeColor = [System.Drawing.Color]::FromArgb(20, 22, 31)
    $control.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(202, 195, 255)
    $control.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
  } else {
    $control.BackColor = [System.Drawing.Color]::FromArgb(29, 34, 46)
    $control.ForeColor = [System.Drawing.Color]::FromArgb(227, 233, 243)
    $control.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(68, 77, 96)
  }
  return $control
}

$header = New-Object System.Windows.Forms.Panel
$header.Location = New-Object System.Drawing.Point(0, 0)
$header.Size = New-Object System.Drawing.Size(660, 112)
$header.BackColor = [System.Drawing.Color]::FromArgb(23, 28, 39)
$form.Controls.Add($header)
$header.Controls.Add((New-Label 'VESPER  /  MICA NIGHT' 28 20 520 28 15 $true ([System.Drawing.Color]::FromArgb(231, 227, 255))))
$header.Controls.Add((New-Label 'A 3D companion for thoughtful conversation.' 29 54 540 24 11 $false ([System.Drawing.Color]::FromArgb(186, 198, 218))))

$welcome = New-Label 'Install Vesper' 30 132 500 33 20 $true
$form.Controls.Add($welcome)
$intro = New-Label 'Choose a folder and, if you like, import your VRM character. Setup adds a desktop shortcut and installs Node.js only if it is missing.' 30 172 590 44 11 $false ([System.Drawing.Color]::FromArgb(189, 200, 218))
$form.Controls.Add($intro)

$form.Controls.Add((New-Label 'INSTALL FOLDER' 30 231 180 22 10 $true ([System.Drawing.Color]::FromArgb(196, 204, 222))))
$destination = New-Object System.Windows.Forms.TextBox
$destination.Location = New-Object System.Drawing.Point(30, 257)
$destination.Size = New-Object System.Drawing.Size(485, 32)
$destination.Text = Join-Path $env:LOCALAPPDATA 'Programs\Vesper'
$destination.BackColor = [System.Drawing.Color]::FromArgb(10, 13, 19)
$destination.ForeColor = [System.Drawing.Color]::FromArgb(240, 243, 250)
$destination.BorderStyle = 'FixedSingle'
$destination.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$form.Controls.Add($destination)
$browseFolder = New-Button 'Browse…' 525 255 105
$form.Controls.Add($browseFolder)
$browseFolder.Add_Click({
  $picker = New-Object System.Windows.Forms.FolderBrowserDialog
  $picker.Description = 'Choose where Vesper will be installed.'
  $picker.SelectedPath = $destination.Text
  if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $destination.Text = $picker.SelectedPath }
})

$form.Controls.Add((New-Label 'VRM CHARACTER  ·  OPTIONAL' 30 305 260 22 10 $true ([System.Drawing.Color]::FromArgb(196, 204, 222))))
$vrmPath = New-Object System.Windows.Forms.TextBox
$vrmPath.Location = New-Object System.Drawing.Point(30, 331)
$vrmPath.Size = New-Object System.Drawing.Size(485, 32)
$vrmPath.BackColor = [System.Drawing.Color]::FromArgb(10, 13, 19)
$vrmPath.ForeColor = [System.Drawing.Color]::FromArgb(240, 243, 250)
$vrmPath.BorderStyle = 'FixedSingle'
$vrmPath.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$form.Controls.Add($vrmPath)
$browseVrm = New-Button 'Choose VRM…' 525 329 105
$form.Controls.Add($browseVrm)
$browseVrm.Add_Click({
  $picker = New-Object System.Windows.Forms.OpenFileDialog
  $picker.Title = 'Choose a VRM avatar'
  $picker.Filter = 'VRM avatar (*.vrm)|*.vrm'
  if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $vrmPath.Text = $picker.FileName }
})

$desktop = New-Object System.Windows.Forms.CheckBox
$desktop.Text = 'Create a Vesper desktop shortcut'
$desktop.Location = New-Object System.Drawing.Point(30, 380)
$desktop.Size = New-Object System.Drawing.Size(290, 26)
$desktop.Checked = $true
$desktop.ForeColor = [System.Drawing.Color]::FromArgb(224, 231, 242)
$form.Controls.Add($desktop)
$launch = New-Object System.Windows.Forms.CheckBox
$launch.Text = 'Open Vesper when setup finishes'
$launch.Location = New-Object System.Drawing.Point(330, 380)
$launch.Size = New-Object System.Drawing.Size(300, 26)
$launch.Checked = $true
$launch.ForeColor = [System.Drawing.Color]::FromArgb(224, 231, 242)
$form.Controls.Add($launch)

$info = New-Label 'Ollama and chat model downloads are separate. Local models can be several gigabytes; an online model provider is optional.' 30 418 600 40 10 $false ([System.Drawing.Color]::FromArgb(166, 180, 202))
$form.Controls.Add($info)
$ollamaLink = New-Object System.Windows.Forms.LinkLabel
$ollamaLink.Text = 'Get Ollama'
$ollamaLink.Location = New-Object System.Drawing.Point(30, 459)
$ollamaLink.Size = New-Object System.Drawing.Size(110, 22)
$ollamaLink.LinkColor = [System.Drawing.Color]::FromArgb(197, 190, 255)
$ollamaLink.ActiveLinkColor = [System.Drawing.Color]::FromArgb(225, 221, 255)
$ollamaLink.Add_LinkClicked({ Start-Process 'https://ollama.com/download/windows' })
$form.Controls.Add($ollamaLink)
$status = New-Label '' 150 459 330 22 9 $false ([System.Drawing.Color]::FromArgb(171, 198, 211))
$form.Controls.Add($status)

$cancel = New-Button 'Cancel' 395 495 105
$install = New-Button 'Install Vesper' 510 495 120 $true
$form.Controls.Add($cancel)
$form.Controls.Add($install)
$cancel.Add_Click({ $form.Close() })

$install.Add_Click({
  if ($install.Tag -eq 'finish') {
    if ($launch.Checked -and $script:InstalledPath) {
      Start-Process -FilePath (Join-Path $script:InstalledPath 'Start Vesper Desktop.bat') -WorkingDirectory $script:InstalledPath
    }
    $form.Close()
    return
  }
  $install.Enabled = $false
  $browseFolder.Enabled = $false
  $browseVrm.Enabled = $false
  $form.UseWaitCursor = $true
  try {
    $target = [System.IO.Path]::GetFullPath($destination.Text.Trim())
    if ([string]::IsNullOrWhiteSpace($destination.Text)) { throw 'Choose an install folder first.' }
    if ($target.StartsWith($script:PayloadRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a folder outside the setup files.' }
    if ($vrmPath.Text -and -not (Test-Path -LiteralPath $vrmPath.Text -PathType Leaf)) { throw 'The selected VRM file could not be found.' }

    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($node) { $node.Source } else { $null }
    if (-not $nodePath) {
      $candidates = @((Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))
      $nodePath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    }
    $major = 0
    if ($nodePath) {
      $versionText = & $nodePath --version 2>$null
      if ($versionText -match '^v(\d+)') { $major = [int]$Matches[1] }
    }
    if ($major -lt 18) {
      $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
      if (-not $winget) { throw 'Node.js 18 or later is needed. Install it from https://nodejs.org/en/download, then run setup again.' }
      $status.Text = 'Installing Node.js from Windows Package Manager…'
      $form.Refresh()
      $args = @('install', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements')
      $process = Start-Process -FilePath $winget.Source -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
      if ($process.ExitCode -ne 0) { throw 'Node.js setup did not finish. Install Node.js 18 or later, then run Vesper setup again.' }
    }

    $status.Text = 'Installing app files…'
    $form.Refresh()
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($file in @('app.js', 'avatar.js', 'guide.js', 'chess.js', 'server.mjs', 'character_config.yaml', 'index.html', 'workspace.html', 'workspace.js', 'quick-capture.html', 'quick-capture.js', 'share.html', 'share.js', 'onboarding.html', 'onboarding.js', 'getting-started.html', 'about.html', 'games.html', 'games.js', 'voices.html', 'voices.js', 'page.js', 'voice-utils.js', 'persistence.js', 'feedback.js', 'theme-provider.js', 'export-utils.js', 'a11y.js', 'offline-sync.js', 'security-lock.js', 'model-only.html', 'model-only.js', 'welcome.html', 'welcome.js', 'first-run.js', 'styles.css', 'favicon.svg', 'manifest.webmanifest', 'manus-routes.json', 'sw.js', '.env.example', 'README.md', 'GETTING-STARTED.md', 'DEPLOYMENT.md', 'Start Vesper.bat', 'Start Vesper Desktop.bat', 'Start Vesper Model Only.bat', 'Start Vesper Quick Capture.bat')) {
      Copy-Item -LiteralPath (Join-Path $script:PayloadRoot $file) -Destination (Join-Path $target $file) -Force
    }
    Copy-Item -LiteralPath (Join-Path $script:PayloadRoot 'vendor') -Destination (Join-Path $target 'vendor') -Recurse -Force
    New-Item -ItemType Directory -Path (Join-Path $target 'models'), (Join-Path $target 'llm-models'), (Join-Path $target 'desktop-profile') -Force | Out-Null
    $modelHelp = Join-Path $script:PayloadRoot 'models\PUT-YOUR-VRM-HERE.txt'
    if (Test-Path -LiteralPath $modelHelp) { Copy-Item -LiteralPath $modelHelp -Destination (Join-Path $target 'models\PUT-YOUR-VRM-HERE.txt') -Force }
    $envPath = Join-Path $target '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { Copy-Item -LiteralPath (Join-Path $target '.env.example') -Destination $envPath }
    $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $envPath /inheritance:r /grant:r "*$($currentUserSid):(F)" '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not lock down the private .env file permissions.' }

    if ($vrmPath.Text) {
      $characterPath = Join-Path $target 'models\character.vrm'
      if (Test-Path -LiteralPath $characterPath) {
        $choice = [System.Windows.Forms.MessageBox]::Show('A character.vrm already exists. Keep a backup and replace it with the selected avatar?', 'Replace Vesper avatar?', [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question)
        if ($choice -eq [System.Windows.Forms.DialogResult]::Yes) {
          $backup = Join-Path $target ('models\character.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.vrm')
          Copy-Item -LiteralPath $characterPath -Destination $backup
          Copy-Item -LiteralPath $vrmPath.Text -Destination $characterPath -Force
        }
      } else {
        Copy-Item -LiteralPath $vrmPath.Text -Destination $characterPath
      }
    }

    if ($desktop.Checked) {
      $shell = New-Object -ComObject WScript.Shell
      $shortcutPaths = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Vesper.lnk'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Vesper.lnk'))
      foreach ($shortcutPath in $shortcutPaths) {
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = Join-Path $target 'Start Vesper Desktop.bat'
        $shortcut.WorkingDirectory = $target
        $shortcut.Description = 'Open Vesper, your private 3D chat companion.'
        $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll, 167"
        $shortcut.Save()
      }
    }

    $script:InstalledPath = $target
    $status.Text = 'Installation complete. Your files and character are in the selected folder.'
    $install.Text = 'Finish'
    $install.Enabled = $true
    $install.Tag = 'finish'
    $form.UseWaitCursor = $false
    $cancel.Text = 'Close'
    $form.AcceptButton = $install
  } catch {
    $form.UseWaitCursor = $false
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Vesper setup could not continue', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
    $status.Text = 'Setup stopped. Your existing files were left in place.'
    $install.Enabled = $true
    $browseFolder.Enabled = $true
    $browseVrm.Enabled = $true
  }
})

[void]$form.ShowDialog()
