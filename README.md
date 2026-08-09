# 小書轉換器

選擇一份排好版的 `.docx`（每頁一圖一文，跟書的內容順序一樣），自動輸出一份
**小書格式 PDF**：把頁面重新排成適合印刷、對摺、裝訂成小冊子的順序，頁數不同
會自動判斷並補上空白頁（補到 4 的倍數）。

原理：把 N 頁內容分成 N/4 張紙，每張紙正反面各印 2 頁（左右並排），排列順序讓
你雙面列印後，沿中線對摺 / 裁切、依序疊起來就會變成正確頁碼順序的小書。

本專案有兩種版本：

- **網頁版**（`docs/` 資料夾，透過 GitHub Pages 發布）：免安裝，開網址、上傳
  docx、下載 PDF，全部在瀏覽器內完成，檔案不會上傳到任何伺服器。分頁位置用
  「圖片位置＋文字長度」推測，若原始 docx 沒有手動分頁點，純文字頁面可能需要
  在網頁上手動調整分頁位置（介面上點一下分隔線即可切換）。
- **桌面版**（`app.py` / `imposition.py`）：透過 LibreOffice 轉檔，忠實還原
  Word 原始排版，適合需要精準還原原始版面的情況，見下方安裝說明。

---

## 網頁版

發布網址：**https://adathen.github.io/bookformat/**
（若尚未啟用：GitHub repo → Settings → Pages → Source 選擇
`Deploy from a branch`，Branch 選 `main` / `docs`）

原始碼在 `docs/`：
- `index.html` / `style.css` — 頁面與樣式
- `js/docxParser.js` — 用 JSZip 解析 docx 內容（段落、圖片、表格、分頁標記）
- `js/paginate.js` — 分頁邏輯（有手動分頁點就 100% 依照分頁點；沒有則用
  「每張圖片開新頁＋文字長度」推測）
- `js/renderPage.js` — 把單頁內容畫成固定尺寸的 HTML 元素
- `js/pdfBuilder.js` — 用 html2canvas 把每頁轉成圖片，再用 pdf-lib 依相同的
  拼版公式組成小書格式 PDF
- `js/main.js` — UI 串接（上傳、分頁編輯器、產生／下載 PDF）

全部透過 CDN 載入 JSZip / pdf-lib / html2canvas，沒有建置流程，直接是純靜態
檔案，本機測試只要在 `docs/` 資料夾下開一個簡單伺服器即可：

```
cd docs
python3 -m http.server 8765
# 瀏覽器開 http://localhost:8765
```

---

## 桌面版

### 給「打包電腦」（只需做一次）

打包用的這台電腦需要安裝：

1. **Python 3.9 以上**：<https://www.python.org/downloads/>
   安裝時務必勾選「Add python.exe to PATH」
2. **LibreOffice Portable**：至 [PortableApps.com](https://portableapps.com/) 搜尋
   「LibreOffice Portable」下載安裝，安裝完成後會得到一個
   `LibreOfficePortable` 資料夾。把整個資料夾複製到跟 `app.py` 同一層。

資料夾結構應該長這樣：

```
booklet_maker/
  app.py
  imposition.py
  requirements.txt
  build_exe.bat
  LibreOfficePortable/      ← 從 PortableApps 下載解壓縮後放進來
    App/
      libreoffice/
        program/
          soffice.exe
    ...
```

#### 打包步驟

雙擊 `build_exe.bat`，等待跑完，會在 `dist\小書轉換器.exe` 產生執行檔。

---

### 發布給其他電腦使用

建立一個要發送出去的資料夾（例如「小書轉換器_發布版」），放入：

```
小書轉換器_發布版/
  小書轉換器.exe        ← dist 資料夾裡打包好的檔案
  LibreOfficePortable/   ← 跟打包時用的同一個資料夾，整個複製過去
```

把整個「小書轉換器_發布版」資料夾複製（例如用隨身碟、雲端硬碟）到別台
Windows 電腦，**不需要安裝任何東西**，雙擊 `小書轉換器.exe` 就能直接使用。

> 注意：`小書轉換器.exe` 跟 `LibreOfficePortable` 資料夾一定要放在同一層，
> 程式是靠這個相對位置去找 LibreOffice 的。

---

### 使用方式

1. 開啟「小書轉換器」
2. 按「選擇 .docx 檔案...」，選擇要製作成小書的 Word 檔
3. （可選）按「選擇輸出資料夾...」，預設會跟來源檔案放同一個資料夾
4. 按「開始轉換」，等待完成（第一次執行 LibreOffice 可能要多等一下）
5. 完成後會產生 `原檔名(小書格式).pdf`，可直接送印

#### 對來源 docx 的要求

- 建議每一頁 Word 就是最終書的一頁內容（一圖一文），跟本次範例
  `會發光的迴力鏢小書0711.docx` 的排版方式一樣
- 頁數不限，不是 4 的倍數也沒關係，程式會自動補空白頁

#### 印刷 / 裝訂建議

- 輸出的 PDF 每一面都是「橫式、左右各一頁」的跨頁
- 用雙面列印（**長邊翻頁 / flip on long edge**）、A4 紙即可
- 印完後沿中線對摺，依序疊好，騎馬釘（或用釘書機）裝訂即完成

---

## 開發 / 除錯（進階）

- 核心排版邏輯在 `imposition.py`，可獨立用命令列測試：
  ```
  python imposition.py 你的檔案.docx
  ```
- GUI 程式在 `app.py`（Tkinter）
- 若 LibreOffice 版本更新導致資料夾結構改變，`imposition.py` 裡的
  `find_soffice()` 會自動遞迴搜尋 `LibreOfficePortable` 資料夾找
  `soffice.exe`，通常不需要修改
