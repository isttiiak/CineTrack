/** Saves text as a file (works in Chrome, Safari, Firefox and installed PWAs). */
export function downloadText(text: string, fileName: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);   // Firefox ignores clicks on detached anchors
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);   // revoking synchronously can cancel the download
}
