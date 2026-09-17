// Jembatan download buat shell Android (RfidShellApp). WebView bawaan gak
// nangkep download lewat blob: URL sama sekali, jadi kalau app ini dibuka di
// dalam shell (window.AndroidFileSaver ada), file dikirim sebagai base64 ke
// native lewat jembatan itu alih-alih lewat <a download>/writeFile browser.

export function isNativeShell(): boolean {
  return typeof (window as any).AndroidFileSaver?.saveBase64 === 'function';
}

export function saveViaNativeShell(base64Data: string, fileName: string, mimeType: string) {
  (window as any).AndroidFileSaver.saveBase64(base64Data, fileName, mimeType);
}
