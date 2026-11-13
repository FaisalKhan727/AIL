// Browser-only: turn a picked file into a data URL small enough to store.
// Photos are downscaled to a readable-but-compact JPEG; PDFs pass through.

const MAX_EDGE = 1600;
const MAX_BYTES = 2_000_000;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image could not be opened"));
    img.src = src;
  });
}

export async function fileToDataUrl(file: File): Promise<{ name: string; dataUrl: string }> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_BYTES) throw new Error("PDF is larger than 2 MB");
    return { name: file.name, dataUrl: await readAsDataUrl(file) };
  }
  if (!file.type.startsWith("image/")) throw new Error("Use a photo (JPG/PNG) or a PDF");

  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process images");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", dataUrl };
}
