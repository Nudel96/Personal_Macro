@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%apps\desktop"

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm wurde nicht gefunden. Bitte Node.js und pnpm installieren.
  pause
  exit /b 1
)

set "APP_EXE=%ROOT%apps\desktop\src-tauri\target\release\personal-macro-desktop.exe"

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Name 'personal-macro-desktop' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo Personal Macro ist bereits gestartet. Es wird keine zweite Instanz geoeffnet.
  timeout /t 3 /nobreak >nul
  exit /b 0
)

REM Build only when no release executable exists or source files are newer.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$exe='%APP_EXE%'; $changed = -not (Test-Path -LiteralPath $exe); if (-not $changed) { $latest = Get-ChildItem -LiteralPath '%ROOT%apps\desktop\src','%ROOT%apps\desktop\src-tauri\src','%ROOT%apps\desktop\src-tauri\migrations' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; $changed = $latest.LastWriteTime -gt (Get-Item -LiteralPath $exe).LastWriteTime }; exit ([int]$changed)"
if errorlevel 1 (
  echo Erstelle stabilen Desktop-Build ...
  pnpm tauri build
  if errorlevel 1 goto :failed
)

echo Personal Macro wird gestartet ...
start "Personal Macro" "%APP_EXE%"
exit /b 0

:failed
if errorlevel 1 (
  echo.
  echo Der Start ist fehlgeschlagen. Die Fehlermeldung steht oben.
  pause
)
