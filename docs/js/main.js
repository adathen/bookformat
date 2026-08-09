/* main.js — UI glue */
(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileNameEl = document.getElementById("fileName");

  const statusSection = document.getElementById("status-section");
  const statusText = document.getElementById("statusText");
  const progressBar = document.getElementById("progressBar");

  const editorSection = document.getElementById("editor-section");
  const blockListEl = document.getElementById("blockList");
  const pageCountEl = document.getElementById("pageCount");
  const generateBtn = document.getElementById("generateBtn");

  const resultSection = document.getElementById("result-section");
  const resultText = document.getElementById("resultText");
  const downloadLink = document.getElementById("downloadLink");
  const restartBtn = document.getElementById("restartBtn");

  const errorSection = document.getElementById("error-section");
  const errorText = document.getElementById("errorText");
  const errorRestartBtn = document.getElementById("errorRestartBtn");

  let state = { blocks: [], breakBefore: [], baseName: "小書" };

  function showOnly(section) {
    for (const s of [statusSection, editorSection, resultSection, errorSection]) {
      s.hidden = s !== section;
    }
  }

  function setStatus(msg, pct) {
    statusText.textContent = msg;
    if (typeof pct === "number") progressBar.value = pct;
  }

  function showError(msg) {
    errorText.textContent = msg;
    showOnly(errorSection);
  }

  function countPages() {
    return state.breakBefore.filter(Boolean).length;
  }

  function pageIndexOfBlock(i) {
    let count = 0;
    for (let j = 0; j <= i; j++) if (state.breakBefore[j]) count++;
    return count;
  }

  function renderEditor() {
    blockListEl.innerHTML = "";
    const frag = document.createDocumentFragment();

    state.blocks.forEach((block, i) => {
      if (i > 0) {
        const gap = document.createElement("div");
        gap.className = "break-gap" + (state.breakBefore[i] ? " is-break" : "");
        gap.dataset.page = pageIndexOfBlock(i);
        gap.addEventListener("click", () => {
          state.breakBefore[i] = !state.breakBefore[i];
          renderEditor();
        });
        frag.appendChild(gap);
      }

      const snippet = RenderPage.blockSnippet(block);
      const item = document.createElement("div");
      item.className = "block-item" + (snippet.isImage ? " is-image" : "");
      if (snippet.isImage) {
        const img = document.createElement("img");
        img.className = "thumb";
        img.src = snippet.thumbSrc;
        item.appendChild(img);
      }
      const span = document.createElement("div");
      span.className = "snippet";
      span.textContent = snippet.text;
      item.appendChild(span);
      frag.appendChild(item);
    });

    blockListEl.appendChild(frag);
    pageCountEl.textContent = countPages();
  }

  async function handleFile(file) {
    const name = file && file.name.toLowerCase();
    if (!file || (!name.endsWith(".docx") && !name.endsWith(".pdf"))) {
      showError("請選擇 .docx 或 .pdf 檔案。");
      return;
    }
    fileNameEl.textContent = file.name;
    if (name.endsWith(".pdf")) {
      await handlePdfFile(file);
    } else {
      await handleDocxFile(file);
    }
  }

  async function handleDocxFile(file) {
    state.baseName = file.name.replace(/\.docx$/i, "");
    showOnly(statusSection);
    setStatus("正在讀取檔案...", 5);

    try {
      const buf = await file.arrayBuffer();
      setStatus("正在解析 docx 內容...", 15);
      const { blocks, hasExplicitBreaks } = await DocxParser.parseDocx(buf, (done, total) => {
        setStatus(`正在解析 docx 內容...（${done}/${total}）`, 15 + Math.round((done / total) * 20));
      });
      if (blocks.length === 0) {
        showError("這份文件沒有偵測到任何內容（文字或圖片），請確認檔案是否正確。");
        return;
      }
      state.blocks = blocks;
      state.breakBefore = Paginate.computeInitialBreaks(blocks, hasExplicitBreaks);
      renderEditor();
      showOnly(editorSection);
    } catch (err) {
      console.error(err);
      showError("讀取 docx 時發生錯誤：" + (err && err.message ? err.message : err));
    }
  }

  async function handlePdfFile(file) {
    state.baseName = file.name.replace(/\.pdf$/i, "");
    showOnly(statusSection);
    setStatus("正在讀取檔案...", 5);

    try {
      const buf = await file.arrayBuffer();
      const { bytes, pageCount } = await PdfImposer.imposeFlatPdfBytes(buf, setStatus);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = `${state.baseName}(小書格式).pdf`;
      resultText.textContent = `偵測到原始 PDF 共 ${pageCount} 頁，已直接依原始頁面排版為適合對摺裝訂的小書格式 PDF（未經過重新繪製，保留原始畫質）。`;
      showOnly(resultSection);
    } catch (err) {
      console.error(err);
      showError("處理 PDF 時發生錯誤：" + (err && err.message ? err.message : err));
    }
  }

  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  generateBtn.addEventListener("click", async () => {
    showOnly(statusSection);
    setStatus("準備產生 PDF...", 0);
    try {
      const pages = Paginate.blocksToPages(state.blocks, state.breakBefore);
      const pdfBytes = await PdfBuilder.build(pages, setStatus);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = `${state.baseName}(小書格式).pdf`;
      resultText.textContent = `共 ${pages.length} 頁內容，已排版為適合對摺裝訂的小書格式 PDF。`;
      showOnly(resultSection);
    } catch (err) {
      console.error(err);
      showError("產生 PDF 時發生錯誤：" + (err && err.message ? err.message : err));
    }
  });

  restartBtn.addEventListener("click", () => location.reload());
  errorRestartBtn.addEventListener("click", () => location.reload());
})();
