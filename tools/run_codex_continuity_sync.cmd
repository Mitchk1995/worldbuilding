@echo off
setlocal
cd /d "%~dp0.."
python -m tools.builder_continuity sync-agents >nul
