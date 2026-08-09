/* docxParser.js
 * Parses a .docx (ArrayBuffer) into an ordered list of "blocks":
 *   { type:'image', dataUrl, pageBreakBefore }
 *   { type:'paragraph', runs:[{text,bold,italic,sizePt}], align, pageBreakBefore }
 *   { type:'table', rows:[[cellText,...],...], pageBreakBefore }
 *
 * Also reports:
 *   breakSource - where the page boundaries came from:
 *     'manual'     - the document has real manual page breaks
 *                    (Ctrl+Enter / "page break before"); authoritative.
 *     'word-layout'- the document has Word's own <w:lastRenderedPageBreak/>
 *                    markers, which Word writes at every position where a
 *                    page broke the last time IT laid the document out.
 *                    This reproduces Word's pagination exactly, which no
 *                    amount of re-measuring in a browser can match (the
 *                    document's real fonts usually aren't available here).
 *     'none'       - neither; the caller must estimate page boundaries.
 *   pageGeometry - the document's actual page size/margins (from
 *     w:pgSz/w:pgMar, converted from twips to CSS px).
 *
 * Paragraphs are walked in true document order (text / breaks / images
 * interleaved as they actually appear) because a page break can fall in
 * the middle of a paragraph, and because most break-carrying paragraphs
 * here also anchor an image — so a break must be able to land between
 * them, not just at paragraph boundaries.
 */
