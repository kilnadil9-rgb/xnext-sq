/**
 * Browser-only photo preparation for Dog Meetups: decode, downscale (longest
 * edge 1280 px), re-encode as JPEG under the 3 MB bucket limit. Re-encoding via
 * canvas also strips EXIF/GPS metadata.
 *
 * HEIC/HEIF: browsers that can decode it (Safari / iOS WebView) go through the
 * same path via createImageBitmap/<img>; elsewhere we return a friendly error
 * asking for a JPEG/PNG (iPhones usually convert on pick when "Most
 * Compatible" or when picking from the photo library in Safari).
 */
import {
  PHOTO_ACCEPTED_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_EDGE_PX,
  fitWithin,
  isHeicLike,
} from './dogMeetups'

export interface PreparedPhoto {
  blob: Blob
  /** Always image/jpeg after processing. */
  type: 'image/jpeg'
  width: number
  height: number
  /** Object URL for preview; revoke with URL.revokeObjectURL when done. */
  previewUrl: string
}

export class PhotoError extends Error {}

const MAX_INPUT_BYTES = 30 * 1024 * 1024 // refuse absurd inputs before decoding

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

export async function prepareMeetupPhoto(file: File): Promise<PreparedPhoto> {
  const okType = (PHOTO_ACCEPTED_TYPES as readonly string[]).includes(file.type)
  if (!okType && !isHeicLike(file) && !file.type.startsWith('image/')) {
    throw new PhotoError('Please choose a JPEG, PNG or WebP photo.')
  }
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('That photo is too large. Please choose one under 30 MB.')

  let decoded: Awaited<ReturnType<typeof decode>>
  try {
    decoded = await decode(file)
  } catch {
    throw new PhotoError(
      isHeicLike(file)
        ? 'This browser cannot read HEIC photos. Please pick a JPEG or PNG (on iPhone: Settings → Camera → Formats → Most Compatible).'
        : 'We could not read that photo. Please try a different JPEG, PNG or WebP image.',
    )
  }

  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, PHOTO_MAX_EDGE_PX)
    if (!width || !height) throw new PhotoError('That image looks empty. Please choose another photo.')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new PhotoError('Photo processing is not available in this browser.')
    // JPEG has no alpha: paint white first so transparent PNGs do not turn black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(decoded.source, 0, 0, width, height)

    let quality = 0.82
    let blob = await toBlob(canvas, quality)
    while (blob && blob.size > PHOTO_MAX_BYTES && quality > 0.4) {
      quality -= 0.1
      blob = await toBlob(canvas, quality)
    }
    if (!blob || blob.size > PHOTO_MAX_BYTES) {
      throw new PhotoError('That photo is still too large after compression. Please choose a smaller one.')
    }
    return { blob, type: 'image/jpeg', width, height, previewUrl: URL.createObjectURL(blob) }
  } finally {
    decoded.close()
  }
}
