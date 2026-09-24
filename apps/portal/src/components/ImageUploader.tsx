import React, { useState, useRef, useEffect } from 'react';
import {
  supabase,
  compressImage,
  extractStoragePath,
  formatBytes,
  type CompressResult,
} from '@canteen/shared';
import {
  UploadCloud,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  X,
  FolderOpen,
} from 'lucide-react';
import { StorageImagePickerModal } from './StorageImagePickerModal';
import type { MenuItem } from '@canteen/shared';

export interface ImageUploaderProps {
  /**
   * Optional dish / item ID (used for unique file naming and direct Supabase table sync)
   */
  itemId?: string;
  /**
   * Current image URL to preview (Supabase public URL, external image URL, etc.)
   */
  currentImageUrl?: string | null;
  /**
   * Callback fired when image is successfully uploaded and optimized.
   * Returns the Supabase Storage public URL.
   */
  onUploaded: (newUrl: string) => void;
  /**
   * Callback fired when current image is removed.
   */
  onRemoved?: () => void;
  /**
   * Optional custom container CSS classes
   */
  className?: string;
  /**
   * Disable upload & interactions
   */
  disabled?: boolean;
  /**
   * Supabase Storage bucket name (default: 'menu-images')
   */
  bucketName?: string;
  /**
   * Optional category for filtering library images
   */
  category?: string;
  /**
   * Optional menu items for library cross-referencing
   */
  menu?: MenuItem[];
}

