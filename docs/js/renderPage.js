/* renderPage.js
 * Renders one logical book page (array of blocks) into a fixed-size DOM
 * element suitable for html2canvas rasterization, and provides small
 * preview snippets for the page-break editor list.
 */
const RenderPage = (() => {
  const PAGE_W_PX = 1240; // ~A4 @150dpi
  const PAGE_H_PX = 1754;
  const PAGE_W_PT = 595.28; // A4 portrait, points
  const PAGE_H_PT = 841.89;

  function buildPageNode(blocks) {
    const page = document.createElement("div");
    page.className = "render-page";
    Object.assign(page.style, {
      width: PAGE_W_PX + "px",
      height: PAGE_H_PX + "px",
      background: "#ffffff",
      padding: "70px 60px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "24px",
      fontFamily: "'Noto Sans TC','Microsoft JhengHei',sans-serif",
      overflow: "hidden",
      boxSizing: "border-box",
    });

    for (const block of blocks) {
      if (block.type === "image") {
        const img = document.createElement("img");
        img.src = block.dataUrl;
        Object.assign(img.style, {
          maxWidth: "100%",
          maxHeight: "62%",
          objectFit: "contain",
          borderRadius: "6px",
        });
        page.appendChild(img);
      } else if (block.type === "paragraph") {
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
          span.style.fontSize = Math.max(r.sizePt, 8) * 1.55 + "px";
          p.appendChild(span);
        }
        page.appendChild(p);
      } else if (block.type === "table") {
        const table = document.createElement("table");
        Object.assign(table.style, {
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "20px",
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
        page.appendChild(table);
      }
    }
    return page;
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

  return { buildPageNode, blockSnippet, PAGE_W_PX, PAGE_H_PX, PAGE_W_PT, PAGE_H_PT };
})();
