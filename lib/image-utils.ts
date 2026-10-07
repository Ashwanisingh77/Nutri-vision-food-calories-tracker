/**
 * Resize and compress an image file to max 768px on its longest side.
 * Returns a base64-encoded JPEG string (without the data URI prefix).
 */
export async function resizeAndCompressImage(
  file: File | Blob,
  maxDimension = 768,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Get base64 JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      // Strip the "data:image/jpeg;base64," prefix
      const base64 = dataUrl.split(',')[1];

      if (!base64) {
        reject(new Error('Failed to encode image'));
        return;
      }

      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resizing'));
    };

    img.src = url;
  });
}

/**
 * Compute a simple hash of a base64 string for caching purposes.
 * Uses SubtleCrypto SHA-256 when available, falls back to a fast JS hash.
 */
export async function hashImageBase64(base64: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    // Only hash first 10KB for speed — enough for uniqueness
    const data = encoder.encode(base64.substring(0, 10240));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: simple DJB2 hash
  let hash = 5381;
  const sample = base64.substring(0, 10240);
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) + hash + sample.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Convert a URL (blob or remote) to a File object for processing.
 */
export async function urlToFile(url: string): Promise<File> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
}

/**
 * Validate image file constraints.
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'Image is too large. Maximum size is 20MB.' };
  }

  // Be lenient on type checks as HEIC may not always report correctly
  if (file.type && !ALLOWED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return { valid: false, error: 'Unsupported image format. Use JPG, PNG, or WebP.' };
  }

  return { valid: true };
}
