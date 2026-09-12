export const MAX_MINDMAP_RASTER_DATA_URL_LENGTH = 1_000_000

/** Shared DOM-free policy for interactive rendering and exported SVG. */
export function sanitizeMindMapUrl(value: string, image = false): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (/^data:/i.test(url) && url.length > MAX_MINDMAP_RASTER_DATA_URL_LENGTH) return null
  if (!url || Array.from(url).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || url.includes('\\')) return null
  if (image && /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(url)) return url
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase()
  if (scheme) {
    if (image ? scheme !== 'https' && scheme !== 'http' : !['https', 'http', 'mailto', 'tel'].includes(scheme)) return null
    if (scheme === 'http' || scheme === 'https') {
      try { if (!new URL(url).hostname) return null } catch { return null }
    }
    return url
  }
  if (url.startsWith('//')) return null
  // Relative and fragment URLs are only navigation links; exported images must
  // carry their own absolute source to avoid depending on an embedding page.
  return image ? null : url
}

/** Remote images are denied unless the host explicitly authorizes them.
 * A predicate receives a sanitized absolute HTTP(S) URL; exceptions deny it. */
export type MindMapRemoteImagePolicy = 'deny' | 'allow' | ((url: string) => boolean)

export function authorizeMindMapImageUrl(value: string, policy: MindMapRemoteImagePolicy = 'deny'): string | null {
  const url = sanitizeMindMapUrl(value, true)
  if (!url) return null
  if (/^data:/i.test(url)) return url
  if (policy === 'allow') return url
  if (typeof policy === 'function') {
    try { return policy(url) === true ? url : null } catch { return null }
  }
  return null
}
