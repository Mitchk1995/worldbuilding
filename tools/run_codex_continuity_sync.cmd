@echo off
setlocal
cd /d "%~dp0.."
py -3 -m tools.builder_continuity sync-agents >nul
