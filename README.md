# 小書轉換器

選擇一份排好版的 `.docx`（每頁一圖一文，跟書的內容順序一樣），自動輸出一份
**小書格式 PDF**：把頁面重新排成適合印刷、對摺、裝訂成小冊子的順序，頁數不同
會自動判斷並補上空白頁（補到 4 的倍數）。

原理：把 N 頁內容分成 N/4 張紙，每張紙正反面各印 2 頁（左右並排），排列順序讓
你雙面列印後，沿中線對摺 / 裁切、依序疊起來就會變成正確頁碼順序的小書。

本專案有兩種版本：

- **網頁版**（`docs/` 資料夾，透過 GitHub Pages 發布）：免安裝，開網址、上傳
  docx 或 pdf、下載小書格式 PDF，全部在瀏覽器內完成，檔案不會上傳到任何伺服器。
  支援兩種來源檔案：
  - **上傳 .docx**：一般由 Word 存檔的 docx 都會帶有分頁資訊（手動分頁點，或
    Word 自己記錄的 `w:lastRenderedPageBreak`），程式會直接採用，分頁位置與
    原始 Word **完全一致**，也不需要任何確認步驟，上傳後直接產生 PDF。
    只有在文件完全沒有分頁資訊時（例如由其他工具產生、從未經 Word 排版過），
    才會退而用實際版面測量推算分頁，並顯示確認畫面讓你調整。
  - **上傳已排好版的 .pdf**（例如先用 Word／LibreOffice 另存新檔匯出的
    PDF，一頁對應一頁書的內容）：不需要判斷分頁，直接把原始頁面嵌入拼版，
    保留原始向量畫質、檔案更小，是精準度最高的方式。
- **桌面版**（`app.py` / `imposition.py`）：透過 LibreOffice 轉檔，忠實還原
  Word 原始排版，適合需要精準還原原始版面的情況，見下方安裝說明。

---

## 網頁版

發布網址：**https://adathen.github.io/bookformat/**
（若尚未啟用：GitHub repo → Settings → Pages → Source 選擇
`Deploy from a branch`，Branch 選 `main` / `docs`）

原始碼在 `docs/`：
- `index.html` / `style.css` — 頁面與樣式
- `js/docxParser.js` — 用 JSZip 解析 docx 內容（段落、圖片、表格、從
  w:pgSz/w:pgMar 讀取實際頁面尺寸與邊界）。分頁標記依可靠度分三種來源：
  `manual`（手動分頁點）、`word-layout`（Word 自己記錄的
  `w:lastRenderedPageBreak`，即 Word 上次排版時的實際分頁位置）、`none`。
  段落是依文件真實順序走訪的（文字／分頁／圖片交錯），因為分頁點可能落在
  段落中間（例如「尊重」兩字被拆到兩頁），也可能落在圖片與文字之間。
- `js/renderPage.js` — 把內容畫成 DOM 元素，統一供兩處使用：
  `buildPageNode`（固定頁面尺寸，給 html2canvas 轉成最終頁面圖片）與
  `buildFlowNode`（同寬度／邊界但不限高，給 paginate.js 做版面測量）——
  兩者共用同一份 `buildBlockElement`，確保測量結果跟最終渲染一致
- `js/paginate.js` — 分頁邏輯：文件有分頁標記時 100% 依照標記（與 Word 一致）；
  完全沒有標記時，才用 `RenderPage.buildFlowNode` 把整份文件連續排版，量測每個
  區塊實際渲染高度，依文件真實頁面內容高度推算分頁位置
- `js/pdfBuilder.js` — docx 路徑第一階段：用 html2canvas 把每頁轉成圖片，組成
  一份跟原始 docx 頁面順序一樣的「原始版面 PDF」（尚未拼版）
- `js/pdfImposer.js` — 唯一的拼版邏輯：把一份原始版面 PDF（不論是上面產生
  的，還是使用者直接上傳的 pdf）依拼版公式嵌入小書格式 PDF。docx 路徑跟
  pdf 路徑最後都會呼叫這裡，只有這一份拼版程式碼。
- `js/main.js` — UI 串接（依副檔名分流 docx／pdf、分頁編輯器、產生／下載 PDF）

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
