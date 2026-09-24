import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, formatBytes, compressImage, type MenuItem } from '@canteen/shared';
import {
  X,
  Search,
  Check,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  UploadCloud,
  FolderOpen,
  Filter,
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
} from 'lucide-react';

export interface StorageImageItem {
  id: string;
  name: string;
  publicUrl: string;
  size?: number;
  createdAt?: string | null;
  dishName?: string;
  category?: string;
}

export interface StorageImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
  currentImageUrl?: string | null;
  bucketName?: string;
  menu?: MenuItem[];
  initialCategory?: string;
}

type ResizeMode = 'auto_1200' | 'small_800' | 'hd_1600' | 'original';

export const StorageImagePickerModal: React.FC<StorageImagePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectImage,
  currentImageUrl,
  bucketName = 'menu-images',
  menu = [],
  initialCategory,
}) => {
  const [images, setImages] = useState<StorageImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [chosenUrl, setChosenUrl] = useState<string>(currentImageUrl || '');
  const [uploadingMulti, setUploadingMulti] = useState(false);
  const [resizeMode, setResizeMode] = useState<ResizeMode>('auto_1200');
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    currentFileName: string;
    originalTotal: number;
    compressedTotal: number;
  } | null>(null);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync selected URL with currentImageUrl when modal opens
  useEffect(() => {
    if (isOpen) {
      setChosenUrl(currentImageUrl || '');
      if (initialCategory) {
        setSelectedCat(initialCategory);
      }
      setUploadSuccessMsg(null);
      setErrorMsg(null);
      loadStorageImages();
    }
  }, [isOpen, currentImageUrl, initialCategory]);

  const loadStorageImages = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. List files from Supabase Storage bucket
      const { data: storageFiles, error: storageErr } = await supabase.storage
        .from(bucketName)
        .list('', {
          limit: 150,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (storageErr) {
        console.warn('[StorageImagePicker] List error:', storageErr);
      }

      // Map dishes from menu for quick lookup by ID or image URL
      const dishMapByUrl = new Map<string, MenuItem>();
      menu.forEach((m) => {
        if (m.imageUrl) {
          dishMapByUrl.set(m.imageUrl, m);
          const parts = m.imageUrl.split('/');
          const filename = parts[parts.length - 1];
          if (filename) dishMapByUrl.set(filename, m);
        }
      });

      const itemsList: StorageImageItem[] = [];
      const seenUrls = new Set<string>();

      // A. Files retrieved from Storage
      if (Array.isArray(storageFiles) && storageFiles.length > 0) {
        for (const file of storageFiles) {
          if (!file.name || file.name.startsWith('.')) continue;

          const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(file.name);
          const publicUrl = urlData.publicUrl;
          seenUrls.add(publicUrl);

          // Check if file matches any dish in menu
          let matchedDish: MenuItem | undefined = dishMapByUrl.get(publicUrl) || dishMapByUrl.get(file.name);
          if (!matchedDish) {
            const prefix = file.name.split('-')[0];
            if (prefix) {
              matchedDish = menu.find((d) => d.id === prefix || d.id?.startsWith(prefix));
            }
          }

          itemsList.push({
            id: file.id || file.name,
            name: file.name,
            publicUrl,
            size: file.metadata?.size,
            createdAt: file.created_at,
            dishName: matchedDish?.name,
            category: matchedDish?.category || 'Món ăn',
          });
        }
      }

      // B. Also include images from existing menu items
      for (const m of menu) {
        if (m.imageUrl && !seenUrls.has(m.imageUrl)) {
          seenUrls.add(m.imageUrl);
          itemsList.push({
            id: `menu-${m.id}`,
            name: `${m.name}.webp`,
            publicUrl: m.imageUrl,
            dishName: m.name,
            category: m.category || 'Món ăn',
          });
        }
      }

      setImages(itemsList);
    } catch (err: any) {
      console.error('[StorageImagePicker] Exception:', err);
      setErrorMsg(err.message || 'Lỗi khi kết nối Supabase Storage');
    } finally {
      setLoading(false);
    }
  };

  // Extract unique categories from images + menu
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    menu.forEach((m) => {
      if (m.category?.trim()) set.add(m.category.trim());
    });
    images.forEach((img) => {
      if (img.category?.trim()) set.add(img.category.trim());
    });
    return ['all', ...Array.from(set)];
  }, [menu, images]);

  // Filter images by search term and category
  const filteredImages = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return images.filter((img) => {
      const matchSearch =
        !q ||
        img.name.toLowerCase().includes(q) ||
        (img.dishName && img.dishName.toLowerCase().includes(q)) ||
        (img.category && img.category.toLowerCase().includes(q));

      const matchCat =
        selectedCat === 'all' ||
        (img.category && img.category.toLowerCase() === selectedCat.toLowerCase());

      return matchSearch && matchCat;
    });
  }, [images, searchTerm, selectedCat]);

  // Multiple Image Upload with Client-Side Resize before importing to Supabase Storage
  const handleMultipleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingMulti(true);
    setErrorMsg(null);
    setUploadSuccessMsg(null);

    let originalSum = 0;
    let compressedSum = 0;
    const newItems: StorageImageItem[] = [];
    let firstUploadedUrl = '';

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        originalSum += file.size;

        setUploadProgress({
          current: i + 1,
          total: files.length,
          currentFileName: file.name,
          originalTotal: originalSum,
          compressedTotal: compressedSum,
        });

        let fileToUpload: Blob = file;
        let extension = file.name.split('.').pop() || 'jpg';
        let mimeType = file.type || 'image/jpeg';

        // 1. Client-side Resize & Compression if enabled
        if (resizeMode !== 'original') {
          try {
            let maxWidth = 1200;
            let maxHeight = 1200;
            let quality = 0.85;

            if (resizeMode === 'small_800') {
              maxWidth = 800;
              maxHeight = 800;
              quality = 0.80;
            } else if (resizeMode === 'hd_1600') {
              maxWidth = 1600;
              maxHeight = 1600;
              quality = 0.90;
            }

            const compRes = await compressImage(file, {
              maxWidth,
              maxHeight,
              quality,
              mimeType: 'image/webp',
            });

            fileToUpload = compRes.blob;
            compressedSum += compRes.compressedSize;
            extension = 'webp';
            mimeType = 'image/webp';
          } catch (compressErr) {
            console.warn('[StorageImagePicker] Resize fallback for:', file.name, compressErr);
            fileToUpload = file;
            compressedSum += file.size;
          }
        } else {
          compressedSum += file.size;
        }

        // 2. Clean filename for Supabase Storage
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9_-]/g, '_')
          .slice(0, 32);
        const fileName = `${cleanName}-${Date.now()}-${i + 1}.${extension}`;

        // 3. Upload to Supabase Storage
        const { error: upErr } = await supabase.storage.from(bucketName).upload(fileName, fileToUpload, {
          contentType: mimeType,
          upsert: true,
        });

        if (upErr) {
          console.error('[Storage Upload Error]:', upErr);
          throw new Error(`Lỗi tải ảnh "${file.name}": ${upErr.message}`);
        }

        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
        const publicUrl = urlData.publicUrl;

        if (!firstUploadedUrl) {
          firstUploadedUrl = publicUrl;
        }

        newItems.push({
          id: fileName,
          name: fileName,
          publicUrl,
          size: fileToUpload.size,
          createdAt: new Date().toISOString(),
          category: selectedCat !== 'all' ? selectedCat : 'Món ăn',
        });
      }

      setImages((prev) => [...newItems, ...prev]);
      if (firstUploadedUrl) {
        setChosenUrl(firstUploadedUrl);
      }

      const savedPercent =
        originalSum > 0 ? Math.round(((originalSum - compressedSum) / originalSum) * 100) : 0;

      setUploadSuccessMsg(
        `Đã tải lên thành công ${files.length} ảnh vào bucket '${bucketName}'! ${
          resizeMode !== 'original' && savedPercent > 0
            ? `(Resize tối ưu: ${formatBytes(originalSum)} → ${formatBytes(compressedSum)}, tiết kiệm ${savedPercent}% dung lượng)`
            : `(Tổng dung lượng: ${formatBytes(compressedSum)})`
        }`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi tải ảnh lên Storage');
    } finally {
      setUploadingMulti(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmSelect = () => {
    if (chosenUrl) {
      onSelectImage(chosenUrl);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Kho Ảnh Supabase Storage</h3>
              <p className="text-[11px] text-slate-400">
                Thư mục: <code className="text-indigo-300 font-mono">storage/{bucketName}</code> · Chọn nhiều ảnh & Tự động Resize chống chặn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload & Multi-file Toolbar */}
        <div className="p-3 sm:p-4 bg-indigo-50/70 border-b border-indigo-100 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* Multi-upload Trigger Button */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleMultipleUpload}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMulti}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer min-h-[38px]"
                title="Chọn một hoặc nhiều file ảnh từ máy tính để tải lên cùng lúc"
              >
                {uploadingMulti ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <UploadCloud className="w-4 h-4 text-white" />
                )}
                <span>Tải ảnh mới (Chọn nhiều ảnh cùng lúc)</span>
              </button>

              <button
                type="button"
                onClick={loadStorageImages}
                disabled={loading}
                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer min-h-[38px]"
                title="Làm mới danh sách ảnh từ Supabase Storage"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                <span className="hidden sm:inline">Làm mới</span>
              </button>
            </div>

            {/* Resize Mode Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-slate-500 font-semibold shrink-0">Chế độ Resize:</span>
              <select
                value={resizeMode}
                onChange={(e) => setResizeMode(e.target.value as ResizeMode)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
                title="Tùy chọn tự động thu nhỏ kích thước ảnh trước khi tải lên Supabase để tránh lỗi file quá nặng"
              >
                <option value="auto_1200">⚡ Tự động Resize WebP (Max 1200px - Khuyên dùng)</option>
                <option value="small_800">🚀 Nén siêu nhẹ WebP (Max 800px - Tải cực nhanh)</option>
                <option value="hd_1600">🎨 Độ nét cao WebP (Max 1600px)</option>
                <option value="original">📁 Giữ nguyên ảnh gốc (Không nén)</option>
              </select>
            </div>
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress && (
            <div className="p-3 bg-white border border-indigo-200 rounded-xl space-y-1.5 shadow-2xs animate-fadeIn">
              <div className="flex justify-between text-xs font-semibold text-indigo-900">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  Đang xử lý & tải lên {uploadProgress.current} / {uploadProgress.total} ảnh:
                  <span className="font-mono text-indigo-600 truncate max-w-[200px]">
                    {uploadProgress.currentFileName}
                  </span>
                </span>
                <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Success Banner */}
          {uploadSuccessMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{uploadSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setUploadSuccessMsg(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm theo tên món, tên file ảnh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-2xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
              Tìm thấy <strong className="text-slate-900">{filteredImages.length}</strong> ảnh
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
              <Filter className="w-3 h-3" /> Danh mục:
            </span>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCat(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedCat === cat
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {cat === 'all' ? 'Tất cả danh mục' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body: Image Grid */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-slate-100/60">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
              <p className="text-xs font-medium">Đang tải danh sách ảnh từ Supabase Storage...</p>
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-400 mx-auto flex items-center justify-center">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">Không tìm thấy hình ảnh phù hợp</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Thử đổi từ khóa tìm kiếm hoặc bấm nút "Tải ảnh mới" để tải lên ảnh món ăn.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredImages.map((img) => {
                const isSelected = chosenUrl === img.publicUrl;
                return (
                  <div
                    key={img.id}
                    onClick={() => setChosenUrl(img.publicUrl)}
                    className={`group relative bg-white rounded-2xl border-2 overflow-hidden shadow-2xs transition-all cursor-pointer flex flex-col ${
                      isSelected
                        ? 'border-indigo-600 ring-4 ring-indigo-600/15 shadow-md scale-[1.02]'
                        : 'border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                      <img
                        src={img.publicUrl}
                        alt={img.dishName || img.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />

                      {/* Selected Checkmark Badge */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      )}

                      {/* Category Badge */}
                      {img.category && (
                        <span className="absolute bottom-1.5 left-1.5 bg-slate-900/80 backdrop-blur-xs text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md">
                          {img.category}
                        </span>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between">
                      <div className="min-h-[30px]">
                        <p className="text-[11px] font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition">
                          {img.dishName || img.name}
                        </p>
                        {img.dishName && (
                          <p className="text-[10px] text-slate-400 font-mono truncate">{img.name}</p>
                        )}
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{img.size ? formatBytes(img.size) : 'WebP'}</span>
                        <span
                          className={`font-bold transition ${
                            isSelected ? 'text-indigo-600' : 'text-slate-500 group-hover:text-indigo-600'
                          }`}
                        >
                          {isSelected ? 'Đang chọn' : 'Chọn ảnh'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {chosenUrl ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <Check className="w-4 h-4" /> Đã chọn 1 hình ảnh từ Storage
              </span>
            ) : (
              <span className="text-slate-400">Chưa chọn ảnh nào</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded-xl hover:bg-slate-100 cursor-pointer min-h-[40px] transition"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmSelect}
              disabled={!chosenUrl}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer min-h-[40px] transition"
            >
              <Check className="w-4 h-4" />
              <span>Xác nhận chọn ảnh này</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
