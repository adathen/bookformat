/* main.js — UI glue (PDF-only: upload a flat PDF, download the imposed booklet) */
(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileNameEl = document.getElementById("fileName");

  const statusSection = document.getElementById("status-section");
  const statusText = document.getElementById("statusText");
  const progressBar = document.getElementById("progressBar");

  const resultSection = document.getElementById("result-section");
  const resultText = document.getElementById("resultText");
  const downloadLink = document.getElementById("downloadLink");
  const restartBtn = document.getElementById("restartBtn");

  const errorSection = document.getElementById("error-section");
  const errorText = document.getElementById("errorText");
  const errorRestartBtn = document.getElementById("errorRestartBtn");

  function showOnly(section) {
    for (const s of [statusSection, resultSection, errorSection]) {
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

  async function handleFile(file) {
    const name = file && file.name.toLowerCase();
    if (!file || !name.endsWith(".pdf")) {
      showError("請選擇 .pdf 檔案。");
      return;
    }
    fileNameEl.textContent = file.name;
    const baseName = file.name.replace(/\.pdf$/i, "");

    showOnly(statusSection);
    setStatus("正在讀取檔案...", 5);

    try {
      const buf = await file.arrayBuffer();
      const { bytes, pageCount } = await PdfImposer.imposeFlatPdfBytes(buf, setStatus);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = `${baseName}(小書格式).pdf`;
      resultText.textContent = `偵測到原始 PDF 共 ${pageCount} 頁，已依原始頁面排版為適合對摺裝訂的小書格式 PDF（未經過重新繪製，保留原始畫質）。`;
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

  restartBtn.addEventListener("click", () => location.reload());
  errorRestartBtn.addEventListener("click", () => location.reload());
})();
