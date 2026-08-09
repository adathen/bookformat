/* docxParser.js
 * Parses a .docx (ArrayBuffer) into an ordered list of "blocks":
 *   { type:'image', dataUrl, mime }
 *   { type:'paragraph', runs:[{text,bold,italic,sizePt}], align, pageBreakBefore }
 *   { type:'table', rows:[[cellText,...],...], pageBreakBefore }
 *
 * Also reports:
 *   hasExplicitBreaks - true if the document contains any real Word
 *     page-break markers (Ctrl+Enter or "page break before" paragraph
 *     setting), so the paginator can trust them fully.
 *   pageGeometry - the document's actual page size/margins (from
 *     w:pgSz/w:pgMar, converted from twips to CSS px), so on-screen
 *     rendering and real-layout page-break measurement use the same
 *     page dimensions Word itself would.
 */
const DocxParser = (() => {
  const NS = {
    w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  };

  function textOfNode(el) {
    return el.textContent || "";
  }

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

  function runInfo(rEl) {
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
    let text = "";
    let hasPageBreak = false;
    for (const c of rEl.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.tagName === "w:t") text += c.textContent;
      else if (c.tagName === "w:tab") text += "\t";
      else if (c.tagName === "w:br") {
        if (c.getAttribute("w:type") === "page") hasPageBreak = true;
        else text += "\n";
      }
    }
    return { text, bold, italic, sizePt, hasPageBreak };
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

  async function extractImagesFromParagraph(pEl, zip, rels, mediaCache) {
    const blips = allDescendantTag(pEl, "a:blip");
    const out = [];
    for (const blip of blips) {
      const embedId = blip.getAttribute("r:embed") || blip.getAttribute("r:link");
      if (!embedId) continue;
      const resolved = await resolveImageDataUrl(zip, rels, embedId, mediaCache);
      if (resolved && resolved.mime !== "image/x-emf" && resolved.mime !== "image/x-wmf") {
        out.push({ type: "image", dataUrl: resolved.dataUrl });
      }
    }
    return out;
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
  // at 96dpi so the on-screen render and the real-layout page-break
  // measurement both use the document's actual page geometry instead of an
  // arbitrary guess.
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
    let hasExplicitBreaks = false;
    const mediaCache = {};

    const children = Array.from(body.childNodes).filter((c) => c.nodeType === 1);
    let done = 0;
    let pendingBreak = false; // set when a mid-run Ctrl+Enter break was seen; applies to the *next* block
    for (const child of children) {
      done++;
      if (onProgress && done % 5 === 0) onProgress(done, children.length);

      if (child.tagName === "w:p") {
        const explicitBefore = paragraphPageBreakBefore(child);
        if (explicitBefore) hasExplicitBreaks = true;
        const effectiveBreak = pendingBreak || explicitBefore;
        pendingBreak = false;
        let breakConsumed = false;

        const images = await extractImagesFromParagraph(child, zip, rels, mediaCache);
        for (const img of images) {
          blocks.push(!breakConsumed && effectiveBreak ? { ...img, pageBreakBefore: true } : { ...img, pageBreakBefore: false });
          breakConsumed = true;
        }

        const runs = [];
        for (const r of allDescendantTag(child, "w:r")) {
          const info = runInfo(r);
          if (info.hasPageBreak) {
            hasExplicitBreaks = true;
            // everything from here on (this paragraph's remaining runs count
            // as "after" for our block-granularity purposes) starts a new page
            pendingBreak = true;
          }
          if (info.text.trim().length > 0) runs.push(info);
        }
        if (runs.length > 0) {
          blocks.push({
            type: "paragraph",
            runs,
            align: paragraphAlign(child),
            pageBreakBefore: !breakConsumed && effectiveBreak,
          });
        }
      } else if (child.tagName === "w:tbl") {
        const effectiveBreak = pendingBreak;
        pendingBreak = false;
        blocks.push(tableToBlock(child, effectiveBreak));
      }
    }

    return { blocks, hasExplicitBreaks, pageGeometry };
  }

  return { parseDocx };
})();
