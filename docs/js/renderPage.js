/* renderPage.js
 * Renders logical book pages into DOM elements, using the source
 * document's real page size/margins (set via configure()) so that:
 *   - the final per-page render (buildPageNode, used for html2canvas)
 *   - the continuous-flow measurement used for auto page-break detection
 *     (buildFlowNode, used by paginate.js)
 * both lay out content identically — same width, same margins, same
 * block styling — so measuring against the flow tells us accurately
 * what will and won't fit on a page.
 */
const RenderPage = (() => {
  let PAGE_W_PX = 794; // A4 @96dpi, overridden by configure() from the docx's own w:pgSz
  let PAGE_H_PX = 1123;
  let MARGIN_TOP_PX = 76;
  let MARGIN_RIGHT_PX = 76;
  let MARGIN_BOTTOM_PX = 76;
  let MARGIN_LEFT_PX = 76;
  const GAP_PX = 20;
  const PT_TO_PX = 96 / 72;

  function configure(geometry) {
    if (!geometry) return;
    if (geometry.pageWpx) PAGE_W_PX = geometry.pageWpx;
    if (geometry.pageHpx) PAGE_H_PX = geometry.pageHpx;
    if (geometry.marginTopPx != null) MARGIN_TOP_PX = geometry.marginTopPx;
    if (geometry.marginRightPx != null) MARGIN_RIGHT_PX = geometry.marginRightPx;
    if (geometry.marginBottomPx != null) MARGIN_BOTTOM_PX = geometry.marginBottomPx;
    if (geometry.marginLeftPx != null) MARGIN_LEFT_PX = geometry.marginLeftPx;
  }

  function contentHeightPx() {
    return PAGE_H_PX - MARGIN_TOP_PX - MARGIN_BOTTOM_PX;
  }

  function buildBlockElement(block) {
    if (block.type === "image") {
      const img = document.createElement("img");
      img.src = block.dataUrl;
      Object.assign(img.style, {
        maxWidth: "100%",
        // Absolute px, not "%", so this constrains identically whether the
        // element sits in a fixed-height page or an auto-height flow used
        // for measurement (a "%" max-height resolves to "none" against an
        // auto-height ancestor, which would make the two disagree).
        maxHeight: Math.round(PAGE_H_PX * 0.6) + "px",
        objectFit: "contain",
        borderRadius: "6px",
      });
      return img;
    }
    if (block.type === "paragraph") {
      const p = document.createElement("p");
      Object.assign(p.style, {
        margin: "0",
        width: "100%",
        textAlign: block.align === "center" ? "center" : block.align === "right" ? "right" : "left",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      });
      for (const r of block.runs) {
        const span = document.createElement("span");
        span.textContent = r.text;
        span.style.fontWeight = r.bold ? "700" : "400";
        span.style.fontStyle = r.italic ? "italic" : "normal";
        span.style.fontSize = Math.max(r.sizePt, 8) * PT_TO_PX + "px";
        p.appendChild(span);
      }
      return p;
    }
    // table
    const table = document.createElement("table");
    Object.assign(table.style, {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "16px",
    });
    for (const row of block.rows) {
      const tr = document.createElement("tr");
      for (const cellText of row) {
        const td = document.createElement("td");
        td.textContent = cellText;
        Object.assign(td.style, {
          border: "1px solid #ccc",
          padding: "8px 10px",
          textAlign: "left",
        });
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }

  function commonFlexStyle() {
    return {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: GAP_PX + "px",
      fontFamily: "'Noto Sans TC','Microsoft JhengHei',sans-serif",
      boxSizing: "border-box",
    };
  }

  function buildPageNode(blocks) {
    const page = document.createElement("div");
    page.className = "render-page";
    Object.assign(page.style, commonFlexStyle(), {
      width: PAGE_W_PX + "px",
      height: PAGE_H_PX + "px",
      background: "#ffffff",
      padding: `${MARGIN_TOP_PX}px ${MARGIN_RIGHT_PX}px ${MARGIN_BOTTOM_PX}px ${MARGIN_LEFT_PX}px`,
      overflow: "hidden",
    });
    for (const block of blocks) page.appendChild(buildBlockElement(block));
    return page;
  }

  // Same width/horizontal-margins/gap/fonts as buildPageNode, but no fixed
  // height and no top/bottom padding — used purely to measure how tall each
  // block renders in-flow, so paginate.js can figure out where real page
  // breaks should fall.
  function buildFlowNode(blocks) {
    const flow = document.createElement("div");
    Object.assign(flow.style, commonFlexStyle(), {
      width: PAGE_W_PX + "px",
      padding: `0 ${MARGIN_RIGHT_PX}px 0 ${MARGIN_LEFT_PX}px`,
    });
    const elements = blocks.map((b) => buildBlockElement(b));
    elements.forEach((el) => flow.appendChild(el));
    return { flow, elements };
  }

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

  function blockSnippet(block) {
    if (block.type === "image") {
      return { isImage: true, thumbSrc: block.dataUrl, text: "[圖片]" };
    }
    if (block.type === "paragraph") {
      const text = block.runs.map((r) => r.text).join("");
      return { isImage: false, text: text.slice(0, 60) || "（空段落）" };
    }
    if (block.type === "table") {
      const preview = block.rows.map((r) => r.join(" / ")).join("；").slice(0, 60);
      return { isImage: false, text: "[表格] " + preview };
    }
    return { isImage: false, text: "" };
  }

  return {
    configure,
    contentHeightPx,
    buildPageNode,
    buildFlowNode,
    waitForImages,
    blockSnippet,
    get PAGE_W_PX() {
      return PAGE_W_PX;
    },
    get PAGE_H_PX() {
      return PAGE_H_PX;
    },
    get PAGE_W_PT() {
      return PAGE_W_PX / PT_TO_PX;
    },
    get PAGE_H_PT() {
      return PAGE_H_PX / PT_TO_PX;
    },
  };
})();
