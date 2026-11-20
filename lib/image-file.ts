/**
 * Turning a picked file into something the API will accept.
 *
 * Browser only: this touches canvas and createImageBitmap. It lives here
 * rather than in a component because two uploaders need it, one reading a
 * single team's row from a phone photo and one reading a whole night off the
 * sheet, and they must fail in the same words for the same reasons.
 */

/**
 * Decodes a picked file into something drawable.
 *
 * createImageBitmap is the fast path but throws on HEIC, which is what an
 * iPhone shoots by default. Safari can often still decode those through an
 * <img> element, so that is the fallback rather than an immediate failure.
 */
async function decode(file: File): Promise<{
  draw: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      draw: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("the browser could not decode it"));
        img.src = url;
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    return {
      draw: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  }
}

/**
 * Shrinks the image before it leaves the device. A modern camera shot is
 * 4MB+, which is slow on a course with one bar of signal and costs more to
 * read than it needs to.
 *
 * Capping the LONG edge, not the width: scaling on width alone left a tall
 * image tall, and the API rejects anything over 8000px on either side.
 *
 * @param maxEdge 2000 keeps handwritten digits on one row legible. A grid of
 *   eighteen columns across five bays needs more, so callers reading a whole
 *   sheet pass a larger edge and accept the slower upload.
 */
export async function downscale(file: File, maxEdge = 2000): Promise<string> {
  const { draw, width, height, release } = await decode(file);
  try {
    if (!width || !height) throw new Error("the image had no dimensions");
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("this browser blocked canvas rendering");
    ctx.drawImage(draw, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    release();
  }
}

/** Says what actually went wrong instead of a catch-all. */
export function describeDecodeFailure(file: File, error: unknown): string {
  const name = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /heic|heif/i.test(file.type)) {
    return (
      "That is a HEIC photo, which browsers cannot read. On iPhone either set " +
      "Settings > Camera > Formats > Most Compatible, or take a screenshot of " +
      "the photo and upload the screenshot."
    );
  }
  const detail = error instanceof Error ? error.message : "";
  return `Could not read that image file${detail ? `: ${detail}` : "."}`;
}
