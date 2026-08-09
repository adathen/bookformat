/* paginate.js
 * Decides where page boundaries fall in a flat blocks[] array, producing
 * a boolean breakBefore[] (breakBefore[0] is always true).
 *
 * If the docx has explicit page-break markers, those are used exclusively
 * (100% reliable). Otherwise falls back to a heuristic: every image starts
 * a new page, and long runs of text-only blocks (no image) are additionally
 * split once they exceed a character budget, so text-only sections don't
 * collapse into one giant page. This heuristic is a best-effort guess and
 * is meant to be corrected by the user in the page-break editor.
 */
const Paginate = (() => {
  const CHAR_BUDGET = 380;
  const TABLE_ROW_WEIGHT = 45;

  function blockWeight(block) {
    if (block.type === "paragraph") {
      return block.runs.reduce((sum, r) => sum + r.text.length, 0);
    }
    if (block.type === "table") {
      return block.rows.length * TABLE_ROW_WEIGHT;
    }
    return 0;
  }

  function computeInitialBreaks(blocks, hasExplicitBreaks) {
    const n = blocks.length;
    const breakBefore = new Array(n).fill(false);
    if (n === 0) return breakBefore;
    breakBefore[0] = true;

    if (hasExplicitBreaks) {
      for (let i = 1; i < n; i++) {
        if (blocks[i].pageBreakBefore) breakBefore[i] = true;
      }
      return breakBefore;
    }

    let budget = 0;
    for (let i = 1; i < n; i++) {
      const b = blocks[i];
      if (b.type === "image") {
        breakBefore[i] = true;
        budget = 0;
        continue;
      }
      const w = blockWeight(b);
      if (budget > 0 && budget + w > CHAR_BUDGET) {
        breakBefore[i] = true;
        budget = 0;
      }
      budget += w;
    }
    return breakBefore;
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
