$ErrorActionPreference='Stop'
$taskCodeRoot=Split-Path -Parent $PSScriptRoot
$taskNodePath=Join-Path $env:LOCALAPPDATA 'LifeOS\runtime\node-v26.13.0-win-x64\node.exe'
if(-not (Test-Path -LiteralPath $taskNodePath)) {$taskNodePath=(Get-Command node -ErrorAction Stop).Source}
$taskProfileRoot=Join-Path $env:USERPROFILE 'LearnHarness'
New-Item -ItemType Directory -Force -Path $taskProfileRoot | Out-Null
$taskScript=Join-Path $PSScriptRoot 'personal.mjs'
Start-Process -FilePath $taskNodePath -ArgumentList @('"'+$taskScript+'"','open') -WorkingDirectory $taskCodeRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskProfileRoot 'launcher.log') -RedirectStandardError (Join-Path $taskProfileRoot 'launcher-error.log')
