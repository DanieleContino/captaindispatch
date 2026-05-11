'use client'

/**
 * Resize an image File to fit within maxW × maxH while preserving aspect ratio.
 * Returns a new Blob (PNG/JPEG/WebP). SVG files pass through unchanged.
 *
 * @param {File} file
 * @param {{ maxWidth?: number, maxHeight?: number, mimeType?: string, quality?: number }} opts
 * @returns {Promise<Blob>}
 */
export async function resizeImage(file, opts = {}) {
  const {
    maxWidth = 600,
    maxHeight = 600,
    mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    quality = 0.92,
  } = opts

  // SVG passes through (already vector)
  if (file.type === 'image/svg+xml') {
    return file
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        const scale = Math.min(maxWidth / width, maxHeight / height, 1)
        const newW = Math.round(width * scale)
        const newH = Math.round(height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = newW
        canvas.height = newH
        const ctx = canvas.getContext('2d')

        // Keep transparency for PNG, white background for JPEG
        if (mimeType === 'image/jpeg') {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, newW, newH)
        }

        ctx.drawImage(img, 0, 0, newW, newH)

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Canvas toBlob returned null'))
          },
          mimeType,
          quality
        )
      }
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * Extract file extension from a File or MIME type.
 * Returns: 'png' | 'jpg' | 'webp' | 'svg'
 */
export function fileExtension(file) {
  switch (file.type) {
    case 'image/png':     return 'png'
    case 'image/jpeg':    return 'jpg'
    case 'image/webp':    return 'webp'
    case 'image/svg+xml': return 'svg'
    default:              return 'png'
  }
}
