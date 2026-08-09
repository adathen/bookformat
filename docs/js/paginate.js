/* paginate.js
 * Decides where page boundaries fall in a flat blocks[] array, producing
 * a boolean breakBefore[] (breakBefore[0] is always true).
 *
 * If the docx has explicit page-break markers, those are used exclusively
 * (100% reliable — matches Word exactly). Otherwise, this renders the
 * whole document as one continuous flow (RenderPage.buildFlowNode, using
 * the document's real page width/margins) and measures, with the actual
 * browser layout engine, how tall each block renders — then walks that
 * measured flow and cuts a page wherever the next block would overflow
 * the document's real page content height. This is a genuine layout
 * measurement, not a character-count guess, but it still won't be
 * byte-identical to Word (different font metrics/line-breaking rules),
 * so it's meant to be corrected by the user in the page-break editor.
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

  function breaksFromExplicitMarkers(blocks) {
    const n = blocks.length;
    const breakBefore = new Array(n).fill(false);
    if (n === 0) return breakBefore;
    breakBefore[0] = true;
    for (let i = 1; i < n; i++) {
      if (blocks[i].pageBreakBefore) breakBefore[i] = true;
    }
    return breakBefore;
  }

  async function computeInitialBreaks(blocks, hasExplicitBreaks) {
    if (blocks.length === 0) return [];
    return hasExplicitBreaks ? breaksFromExplicitMarkers(blocks) : await measureBreaks(blocks);
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
