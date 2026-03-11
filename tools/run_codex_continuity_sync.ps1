$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
python -m tools.builder_continuity sync-agents | Out-Null
