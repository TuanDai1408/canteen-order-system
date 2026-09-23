/**
 * Image compression utility using native HTML5 Canvas API (0 external dependencies)
 * - Resizes image down to max width (default: 600px) preserving aspect ratio without scaling up
 * - Converts image to WebP with 0.8 quality for lightweight storage
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
}

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
}

/**
 * Compresses an image file using browser Canvas API
 * @param file Source image file
 * @param options Compression options (maxWidth: 600, quality: 0.8, mimeType: 'image/webp')
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<CompressResult> {
  const {
    maxWidth = 600,
    maxHeight = 600,
    quality = 0.8,
    mimeType = 'image/webp',
  } = options;

  if (!file.type.startsWith('image/')) {
    throw new Error('Định dạng file không hợp lệ. Vui lòng chọn file hình ảnh (image/*).');
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let originWidth = img.naturalWidth || img.width;
      let originHeight = img.naturalHeight || img.height;

      if (!originWidth || !originHeight) {
        return reject(new Error('Không thể đọc kích thước hình ảnh.'));
      }

      // Calculate target dimensions
      let targetWidth = originWidth;
      let targetHeight = originHeight;

      // Only downscale, never upscale
      if (originWidth > maxWidth || originHeight > maxHeight) {
        const ratio = Math.min(maxWidth / originWidth, maxHeight / originHeight);
        targetWidth = Math.round(originWidth * ratio);
        targetHeight = Math.round(originHeight * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Không thể khởi tạo Canvas 2D context.'));
      }

      // Smooth resizing quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Clear & Draw
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Attempt WebP conversion
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({
              blob,
              width: targetWidth,
              height: targetHeight,
              originalSize: file.size,
              compressedSize: blob.size,
              mimeType: blob.type || mimeType,
            });
          } else {
            // Fallback to JPEG if WebP blob creation is not supported
            canvas.toBlob(
              (jpegBlob) => {
                if (jpegBlob) {
                  resolve({
                    blob: jpegBlob,
                    width: targetWidth,
                    height: targetHeight,
                    originalSize: file.size,
                    compressedSize: jpegBlob.size,
                    mimeType: 'image/jpeg',
                  });
                } else {
                  reject(new Error('Lỗi khi nén và xuất file hình ảnh.'));
                }
              },
              'image/jpeg',
              quality
            );
          }
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể tải hoặc giải mã file hình ảnh.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Extracts storage file path/name from a Supabase Public URL
 */
export function extractStoragePath(url: string | null | undefined, bucket = 'menu-images'): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const bucketMarker = `/${bucket}/`;
    const idx = url.indexOf(bucketMarker);
    if (idx !== -1) {
      const pathWithQuery = url.substring(idx + bucketMarker.length);
      const cleanPath = pathWithQuery.split('?')[0].split('#')[0];
      return decodeURIComponent(cleanPath);
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Format bytes to human readable format (KB, MB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
