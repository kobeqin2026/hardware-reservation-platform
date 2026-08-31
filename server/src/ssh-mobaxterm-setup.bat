@echo off
rem ============================================================
rem  MobaXterm ssh:// 协议一键注册脚本 (硬件资源管理平台)
rem  运行一次即可：让浏览器点击平台 IP 时直接唤起 MobaXterm
rem  需要本机已安装 MobaXterm（免费版/专业版均可）
rem ============================================================
chcp 65001 >nul
setlocal enabledelayedexpansion
title MobaXterm SSH 协议设置

echo.
echo ==========================================================
echo   正在查找 MobaXterm.exe ...
echo ==========================================================

set "MX="
set "MXEXE=MobaXterm.exe"

rem ---- 常见安装路径探测 ----
set "PATHS="
for %%P in (
  "%ProgramFiles%\Mobatek\MobaXterm\%MXEXE%"
  "%ProgramFiles(x86)%\Mobatek\MobaXterm\%MXEXE%"
  "%LOCALAPPDATA%\Programs\Mobatek\MobaXterm\%MXEXE%"
  "%LOCALAPPDATA%\Mobatek\MobaXterm\%MXEXE%"
  "C:\MobaXterm\%MXEXE%"
  "D:\MobaXterm\%MXEXE%"
  "D:\Program Files\Mobatek\MobaXterm\%MXEXE%"
  "E:\MobaXterm\%MXEXE%"
) do (
  if exist "%%~P" set "MX=%%~P"
)

rem ---- 注册表卸载项探测 ----
if not defined MX (
  for /f "usebackq delims=" %%K in (`reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "MobaXterm" /d 2^>nul ^| findstr /i "InstallLocation"`) do (
    set "LOC=%%K"
    set "LOC=!LOC:*InstallLocation    =!"
    if exist "!LOC!\!MXEXE!" set "MX=!LOC!\!MXEXE!"
  )
)

if not defined MX (
  echo.
  echo  [错误] 没有找到 MobaXterm.exe。
  echo  请确认已安装 MobaXterm，或把本脚本放在 MobaXterm 同目录下双击。
  echo  也可以手动指定路径后重试：data 下面单独安装的，请把 MobaXterm.exe 复制到 C:\MobaXterm\
  echo.
  pause
  exit /b 1
)

echo  找到: %MX%
echo.

echo ===========================================
echo   正在把 ssh:// 协议关联到 MobaXterm ...
echo ============================================

reg add "HKCU\Software\Classes\ssh" /ve /d "URL:SSH Protocol" /f >nul
reg add "HKCU\Software\Classes\ssh" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\ssh\DefaultIcon" /ve /d "\"%MX%\"" /f >nul
reg add "HKCU\Software\Classes\ssh\shell\open\command" /ve /d "\"%MX%\" \"%%1\"" /f >nul

reg add "HKCU\Software\Classes\sftp" /ve /d "URL:SFTP Protocol" /f >nul
reg add "HKCU\Software\Classes\sftp" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\sftp\shell\open\command" /ve /d "\"%MX%\" \"%%1\"" /f >nul

echo.
echo  成功! ssh:// 链接现在会由 MobaXterm 打开。
echo  MobaXterm 位置: %MX%
echo.
echo  ============================================================
echo  下一步:
echo   1. 完全关闭浏览器后重新打开（重要，浏览器缓存协议关联）
echo   2. 回到平台页面，点击平台 IP (ssh://user@10.0.0.11)
echo   3. 浏览器可能弹一次确认框 -> 勾选"总是允许" -> 打开
echo   4. MobaXterm 会弹出新 SSH 会话，输入平台配置的密码
echo  ============================================================
echo.
pause