const DocxParser = (() => {
  function firstChildTag(el, tag) {
    for (const c of el.childNodes) {
      if (c.nodeType === 1 && c.tagName === tag) return c;
    }
    return null;
  }

  // Like getElementsByTagName, but skips mc:Fallback subtrees. Word wraps
  // shapes/text boxes in <mc:AlternateContent><mc:Choice>...modern
  // DrawingML...</mc:Choice><mc:Fallback>...legacy VML, same
  // content...</mc:Fallback></mc:AlternateContent>; walking both branches
  // would double-count text and images.
  function allDescendantTag(el, tag, out) {
    out = out || [];
    for (const child of Array.from(el.children || [])) {
      if (child.tagName === "mc:Fallback") continue;
      if (child.tagName === tag) out.push(child);
      allDescendantTag(child, tag, out);
    }
    return out;
  }

  function runFormat(rEl) {
    const rPr = firstChildTag(rEl, "w:rPr");
    let bold = false, italic = false, sizePt = 11;
    if (rPr) {
      const b = firstChildTag(rPr, "w:b");
      const i = firstChildTag(rPr, "w:i");
      const sz = firstChildTag(rPr, "w:sz");
      if (b && b.getAttribute("w:val") !== "0" && b.getAttribute("w:val") !== "false") bold = true;
      if (i && i.getAttribute("w:val") !== "0" && i.getAttribute("w:val") !== "false") italic = true;
      if (sz) {
        const v = parseInt(sz.getAttribute("w:val"), 10);
        if (!isNaN(v)) sizePt = v / 2;
      }
    }
    return { bold, italic, sizePt };
  }

  const DRAWING_TAGS = new Set(["w:drawing", "mc:AlternateContent", "w:pict", "w:object"]);

  // Flattens a paragraph into an ordered event stream:
  //   {kind:'text', run}  {kind:'break', manual}  {kind:'image', embedId}
  function collectParagraphEvents(pEl) {
    const events = [];
    for (const rEl of allDescendantTag(pEl, "w:r")) {
      const fmt = runFormat(rEl);
      let text = "";
      const flushText = () => {
        if (text.length > 0) {
          events.push({ kind: "text", run: { ...fmt, text } });
          text = "";
        }
      };
      for (const c of Array.from(rEl.childNodes)) {
        if (c.nodeType !== 1) continue;
        const tag = c.tagName;
        if (tag === "w:t") {
          text += c.textContent;
        } else if (tag === "w:tab") {
          text += "\t";
        } else if (tag === "w:br") {
          if (c.getAttribute("w:type") === "page") {
            flushText();
            events.push({ kind: "break", manual: true });
          } else {
            text += "\n";
          }
        } else if (tag === "w:lastRenderedPageBreak") {
          flushText();
          events.push({ kind: "break", manual: false });
        } else if (DRAWING_TAGS.has(tag)) {
          flushText();
          for (const blip of allDescendantTag(c, "a:blip")) {
            const id = blip.getAttribute("r:embed") || blip.getAttribute("r:link");
            if (id) events.push({ kind: "image", embedId: id });
          }
        }
      }
      flushText();
    }
    return events;
  }

  function paragraphPageBreakBefore(pEl) {
    const pPr = firstChildTag(pEl, "w:pPr");
    if (!pPr) return false;
    return !!firstChildTag(pPr, "w:pageBreakBefore");
  }

  function paragraphAlign(pEl) {
    const pPr = firstChildTag(pEl, "w:pPr");
    if (!pPr) return null;
    const jc = firstChildTag(pPr, "w:jc");
    return jc ? jc.getAttribute("w:val") : null;
  }

  async function resolveImageDataUrl(zip, rels, embedId, mediaCache) {
    const rel = rels[embedId];
    if (!rel) return null;
    const path = "word/" + rel.replace(/^\/?word\//, "").replace(/^\.?\//, "");
    const normPath = rel.startsWith("media/") ? "word/" + rel : path;
    const zipPath = zip.file(normPath) ? normPath : "word/" + rel.replace(/^\.\.\//, "");
    if (mediaCache[zipPath]) return mediaCache[zipPath];
    const file = zip.file(zipPath) || zip.file(rel) || zip.file("word/" + rel);
    if (!file) return null;
    const base64 = await file.async("base64");
    const ext = zipPath.split(".").pop().toLowerCase();
    const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", emf: "image/x-emf", wmf: "image/x-wmf" };
    const mime = mimeMap[ext] || "image/png";
    const dataUrl = `data:${mime};base64,${base64}`;
    mediaCache[zipPath] = { dataUrl, mime };
    return { dataUrl, mime };
  }

  function tableToBlock(tblEl, pageBreakBefore) {
    const rows = [];
    for (const tr of allDescendantTag(tblEl, "w:tr")) {
      const cells = [];
      for (const tc of allDescendantTag(tr, "w:tc")) {
        const texts = allDescendantTag(tc, "w:t").map((t) => t.textContent);
        cells.push(texts.join(""));
      }
      rows.push(cells);
    }
    return { type: "table", rows, pageBreakBefore };
  }

  // Word stores page size/margins in twips (1/1440 inch). Convert to CSS px
  // at 96dpi so rendering uses the document's actual page geometry instead
  // of an arbitrary guess.
  const TWIP_TO_PX = 96 / 1440;
  const DEFAULT_GEOMETRY = {
    pageWpx: 794,
    pageHpx: 1123,
    marginTopPx: 76,
    marginRightPx: 76,
    marginBottomPx: 76,
    marginLeftPx: 76,
  };

  function extractPageGeometry(doc) {
    const pgSz = doc.getElementsByTagName("w:pgSz")[0];
    const pgMar = doc.getElementsByTagName("w:pgMar")[0];
    const geometry = { ...DEFAULT_GEOMETRY };
    if (pgSz) {
      const w = parseInt(pgSz.getAttribute("w:w"), 10);
      const h = parseInt(pgSz.getAttribute("w:h"), 10);
      if (!isNaN(w)) geometry.pageWpx = Math.round(w * TWIP_TO_PX);
      if (!isNaN(h)) geometry.pageHpx = Math.round(h * TWIP_TO_PX);
    }
    if (pgMar) {
      const top = parseInt(pgMar.getAttribute("w:top"), 10);
      const right = parseInt(pgMar.getAttribute("w:right"), 10);
      const bottom = parseInt(pgMar.getAttribute("w:bottom"), 10);
      const left = parseInt(pgMar.getAttribute("w:left"), 10);
      if (!isNaN(top)) geometry.marginTopPx = Math.round(top * TWIP_TO_PX);
      if (!isNaN(right)) geometry.marginRightPx = Math.round(right * TWIP_TO_PX);
      if (!isNaN(bottom)) geometry.marginBottomPx = Math.round(bottom * TWIP_TO_PX);
      if (!isNaN(left)) geometry.marginLeftPx = Math.round(left * TWIP_TO_PX);
    }
    return geometry;
  }

  async function parseDocx(arrayBuffer, onProgress) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    const relsXmlText = await zip.file("word/_rels/document.xml.rels").async("string");
    const relsDoc = new DOMParser().parseFromString(relsXmlText, "application/xml");
    const rels = {};
    for (const rel of Array.from(relsDoc.getElementsByTagName("Relationship"))) {
      rels[rel.getAttribute("Id")] = rel.getAttribute("Target");
    }

    const docXmlText = await zip.file("word/document.xml").async("string");
    const doc = new DOMParser().parseFromString(docXmlText, "application/xml");
    const body = doc.getElementsByTagName("w:body")[0];
    if (!body) throw new Error("找不到文件內容（word/body），檔案可能已損毀。");
    const pageGeometry = extractPageGeometry(doc);

    const blocks = [];
    const mediaCache = {};
    let sawManualBreak = false;
    let sawWordLayoutBreak = false;

    // A break applies to the *next* block emitted, whichever kind it is.
    let pendingBreak = false;
    const takeBreak = () => {
      if (!pendingBreak) return false;
      pendingBreak = false;
      return true;
    };

    const children = Array.from(body.childNodes).filter((c) => c.nodeType === 1);
    let done = 0;
    for (const child of children) {
      done++;
      if (onProgress && done % 5 === 0) onProgress(done, children.length);

      if (child.tagName === "w:p") {
        if (paragraphPageBreakBefore(child)) {
          sawManualBreak = true;
          pendingBreak = true;
        }
        const align = paragraphAlign(child);

        let runsAcc = [];
        const flushParagraph = () => {
          if (runsAcc.length === 0) return;
          blocks.push({ type: "paragraph", runs: runsAcc, align, pageBreakBefore: takeBreak() });
          runsAcc = [];
        };

        for (const ev of collectParagraphEvents(child)) {
          if (ev.kind === "text") {
            if (ev.run.text.trim().length > 0) runsAcc.push(ev.run);
          } else if (ev.kind === "break") {
            // text accumulated so far belongs to the page being ended
            flushParagraph();
            if (ev.manual) sawManualBreak = true;
            else sawWordLayoutBreak = true;
            pendingBreak = true;
          } else if (ev.kind === "image") {
            flushParagraph();
            const resolved = await resolveImageDataUrl(zip, rels, ev.embedId, mediaCache);
            if (resolved && resolved.mime !== "image/x-emf" && resolved.mime !== "image/x-wmf") {
              blocks.push({ type: "image", dataUrl: resolved.dataUrl, pageBreakBefore: takeBreak() });
            }
          }
        }
        flushParagraph();
      } else if (child.tagName === "w:tbl") {
        // A table that itself straddles a page boundary carries the break
        // markers inside its cells. Block-level granularity can't split a
        // table, so the break is applied after it — an approximation that
        // keeps the page count right; the user can adjust if needed.
        const innerBreaks = allDescendantTag(child, "w:lastRenderedPageBreak").length;
        blocks.push(tableToBlock(child, takeBreak()));
        if (innerBreaks > 0) {
          sawWordLayoutBreak = true;
          pendingBreak = true;
        }
      }
    }

    const breakSource = sawManualBreak ? "manual" : sawWordLayoutBreak ? "word-layout" : "none";
    return { blocks, breakSource, pageGeometry };
  }

  return { parseDocx };
})();
