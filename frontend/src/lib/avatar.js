/**
 * Profile photos.
 *
 * Images are resized and re-encoded in the browser before upload, so what
 * reaches the server is a small square JPEG rather than a 4 MB phone
 * photograph. That keeps the free-tier backend viable and makes doctor lists
 * load quickly.
 *
 * Avatars are stored in the database, not on IPFS. An avatar has to be
 * readable by other users, so it cannot be encrypted the way a record is, and
 * IPFS content is effectively permanent - which would make "remove photo" a
 * lie. Here, removing it removes it.
 */

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const OUTPUT_SIZE = 256;
export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Initials for the fallback avatar. "Afziya Garag" -> "AG". */
export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable colour per person, so the fallback avatar is not all one grey. */
export function tintFor(seed = "") {
  const tints = [
    "bg-brand-100 text-brand-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-violet-100 text-violet-700",
    "bg-rose-100 text-rose-700",
    "bg-sky-100 text-sky-700",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return tints[h % tints.length];
}

/**
 * Read a File, centre-crop it to a square and scale it to OUTPUT_SIZE.
 *
 * @returns {Promise<{data: string, type: string, preview: string}>}
 *          base64 without the data-URI prefix, plus a preview URL.
 */
export async function prepareAvatar(file) {
  if (!file) throw new Error("No image chosen");
  if (!ACCEPTED.includes(file.type)) throw new Error("Use a JPEG, PNG or WebP image");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That image is too large");

  const bitmap = await loadBitmap(file);

  // Centre crop to a square first, so faces are not stretched.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  bitmap.close?.();

  // JPEG, because a photograph in PNG is several times larger for no gain.
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return {
    data: dataUrl.split(",")[1],
    type: "image/jpeg",
    preview: dataUrl,
  };
}

/** createImageBitmap where available, an <img> everywhere else. */
async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file is not a readable image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Fetching
//
// The endpoint needs an Authorization header, so an <img src> cannot be
// pointed straight at it. Images are fetched with the API client and turned
// into object URLs, cached per wallet so a list of doctors does not refetch
// the same face repeatedly.
// ---------------------------------------------------------------------------
const cache = new Map(); // wallet -> objectURL | null (null = known to have none)

export async function avatarUrl(wallet) {
  if (!wallet) return null;
  const key = wallet.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  try {
    // Imported lazily so the pure helpers above can be exercised outside a
    // browser; api.js reads Vite build-time env at module scope.
    const { api } = await import("./api");
    const { buffer, headers } = await api.avatarBytes(key);
    const type = headers.get("Content-Type") || "image/jpeg";
    const url = URL.createObjectURL(new Blob([buffer], { type }));
    cache.set(key, url);
    return url;
  } catch {
    // 404 is the normal case for someone who has not set a photo.
    cache.set(key, null);
    return null;
  }
}

/** Forget a cached face, after upload or removal. */
export function forgetAvatar(wallet) {
  if (!wallet) return;
  const key = wallet.toLowerCase();
  const url = cache.get(key);
  if (url) URL.revokeObjectURL(url);
  cache.delete(key);
}
