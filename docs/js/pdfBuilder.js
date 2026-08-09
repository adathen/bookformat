/* pdfBuilder.js
 * 1) Rasterizes each confirmed logical page (via html2canvas) into a PNG.
 * 2) Imposes those PNGs into a landscape, 2-up, signature-ordered PDF
 *    ready for duplex printing + center-fold / saddle-stitch binding.
 *
 * Imposition formula (same as the desktop tool, verified against a
 * hand-made reference booklet): for N pages padded to a multiple of 4,
 * sheet k (0-indexed):
 *   front: [ page(N-2k) | page(2k+1) ]
 *   back : [ page(2k+2) | page(N-2k-1) ]
 */
const PdfBuilder = (() => {
  function waitForImages(node) {
    const imgs = Array.from(node.querySelectorAll("img"));
    return Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((res) => {
              img.onload = res;
              img.onerror = res;
            })
      )
    );
  }

  async function renderPagesToJpegBytes(pages, statusCb) {
    const stage = document.getElementById("renderStage");
    stage.innerHTML = "";
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const results = [];
    for (let i = 0; i < pages.length; i++) {
      statusCb(`正在繪製第 ${i + 1}/${pages.length} 頁...`, Math.round((i / pages.length) * 60));
      const node = RenderPage.buildPageNode(pages[i]);
      stage.appendChild(node);
      await waitForImages(node);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      const buf = new Uint8Array(await blob.arrayBuffer());
      results.push(buf);
      stage.removeChild(node);
    }
    return results;
  }

  async function buildBookletPdfBytes(pageJpegBytesArr, statusCb) {
    const { PDFDocument } = window.PDFLib;
    const n = pageJpegBytesArr.length;
    const pad = (4 - (n % 4)) % 4;
    const nPad = n + pad;

    const pageW = RenderPage.PAGE_W_PT;
    const pageH = RenderPage.PAGE_H_PT;
    const sheetW = pageW * 2;
    const sheetH = pageH;
    const margin = 10;

    const pdfDoc = await PDFDocument.create();
    const embedCache = new Map();

    async function embedded(idx1) {
      if (idx1 > n) return null;
      if (embedCache.has(idx1)) return embedCache.get(idx1);
      const img = await pdfDoc.embedJpg(pageJpegBytesArr[idx1 - 1]);
      embedCache.set(idx1, img);
      return img;
    }

    async function place(page, slot, idx1) {
      const img = await embedded(idx1);
      if (!img) return;
      const availW = pageW - 2 * margin;
      const availH = pageH - 2 * margin;
      const scale = Math.min(availW / img.width, availH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const cx = slot * pageW + pageW / 2;
      const cy = pageH / 2;
      page.drawImage(img, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
    }

    const sheets = nPad / 4;
    for (let k = 0; k < sheets; k++) {
      statusCb(`正在拼版第 ${k + 1}/${sheets} 張...`, 60 + Math.round((k / sheets) * 35));
      const front = pdfDoc.addPage([sheetW, sheetH]);
      await place(front, 0, nPad - 2 * k);
      await place(front, 1, 2 * k + 1);

      const back = pdfDoc.addPage([sheetW, sheetH]);
      await place(back, 0, 2 * k + 2);
      await place(back, 1, nPad - 2 * k - 1);
    }

    statusCb("正在輸出檔案...", 98);
    return await pdfDoc.save();
  }

  async function build(pages, statusCb) {
    const pageJpegBytesArr = await renderPagesToJpegBytes(pages, statusCb);
    const pdfBytes = await buildBookletPdfBytes(pageJpegBytesArr, statusCb);
    return pdfBytes;
  }

  return { build };
})();
