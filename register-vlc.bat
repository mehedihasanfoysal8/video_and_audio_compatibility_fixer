@echo off
title VLC Protocol Register
echo ========================================================
echo   Registering vlc:// protocol for VLC Media Player
echo ========================================================
echo.

set VLC_PATH="C:\Program Files\VideoLAN\VLC\vlc.exe"

if not exist %VLC_PATH% (
    echo [ERROR] VLC not found at %VLC_PATH%
    echo Please make sure VLC is installed.
    pause
    exit /b
)

echo Registering in Windows Current User Registry (no admin required)...
reg add "HKCU\Software\Classes\vlc" /ve /t REG_SZ /d "URL:VLC Protocol" /f >nul
reg add "HKCU\Software\Classes\vlc" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCU\Software\Classes\vlc\shell\open\command" /ve /t REG_SZ /d "powershell.exe -WindowStyle Hidden -Command \"$u = [uri]::UnescapeDataString('%%1') -replace '^vlc://',''; Start-Process '%VLC_PATH%' -ArgumentList $u\"" /f >nul

echo.
echo [SUCCESS] vlc:// protocol registered successfully!
echo You can now click "Stream in VLC" in your browser to open VLC directly!
echo.
pause

