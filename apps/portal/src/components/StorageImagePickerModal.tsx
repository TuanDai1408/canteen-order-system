import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, formatBytes, type MenuItem } from '@canteen/shared';
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
  const [uploadingQuick, setUploadingQuick] = useState(false);
  const quickUploadRef = useRef<HTMLInputElement | null>(null);

  // Sync selected URL with currentImageUrl when modal opens
  useEffect(() => {
    if (isOpen) {
      setChosenUrl(currentImageUrl || '');
      if (initialCategory) {
        setSelectedCat(initialCategory);
      }
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
      const dishMapByName = new Map<string, MenuItem>();
      menu.forEach((m) => {
        if (m.imageUrl) {
          dishMapByUrl.set(m.imageUrl, m);
          const parts = m.imageUrl.split('/');
          const filename = parts[parts.length - 1];
          if (filename) dishMapByUrl.set(filename, m);
        }
        if (m.id) {
          dishMapByName.set(m.id, m);
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

          // Check if file matches any dish in menu (e.g. prefix is dish.id)
          let matchedDish: MenuItem | undefined = dishMapByUrl.get(publicUrl) || dishMapByUrl.get(file.name);
          if (!matchedDish) {
            // Check prefix of file name (e.g. dishId-timestamp.webp)
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

      // B. Also include images from existing menu items (even if hosted via full URL or CDN)
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

  // Quick upload right from inside modal
  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingQuick(true);
    setErrorMsg(null);
    try {
      const fileName = `custom-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
      const { error: upErr } = await supabase.storage.from(bucketName).upload(fileName, file, {
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      const newUrl = urlData.publicUrl;

      // Add to list and select immediately
      const newItem: StorageImageItem = {
        id: fileName,
        name: fileName,
        publicUrl: newUrl,
        size: file.size,
        createdAt: new Date().toISOString(),
        category: selectedCat !== 'all' ? selectedCat : 'Cơm trưa',
      };
      setImages((prev) => [newItem, ...prev]);
      setChosenUrl(newUrl);
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi tải ảnh lên Storage');
    } finally {
      setUploadingQuick(false);
      if (quickUploadRef.current) quickUploadRef.current.value = '';
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
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Kho Ảnh Supabase Storage</h3>
              <p className="text-[11px] text-slate-400">
                Thư mục: <code className="text-indigo-300 font-mono">storage/{bucketName}</code> · Lọc theo danh mục & tìm theo tên
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

        {/* Filter & Search Bar */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-3">
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

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadStorageImages}
                disabled={loading}
                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                title="Làm mới danh sách ảnh từ Supabase"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                <span className="hidden sm:inline">Làm mới</span>
              </button>

              <input
                ref={quickUploadRef}
                type="file"
                accept="image/*"
                onChange={handleQuickUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => quickUploadRef.current?.click()}
                disabled={uploadingQuick}
                className="px-3 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                title="Tải ảnh mới từ máy lên Storage"
              >
                {uploadingQuick ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>Tải ảnh mới</span>
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1 flex-shrink-0">
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
                  Thử đổi từ khóa tìm kiếm hoặc bấm "Tải ảnh mới" để tải lên ảnh món ăn.
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
