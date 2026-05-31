@echo off
chcp 65001 >nul

:: Use installed JDK
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"

:: Set PATH
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo Using Java:
"%JAVA_HOME%\bin\java.exe" -version

echo.
echo Building APK...
cd android
call gradlew.bat assembleDebug

echo.
if exist "app\build\outputs\apk\debug\app-debug.apk" (
    echo SUCCESS! APK location:
    echo %CD%\app\build\outputs\apk\debug\app-debug.apk
) else (
    echo Build failed!
)

pause
