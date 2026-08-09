@echo off
chcp 65001 >nul
echo ============================================
echo   小書轉換器 - 打包成 Windows exe
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [錯誤] 找不到 python，請先安裝 Python 3.9 以上版本（https://www.python.org/downloads/）
    echo 安裝時記得勾選 "Add python.exe to PATH"
    pause
    exit /b 1
)

echo [1/3] 安裝所需套件...
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [錯誤] 套件安裝失敗，請檢查上方訊息
    pause
    exit /b 1
)

echo.
echo [2/3] 開始打包...
python -m PyInstaller --noconfirm --onefile --windowed --name "小書轉換器" app.py
if errorlevel 1 (
    echo [錯誤] 打包失敗，請檢查上方訊息
    pause
    exit /b 1
)

echo.
echo [3/3] 完成！exe 檔案位於 dist\小書轉換器.exe
echo.
echo 接下來請參考 README.md「發布給其他電腦使用」章節，
echo 把 LibreOfficePortable 資料夾一起複製到 dist 資料夾中。
echo.
pause