type UploadStep = 'idle' | 'compressing' | 'uploading' | 'deleting' | 'success' | 'error';

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  itemId,
  currentImageUrl,
  onUploaded,
  onRemoved,
  className = '',
  disabled = false,
  bucketName = 'menu-images',
  category,
  menu = [],
}) => {
  const [step, setStep] = useState<UploadStep>('idle');
  const [previewUrl, setPreviewUrl] = useState<string>(currentImageUrl || '');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number;
    compressedSize: number;
    dimensions: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep preview in sync if currentImageUrl prop changes from outside
  useEffect(() => {
    if (step === 'idle' || step === 'success') {
      setPreviewUrl(currentImageUrl || '');
    }
  }, [currentImageUrl, step]);

  const handleTriggerSelect = () => {
    if (disabled || step === 'compressing' || step === 'uploading' || step === 'deleting') return;
    fileInputRef.current?.click();
  };

  const processAndUploadFile = async (file: File) => {
    setErrorMessage(null);
    setCompressionInfo(null);

    // 1. Validation
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Chỉ chấp nhận file hình ảnh hợp lệ (.jpg, .png, .webp, .jpeg).');
      return;
    }

    const MAX_RAW_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_RAW_SIZE) {
      setErrorMessage(`Kích thước file ảnh gốc quá lớn (${formatBytes(file.size)}). Vui lòng chọn ảnh dưới 10MB.`);
      return;
    }

    try {
      // 2. Client-side Image Compression via Canvas (Phase 1)
      setStep('compressing');
      setStatusMessage('Đang tối ưu & nén ảnh sang WebP (max 600px)...');

      const compressionResult: CompressResult = await compressImage(file, {
        maxWidth: 600,
        maxHeight: 600,
        quality: 0.8,
        mimeType: 'image/webp',
      });

      setCompressionInfo({
        originalSize: compressionResult.originalSize,
        compressedSize: compressionResult.compressedSize,
        dimensions: `${compressionResult.width}×${compressionResult.height}px`,
      });

      // 3. Upload to Supabase Storage (Phase 2)
      setStep('uploading');
      setStatusMessage('Đang tải lên Supabase Storage (bucket: menu-images)...');

      const safeId = itemId ? String(itemId).replace(/[^a-zA-Z0-9_-]/g, '') : 'dish';
      const fileExt = compressionResult.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
      const fileName = `${safeId}-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, compressionResult.blob, {
          contentType: compressionResult.mimeType || 'image/webp',
          cacheControl: '31536000',
          upsert: true,
        });

      if (uploadError) {
        console.error('[ImageUploader] Supabase Storage upload error:', uploadError);
        throw new Error(`Lỗi tải lên Storage: ${uploadError.message || 'Không có quyền ghi hoặc lỗi mạng'}`);
      }

      // 4. Retrieve Public URL
      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(uploadData?.path || fileName);

      const publicUrl = publicUrlData.publicUrl;

      if (!publicUrl) {
        throw new Error('Không thể lấy public URL từ Supabase Storage.');
      }

      // 5. Update menu_items table if itemId is a persisted DB record
      if (itemId && itemId !== 'temp' && !itemId.startsWith('temp_')) {
        try {
          const { error: dbError } = await supabase
            .from('menu_items')
            .update({
              image_url: publicUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', itemId);

          if (dbError) {
            console.error('[ImageUploader] DB menu_items update warning:', dbError);
            // Non-fatal warning: notify user that image uploaded but table update failed
            setErrorMessage(`Ảnh đã lên Storage nhưng lưu vào thực đơn gặp lỗi: ${dbError.message}`);
          }
        } catch (dbErr: any) {
          console.error('[ImageUploader] DB sync error:', dbErr);
        }
      }

      // 6. Delete old image from Storage to prevent orphaned files
      const oldStoragePath = extractStoragePath(currentImageUrl, bucketName);
      if (oldStoragePath && oldStoragePath !== fileName && oldStoragePath !== uploadData?.path) {
        try {
          await supabase.storage.from(bucketName).remove([oldStoragePath]);
        } catch (delErr) {
          console.warn('[ImageUploader] Clean old storage file note:', delErr);
        }
      }

      // 7. Complete & notify parent
      setPreviewUrl(publicUrl);
      setStep('success');
      setStatusMessage('Tải ảnh và tối ưu thành công!');
      onUploaded(publicUrl);

      // Auto clear success message after 4s
      setTimeout(() => {
        setStep('idle');
        setStatusMessage('');
      }, 4000);
    } catch (err: any) {
      console.error('[ImageUploader] Upload failed:', err);
      setStep('error');
      setErrorMessage(err.message || 'Đã xảy ra lỗi trong quá trình xử lý ảnh.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndUploadFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && step !== 'compressing' && step !== 'uploading') {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || step === 'compressing' || step === 'uploading') return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processAndUploadFile(file);
    }
  };

  const handleRemoveImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || step === 'compressing' || step === 'uploading' || step === 'deleting') return;

    setErrorMessage(null);
    setStep('deleting');
    setStatusMessage('Đang gỡ ảnh...');

    try {
      // 1. Delete from Storage if existing
      const oldStoragePath = extractStoragePath(previewUrl || currentImageUrl, bucketName);
      if (oldStoragePath) {
        await supabase.storage.from(bucketName).remove([oldStoragePath]);
      }

      // 2. Update DB if itemId exists
      if (itemId && itemId !== 'temp' && !itemId.startsWith('temp_')) {
        const { error: dbError } = await supabase
          .from('menu_items')
          .update({
            image_url: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', itemId);

        if (dbError) {
          console.error('[ImageUploader] DB remove image error:', dbError);
        }
      }

      setPreviewUrl('');
      setCompressionInfo(null);
      setStep('idle');
      setStatusMessage('');
      onUploaded('');
      onRemoved?.();
    } catch (err: any) {
      console.error('[ImageUploader] Delete failed:', err);
      setStep('error');
      setErrorMessage(err.message || 'Lỗi khi gỡ ảnh.');
    }
  };

  const isBusy = step === 'compressing' || step === 'uploading' || step === 'deleting';

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg"
        onChange={handleFileChange}
        disabled={disabled || isBusy}
        className="hidden"
      />

      {/* Main Upload / Preview Card */}
      <div
        onClick={handleTriggerSelect}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative group rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden cursor-pointer ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50/60 shadow-md ring-4 ring-indigo-500/10'
            : errorMessage
            ? 'border-rose-300 bg-rose-50/30'
            : previewUrl
            ? 'border-slate-200 bg-slate-900/5 hover:border-indigo-400'
            : 'border-slate-300 bg-slate-50 hover:bg-slate-100/80 hover:border-indigo-400'
        } ${isBusy ? 'pointer-events-none opacity-85' : ''}`}
      >
        {/* Preview State */}
        {previewUrl ? (
          <div className="relative aspect-video sm:aspect-[16/9] w-full max-h-56 bg-slate-950 flex items-center justify-center overflow-hidden">
            <img
              src={previewUrl}
              alt="Món ăn"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            {/* Hover overlay with action buttons */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3.5">
              <span className="text-white text-xs font-semibold flex items-center gap-1.5 drop-shadow-sm">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Nhấn để đổi ảnh khác</span>
              </span>

              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isBusy}
                className="px-2.5 py-1.5 bg-rose-600/90 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md backdrop-blur-xs flex items-center gap-1 transition cursor-pointer"
                title="Gỡ ảnh này"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa ảnh</span>
              </button>
            </div>
          </div>
        ) : (
          /* Empty / Placeholder State */
          <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-100 transition duration-200 shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-800">
                Kéo thả hoặc <span className="text-indigo-600 underline">chọn ảnh món ăn</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                WebP/PNG/JPG · Tự động resize max 600px & nén WebP (0.8)
              </p>
            </div>
          </div>
        )}

        {/* Loading Overlay (During Compression & Upload) */}
        {isBusy && (
          <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-white text-center z-10 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-indigo-600/40 border border-indigo-400 flex items-center justify-center mb-2.5">
              <Loader2 className="w-5 h-5 text-indigo-300 animate-spin" />
            </div>
            <p className="text-xs font-bold tracking-wide">{statusMessage}</p>
            <p className="text-[11px] text-indigo-200/80 mt-1">
              {step === 'compressing'
                ? 'Giai đoạn 1/2: Nén Canvas API'
                : step === 'uploading'
                ? 'Giai đoạn 2/2: Đẩy lên Supabase Storage'
                : 'Đang xử lý...'}
            </p>
          </div>
        )}
      </div>

      {/* Storage Library & Management Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setIsGalleryOpen(true)}
          disabled={disabled || isBusy}
          className="flex-1 min-w-[200px] py-2 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 min-h-[38px] shadow-2xs"
        >
          <FolderOpen className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <span>Kho ảnh Supabase (Storage menu-images)</span>
        </button>

        {previewUrl && (
          <button
            type="button"
            onClick={handleRemoveImage}
            disabled={disabled || isBusy}
            className="py-2 px-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 min-h-[38px]"
            title="Gỡ bỏ hình ảnh hiện tại"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa ảnh</span>
          </button>
        )}
      </div>

      {/* Storage Image Picker Modal */}
      <StorageImagePickerModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onSelectImage={(newUrl) => {
          setPreviewUrl(newUrl);
          setStep('idle');
          setStatusMessage('');
          setErrorMessage(null);
          onUploaded(newUrl);
        }}
        currentImageUrl={previewUrl}
        bucketName={bucketName}
        menu={menu}
        initialCategory={category}
      />

      {/* Compression statistics badge */}
      {compressionInfo && step !== 'error' && (
        <div className="flex items-center justify-between text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl">
          <div className="flex items-center gap-1.5 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span>
              Đã tối ưu: {formatBytes(compressionInfo.originalSize)} →{' '}
              <strong className="text-emerald-950 font-bold">
                {formatBytes(compressionInfo.compressedSize)}
              </strong>{' '}
              ({compressionInfo.dimensions})
            </span>
          </div>
          <span className="text-[10px] font-bold bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded-md">
            -
            {Math.max(
              0,
              Math.round(
                ((compressionInfo.originalSize - compressionInfo.compressedSize) /
                  compressionInfo.originalSize) *
                  100
              )
            )}
            %
          </span>
        </div>
      )}

      {/* Inline Success Notice */}
      {step === 'success' && statusMessage && (
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Inline Error Notice */}
      {errorMessage && (
        <div className="flex items-start justify-between gap-2 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              setErrorMessage(null);
            }}
            className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
