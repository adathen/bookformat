/* pdfImposer.js
 * Imposes an already-flat, sequential-order PDF (e.g. exported straight
 * from Word/LibreOffice, one book page per PDF page) into the landscape,
 * 2-up, signature-ordered booklet PDF — without any rasterization, by
 * embedding the original vector pages directly. Needs no page-break
 * guessing since a PDF's pages are already unambiguous.
 *
 * Page size is read from the source PDF itself (pageW/pageH below), not
 * assumed to be A4 — a sequential A5-per-page PDF (e.g. printed straight
 * from a docx whose page setup was changed to A5) works the same way:
 * two A5 pages side by side land almost exactly on an A4 landscape
 * sheet, which is the standard real-world "A5 booklet on A4 paper" setup.
 *
 * Same imposition formula as the docx path / desktop tool: for N pages
 * padded to a multiple of 4, sheet k (0-indexed):
 *   front: [ page(N-2k) | page(2k+1) ]
 *   back : [ page(2k+2) | page(N-2k-1) ]
 */
const PdfImposer = (() => {
  async function imposeFlatPdfBytes(srcBytes, statusCb) {
    const { PDFDocument } = window.PDFLib;

    statusCb("正在讀取 PDF...", 5);
    const srcDoc = await PDFDocument.load(srcBytes);
    const n = srcDoc.getPageCount();
    if (n === 0) throw new Error("這份 PDF 沒有任何頁面。");

    const pad = (4 - (n % 4)) % 4;
    const nPad = n + pad;

    const outDoc = await PDFDocument.create();

    statusCb("正在嵌入原始頁面...", 15);
    const embeddedPages = await outDoc.embedPdf(srcBytes, [...Array(n).keys()]);

    const pageW = Math.max(...embeddedPages.map((p) => p.width));
    const pageH = Math.max(...embeddedPages.map((p) => p.height));
    const sheetW = pageW * 2;
    const sheetH = pageH;
    const margin = 10;

    function place(page, slot, idx1) {
      if (idx1 > n) return; // blank padding page
      const ep = embeddedPages[idx1 - 1];
      const availW = pageW - 2 * margin;
      const availH = pageH - 2 * margin;
      const scale = Math.min(availW / ep.width, availH / ep.height);
      const w = ep.width * scale;
      const h = ep.height * scale;
      const cx = slot * pageW + pageW / 2;
      const cy = pageH / 2;
      page.drawPage(ep, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
    }

    const sheets = nPad / 4;
    for (let k = 0; k < sheets; k++) {
      statusCb(`正在拼版第 ${k + 1}/${sheets} 張...`, 20 + Math.round((k / sheets) * 75));
      const front = outDoc.addPage([sheetW, sheetH]);
      place(front, 0, nPad - 2 * k);
      place(front, 1, 2 * k + 1);

      const back = outDoc.addPage([sheetW, sheetH]);
      place(back, 0, 2 * k + 2);
      place(back, 1, nPad - 2 * k - 1);
    }

    statusCb("正在輸出檔案...", 98);
    return { bytes: await outDoc.save(), pageCount: n };
  }

  return { imposeFlatPdfBytes };
})();
