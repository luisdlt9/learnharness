@echo off
set "LH_PERSONAL_NODE=%LOCALAPPDATA%\LifeOS\runtime\node-v26.13.0-win-x64\node.exe"
if not exist "%LH_PERSONAL_NODE%" set "LH_PERSONAL_NODE=node"
"%LH_PERSONAL_NODE%" "%~dp0scripts\personal.mjs" finish
pause
