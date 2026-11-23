/** Recherche d'image produit — Open Food Facts (sans clé, sans compte Google).
 *
 *  Google Custom Search JSON API est fermé aux nouveaux projets, on utilise
 *  Open Food Facts : API ouverte, images sous licence ouverte, pas de clé.
 *
 *  Fallback : capture photo / import de fichier par le commerçant, puis
 *  redimensionnement (300 px max) et stockage en data URL locale.
 */

export interface ImageSearchResult {
  url: string;
  title?: string;
}

// En dev, Vite proxifie /off-search -> search.openfoodfacts.org (contourne le CORS).
// En prod, on tente l'URL directe (peut être bloquée par CORS sans proxy).
const OFF_SEARCH = import.meta.env.DEV ? "/off-search/search" : "https://search.openfoodfacts.org/search";

/** Recherche par nom de produit sur Open Food Facts. */
export async function searchProductImage(query: string): Promise<ImageSearchResult | null> {
  const q = query.trim();
  if (!q) return null;
  const params = new URLSearchParams({
    q,
    page_size: "5",
  });
  try {
    const res = await fetch(`${OFF_SEARCH}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const hits = (data?.hits ?? []) as { image_url?: string; image_small_url?: string; product_name?: string }[];
    for (const p of hits) {
      const url = p.image_url || p.image_small_url;
      if (url) return { url, title: p.product_name || q };
    }
    return null;
  } catch {
    return null;
  }
}

/** Recherche par code-barres (EAN/UPC) sur Open Food Facts. */
export async function searchProductByBarcode(code: string): Promise<ImageSearchResult | null> {
  const c = code.trim();
  if (!c) return null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(c)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.product;
    const url = p?.image_url || p?.image_small_url;
    if (!url) return null;
    return { url, title: p?.product_name };
  } catch {
    return null;
  }
}

/** Ancienne API Google — conservée pour compatibilité mais non utilisée. */
export function getGoogleKeys() {
  return { apiKey: "", cseId: "" };
}
export function setGoogleKeys(_apiKey: string, _cseId: string) {
  /* no-op */
}

/** Redimensionne une image (File/Blob) à 300 px max et renvoie une data URL JPEG. */
export function resizeImageFile(file: File | Blob, maxSize = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("no canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("image load error"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("file read error"));
    reader.readAsDataURL(file);
  });
}