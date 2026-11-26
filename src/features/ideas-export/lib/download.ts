/**
 * Browser-only file download: a Blob URL clicked through a detached anchor.
 * No save dialog and no dependency; the Tauri webview handles the download.
 */
export function downloadTextFile(fileName: string, text: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // The click consumes the URL synchronously in Chromium/WebView2.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
