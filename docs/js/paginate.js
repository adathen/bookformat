/* paginate.js
 * Decides where page boundaries fall in a flat blocks[] array, producing
 * a boolean breakBefore[] (breakBefore[0] is always true).
 *
 * If the docx carries page-break markers — either real manual breaks or
 * Word's own <w:lastRenderedPageBreak/> record of its last layout — those
 * are used exclusively and reproduce Word's pagination exactly.
 *
 * Only when a document has neither (e.g. produced by a tool that never
 * laid it out) does this fall back to measuring: it renders the whole
 * document as one continuous flow (RenderPage.buildFlowNode, using the
 * document's real page width/margins) and measures, with the actual
 * browser layout engine, how tall each block renders, cutting a page
 * wherever content would overflow the real page height. That is a
 * genuine layout measurement rather than a character-count guess, but it
 * cannot match Word exactly (the document's real fonts are usually not
 * available in the browser), so it is meant to be corrected by the user
 * in the page-break editor.
 */
const Paginate = (() => {
  async function measureBreaks(blocks) {
    const n = blocks.length;
    const breakBefore = new Array(n).fill(false);
    if (n === 0) return breakBefore;
    breakBefore[0] = true;

    const stage = document.getElementById("renderStage");
    const { flow, elements } = RenderPage.buildFlowNode(blocks);
    stage.appendChild(flow);
    await RenderPage.waitForImages(flow);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const containerTop = flow.getBoundingClientRect().top;
    const rects = elements.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - containerTop, bottom: r.bottom - containerTop };
    });
    stage.removeChild(flow);

    const availH = RenderPage.contentHeightPx();
    let pageStart = rects[0].top;
    for (let i = 1; i < n; i++) {
      if (rects[i].bottom - pageStart > availH) {
        breakBefore[i] = true;
        pageStart = rects[i].top;
      }
    }
    return breakBefore;
  }

  function breaksFromMarkers(blocks) {
    const n = blocks.length;
    const breakBefore = new Array(n).fill(false);
    if (n === 0) return breakBefore;
    breakBefore[0] = true;
    for (let i = 1; i < n; i++) {
      if (blocks[i].pageBreakBefore) breakBefore[i] = true;
    }
    return breakBefore;
  }

  async function computeInitialBreaks(blocks, useMarkers) {
    if (blocks.length === 0) return [];
    return useMarkers ? breaksFromMarkers(blocks) : await measureBreaks(blocks);
  }

  function blocksToPages(blocks, breakBefore) {
    const pages = [];
    let current = [];
    blocks.forEach((b, i) => {
      if (breakBefore[i] && current.length > 0) {
        pages.push(current);
        current = [];
      }
      current.push(b);
    });
    if (current.length > 0) pages.push(current);
    return pages;
  }

  return { computeInitialBreaks, blocksToPages };
})();
