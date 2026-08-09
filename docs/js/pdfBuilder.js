/* pdfBuilder.js — docx path, stage 1 of 2
 * 1) Rasterizes each confirmed logical page (via html2canvas) into a JPEG.
 * 2) Assembles those JPEGs into a normal flat, sequential-order PDF —
 *    the same shape as if the docx had been exported straight to PDF
 *    (one page per book page, in reading order, not yet imposed).
 * 3) Hands that flat PDF to PdfImposer (js/pdfImposer.js) for the actual
 *    booklet imposition — the same code path used for direct PDF
 *    uploads, so there is exactly one imposition implementation.
 */
const PdfBuilder = (() => {
  async function renderPagesToJpegBytes(pages, statusCb) {
    const stage = document.getElementById("renderStage");
    stage.innerHTML = "";
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const results = [];
    for (let i = 0; i < pages.length; i++) {
      statusCb(`正在繪製第 ${i + 1}/${pages.length} 頁...`, Math.round((i / pages.length) * 45));
      const node = RenderPage.buildPageNode(pages[i]);
      stage.appendChild(node);
      await RenderPage.waitForImages(node);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      const buf = new Uint8Array(await blob.arrayBuffer());
      results.push(buf);
      stage.removeChild(node);
    }
    return results;
  }

  async function buildFlatPdfBytes(pageJpegBytesArr, statusCb) {
    const { PDFDocument } = window.PDFLib;
    const pageW = RenderPage.PAGE_W_PT;
    const pageH = RenderPage.PAGE_H_PT;

    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageJpegBytesArr.length; i++) {
      statusCb(`正在組成原始版面 PDF...（第 ${i + 1}/${pageJpegBytesArr.length} 頁）`, 45 + Math.round((i / pageJpegBytesArr.length) * 15));
      const img = await pdfDoc.embedJpg(pageJpegBytesArr[i]);
      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
    }
    return await pdfDoc.save();
  }

  async function build(pages, statusCb) {
    const pageJpegBytesArr = await renderPagesToJpegBytes(pages, statusCb);
    const flatPdfBytes = await buildFlatPdfBytes(pageJpegBytesArr, statusCb);

    const { bytes } = await PdfImposer.imposeFlatPdfBytes(flatPdfBytes, (msg, pct) => {
      statusCb(msg, 60 + Math.round((pct || 0) * 0.4));
    });
    return bytes;
  }

  return { build };
})();
