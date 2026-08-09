"""小書轉換器 — 桌面圖形化應用程式
上傳（選擇）一份 .docx，自動轉成可對摺裝訂的小書格式 PDF。
"""
import os
import subprocess
import sys
import tempfile
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter import ttk

import imposition

APP_TITLE = "小書轉換器"


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("560x360")
        self.resizable(False, False)

        self.docx_path = tk.StringVar()
        self.out_dir = tk.StringVar()
        self.status = tk.StringVar(value="請選擇要轉換的 .docx 檔案")

        pad = {"padx": 16, "pady": 8}

        tk.Label(self, text=APP_TITLE, font=("Microsoft JhengHei", 16, "bold")).pack(pady=(20, 4))
        tk.Label(
            self,
            text="選擇小書內容的 .docx 檔案，自動輸出可對摺裝訂的小書格式 PDF",
            font=("Microsoft JhengHei", 10),
        ).pack(pady=(0, 12))

        frame1 = tk.Frame(self)
        frame1.pack(fill="x", **pad)
        tk.Button(frame1, text="選擇 .docx 檔案...", command=self.choose_docx, width=18).pack(side="left")
        tk.Label(frame1, textvariable=self.docx_path, anchor="w", fg="#333").pack(
            side="left", padx=8, fill="x", expand=True
        )

        frame2 = tk.Frame(self)
        frame2.pack(fill="x", **pad)
        tk.Button(frame2, text="選擇輸出資料夾...", command=self.choose_out_dir, width=18).pack(side="left")
        tk.Label(frame2, textvariable=self.out_dir, anchor="w", fg="#333").pack(
            side="left", padx=8, fill="x", expand=True
        )

        self.convert_btn = tk.Button(
            self, text="開始轉換", command=self.start_convert, width=20, height=2,
            bg="#4a7", fg="white", font=("Microsoft JhengHei", 11, "bold"),
        )
        self.convert_btn.pack(pady=16)

        self.progress = ttk.Progressbar(self, mode="indeterminate", length=480)
        self.progress.pack(pady=(0, 8))

        tk.Label(self, textvariable=self.status, fg="#555", wraplength=520, justify="left").pack(padx=16)

        self.output_pdf_path = None
        self.open_folder_btn = tk.Button(
            self, text="開啟輸出資料夾", command=self.open_output_folder, state="disabled"
        )
        self.open_folder_btn.pack(pady=8)

    def choose_docx(self):
        path = filedialog.askopenfilename(
            title="選擇小書 .docx 檔案", filetypes=[("Word 文件", "*.docx")]
        )
        if path:
            self.docx_path.set(path)
            if not self.out_dir.get():
                self.out_dir.set(os.path.dirname(path))
            self.status.set("已選擇檔案，可以按「開始轉換」")

    def choose_out_dir(self):
        path = filedialog.askdirectory(title="選擇輸出資料夾")
        if path:
            self.out_dir.set(path)

    def start_convert(self):
        docx = self.docx_path.get()
        out_dir = self.out_dir.get()
        if not docx or not os.path.isfile(docx):
            messagebox.showerror(APP_TITLE, "請先選擇有效的 .docx 檔案")
            return
        if not out_dir or not os.path.isdir(out_dir):
            messagebox.showerror(APP_TITLE, "請先選擇輸出資料夾")
            return

        self.convert_btn.config(state="disabled")
        self.open_folder_btn.config(state="disabled")
        self.progress.start(12)
        self.status.set("轉換中，請稍候...（第一次執行 LibreOffice 可能需要較久）")

        thread = threading.Thread(target=self._convert_worker, args=(docx, out_dir), daemon=True)
        thread.start()

    def _convert_worker(self, docx, out_dir):
        try:
            base = os.path.splitext(os.path.basename(docx))[0]
            out_pdf = os.path.join(out_dir, f"{base}(小書格式).pdf")
            with tempfile.TemporaryDirectory() as tmp:
                imposition.build_booklet(docx, out_pdf, tmp)
            self.output_pdf_path = out_pdf
            self.after(0, self._on_success, out_pdf)
        except Exception as e:
            self.after(0, self._on_error, str(e))

    def _on_success(self, out_pdf):
        self.progress.stop()
        self.status.set(f"完成！已輸出：\n{out_pdf}")
        self.convert_btn.config(state="normal")
        self.open_folder_btn.config(state="normal")
        messagebox.showinfo(APP_TITLE, f"轉換完成！\n\n{out_pdf}")

    def _on_error(self, msg):
        self.progress.stop()
        self.status.set("轉換失敗，請確認檔案是否正常，或參考下方錯誤訊息重試。")
        self.convert_btn.config(state="normal")
        messagebox.showerror(APP_TITLE, f"轉換失敗：\n\n{msg}")

    def open_output_folder(self):
        if not self.output_pdf_path:
            return
        folder = os.path.dirname(self.output_pdf_path)
        if sys.platform.startswith("win"):
            os.startfile(folder)  # noqa: for Windows only
        elif sys.platform == "darwin":
            subprocess.run(["open", folder])
        else:
            subprocess.run(["xdg-open", folder])


if __name__ == "__main__":
    App().mainloop()
