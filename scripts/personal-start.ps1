$ErrorActionPreference='Stop'
$taskCodeRoot=Split-Path -Parent $PSScriptRoot
$taskNodePath=Join-Path $env:LOCALAPPDATA 'LifeOS\runtime\node-v26.13.0-win-x64\node.exe'
if(-not (Test-Path -LiteralPath $taskNodePath)) {$taskNodePath=(Get-Command node -ErrorAction Stop).Source}
$taskProfileRoot=Join-Path $env:USERPROFILE 'LearnHarness'
New-Item -ItemType Directory -Force -Path $taskProfileRoot | Out-Null
$taskScript=Join-Path $PSScriptRoot 'personal.mjs'
$taskConfig=Get-Content -LiteralPath (Join-Path $taskProfileRoot 'config.json') -Raw | ConvertFrom-Json
$taskUrl='http://127.0.0.1:'+[int]$taskConfig.port+'/'
$taskRunningFile=Join-Path $taskProfileRoot 'running.json'
$taskAlreadyRunning=$false
if(Test-Path -LiteralPath $taskRunningFile) {
    $taskSession=Get-Content -LiteralPath $taskRunningFile -Raw | ConvertFrom-Json
    $taskAlreadyRunning=$null -ne (Get-Process -Id $taskSession.pid -ErrorAction SilentlyContinue)
}
# Repeated clicks reuse the owned server, without replacing its logs or lease.
$taskLaunchProcess=$null
if(-not $taskAlreadyRunning) {
    $taskLaunchProcess=Start-Process -FilePath $taskNodePath -ArgumentList @('"'+$taskScript+'"','open') -WorkingDirectory $taskCodeRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskProfileRoot 'launcher.log') -RedirectStandardError (Join-Path $taskProfileRoot 'launcher-error.log') -PassThru
}
$taskReady=$false
$taskDeadline=(Get-Date).AddSeconds(90)
while((Get-Date) -lt $taskDeadline) {
    try {
        $taskResponse=Invoke-WebRequest -Uri ($taskUrl+'review') -UseBasicParsing -TimeoutSec 2
        if($taskResponse.StatusCode -eq 200) {$taskReady=$true;break}
    } catch { }
    if($taskLaunchProcess -and $taskLaunchProcess.HasExited) {
        throw ('LearnHarness could not start. '+(Get-Content -LiteralPath (Join-Path $taskProfileRoot 'launcher-error.log') -Tail 5 -ErrorAction SilentlyContinue | Out-String))
    }
    Start-Sleep -Milliseconds 500
}
if(-not $taskReady) {throw 'LearnHarness did not become ready. Check the launcher logs in your LearnHarness folder.'}
$taskBrowsers=@(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$taskBrowser=$taskBrowsers | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(-not $taskBrowser) {throw 'Chrome or Edge is required to open a dedicated LearnHarness browser window.'}
# A normal new window uses the existing browser profile and its saved sign-ins.
Start-Process -FilePath $taskBrowser -ArgumentList @('--new-window',$taskUrl)
