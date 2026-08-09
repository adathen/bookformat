"""Core logic: docx -> flat PDF -> booklet-imposed PDF.

Imposition scheme (verified against a hand-made reference booklet):
  - N source pages, padded with blank pages to a multiple of 4 -> N_pad.
  - Output = N_pad / 2 landscape sheets, each holding two source pages
    side by side, in signature order for saddle-stitch / center-fold
    booklet assembly (duplex printing, long-edge flip, then fold/cut
    down the vertical center).
  - For sheet k (0-indexed), 0 <= k < N_pad/4:
      front of sheet k: [ page (N_pad-2k) | page (2k+1) ]
      back  of sheet k: [ page (2k+2)     | page (N_pad-2k-1) ]
    (page numbers are 1-indexed positions in the padded source doc)
"""
import os
import shutil
import subprocess
import sys
import tempfile
from typing import Optional

import fitz  # PyMuPDF


def find_soffice():
    """Locate a soffice/soffice.exe binary: bundled portable copy first
    (searched recursively, since portable-app folder layouts vary by
    version), then anything on PATH. Raises FileNotFoundError if none found."""
    here = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else sys.argv[0]))
    portable_root = os.path.join(here, "LibreOfficePortable")
    if os.path.isdir(portable_root):
        for dirpath, _dirnames, filenames in os.walk(portable_root):
            for name in ("soffice.exe", "soffice"):
                if name in filenames:
                    return os.path.join(dirpath, name)

    for name in ("soffice.exe", "soffice"):
        found = shutil.which(name)
        if found:
            return found

    raise FileNotFoundError(
        "找不到 LibreOffice（soffice）。請確認 LibreOfficePortable 資料夾與程式在同一層，"
        "或系統已安裝 LibreOffice。"
    )


def convert_docx_to_pdf(docx_path: str, out_dir: str, soffice_bin: Optional[str] = None) -> str:
    """Convert a .docx to a flat, sequential-order PDF using LibreOffice headless.
    Returns the path to the produced PDF."""
    if soffice_bin is None:
        soffice_bin = find_soffice()

    with tempfile.TemporaryDirectory() as profile_dir:
        cmd = [
            soffice_bin,
            "--headless",
            "--norestore",
            f"-env:UserInstallation=file://{profile_dir.replace(os.sep, '/')}",
            "--convert-to", "pdf",
            "--outdir", out_dir,
            docx_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            raise RuntimeError(f"LibreOffice 轉換失敗：\n{proc.stdout}\n{proc.stderr}")

    base = os.path.splitext(os.path.basename(docx_path))[0]
    produced = os.path.join(out_dir, base + ".pdf")
    if not os.path.isfile(produced):
        raise RuntimeError(f"轉換後找不到 PDF 檔：{produced}")
    return produced


def impose_booklet(src_pdf_path: str, out_pdf_path: str, margin: float = 12.0) -> None:
    """Re-impose a flat, sequential-order PDF into a landscape, 2-up
    booklet-signature PDF ready for duplex printing + center fold."""
    src = fitz.open(src_pdf_path)
    n = src.page_count
    if n == 0:
        raise ValueError("來源 PDF 沒有任何頁面。")

    # per-page trim size, based on the real (unpadded) pages.
    page_w = max(p.rect.width for p in src)
    page_h = max(p.rect.height for p in src)

    pad = (-n) % 4
    n_pad = n + pad

    sheet_w = page_w * 2
    sheet_h = page_h

    out = fitz.open()

    def place(sheet, slot_index, src_page_number_1indexed):
        """Place source page (1-indexed) into slot 0 (left) or 1 (right).
        Page numbers beyond the real page count are blank padding and
        are simply left empty."""
        if src_page_number_1indexed > n:
            return
        src_page = src[src_page_number_1indexed - 1]
        target = fitz.Rect(slot_index * page_w, 0, slot_index * page_w + page_w, page_h)
        avail = target + (margin, margin, -margin, -margin)
        sp = src_page.rect
        scale = min(avail.width / sp.width, avail.height / sp.height)
        fit_w, fit_h = sp.width * scale, sp.height * scale
        cx, cy = (avail.x0 + avail.x1) / 2, (avail.y0 + avail.y1) / 2
        dest = fitz.Rect(cx - fit_w / 2, cy - fit_h / 2, cx + fit_w / 2, cy + fit_h / 2)
        sheet.show_pdf_page(dest, src, src_page_number_1indexed - 1)

    sheets = n_pad // 4
    for k in range(sheets):
        front = out.new_page(width=sheet_w, height=sheet_h)
        place(front, 0, n_pad - 2 * k)
        place(front, 1, 2 * k + 1)

        back = out.new_page(width=sheet_w, height=sheet_h)
        place(back, 0, 2 * k + 2)
        place(back, 1, n_pad - 2 * k - 1)

    out.save(out_pdf_path)
    out.close()
    src.close()


def build_booklet(docx_path: str, out_pdf_path: str, work_dir: str, soffice_bin: Optional[str] = None) -> str:
    """End-to-end: docx -> flat pdf (in work_dir) -> imposed booklet pdf."""
    flat_pdf = convert_docx_to_pdf(docx_path, work_dir, soffice_bin)
    impose_booklet(flat_pdf, out_pdf_path)
    return out_pdf_path


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="docx -> 小書格式 PDF")
    ap.add_argument("docx", help="來源 .docx 檔案")
    ap.add_argument("-o", "--output", help="輸出 PDF 路徑（預設：同資料夾，檔名加上『(小書格式)』）")
    args = ap.parse_args()

    docx_path = os.path.abspath(args.docx)
    out_dir = os.path.dirname(docx_path)
    out_pdf = args.output or os.path.join(
        out_dir, os.path.splitext(os.path.basename(docx_path))[0] + "(小書格式).pdf"
    )
    with tempfile.TemporaryDirectory() as tmp:
        build_booklet(docx_path, out_pdf, tmp)
    print("完成：", out_pdf)
