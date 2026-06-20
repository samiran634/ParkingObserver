@echo off
echo ========================================
echo    Stopping all Edge Node windows...
echo ========================================

:: 1. Kill the Python processes directly (bulletproof)
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'python' -and $_.CommandLine -match 'edge_node.py' } | Invoke-CimMethod -MethodName Terminate | Out-Null" >nul 2>&1

:: 2. Try to kill the cmd.exe windows by title (to clean up the old cmd /k windows)
taskkill /F /FI "WINDOWTITLE eq CAM_*" /T >nul 2>&1

echo    All nodes successfully stopped.
pause
