$ErrorActionPreference = "Stop"
Set-Location "D:\codexcoding\worldbuilding"
py -3 -m tools.builder_continuity sync-agents | Out-Null
