import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Copy,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Search,
  Check,
  RefreshCw,
  Sparkles,
  UtensilsCrossed,
  Layers,
  Trash2,
} from 'lucide-react';
import {
  formatVnd,
  copyMenuBetweenSites,
  getAllMenuItems,
  type MenuItem,
  type Site,
  type SiteCode,
  type UserProfile,
} from '@canteen/shared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  currentSiteCode: SiteCode;
  sitesList: Site[];
  menu: MenuItem[];
  onSuccess: (count: number, sourceName: string, targetName: string) => void;
}

export function CopyMenuModal({
  isOpen,
  onClose,
  currentUser,
  currentSiteCode,
  sitesList,
  menu,
  onSuccess,
}: Props) {
  const [sourceSiteCode, setSourceSiteCode] = useState<SiteCode>(() => {
    // Nếu site hiện tại là g_group, mặc định nguồn là hung_vuong để tiện copy sang g_group
    return (currentSiteCode === 'g_group' ? 'hung_vuong' : currentSiteCode) as SiteCode;
  });
  const [targetSiteCode, setTargetSiteCode] = useState<SiteCode>(() => {
    const other = sitesList.find((s) => s.code !== (currentSiteCode === 'g_group' ? 'hung_vuong' : currentSiteCode));
    return (other?.code || (currentSiteCode === 'hung_vuong' ? 'g_group' : 'hung_vuong')) as SiteCode;
  });

  const [copyMode, setCopyMode] = useState<'append' | 'replace'>('append');
  const [selectionType, setSelectionType] = useState<'all' | 'custom'>('all');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [resetStock, setResetStock] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Món ăn của cơ sở nguồn (được tải trực tiếp và đồng bộ từ database)
  const [sourceDishes, setSourceDishes] = useState<MenuItem[]>(() => {
    if (sourceSiteCode === currentSiteCode && Array.isArray(menu) && menu.length > 0) {
      return menu;
    }
    return [];
  });
  const [loadingSource, setLoadingSource] = useState(false);

  // Khi modal mở hoặc đổi cơ sở nguồn: Luôn tải danh sách món tươi mới từ Supabase
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoadingSource(true);
    setErrorMsg(null);
    getAllMenuItems({ siteId: sourceSiteCode })
      .then((items) => {
        if (active) {
          setSourceDishes(items || []);
          setSelectedItemIds(new Set());
        }
      })
      .catch((err) => {
        if (active) {
          console.warn('[CopyMenuModal load dishes error]:', err);
        }
      })
      .finally(() => {
        if (active) setLoadingSource(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, sourceSiteCode]);

  // Filtered dishes for selection search
  const filteredDishes = useMemo(() => {
    if (!searchQuery.trim()) return sourceDishes;
    const q = searchQuery.toLowerCase().trim();
    return sourceDishes.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.category && d.category.toLowerCase().includes(q))
    );
  }, [sourceDishes, searchQuery]);

  if (!isOpen) return null;

  const sourceSite = sitesList.find((s) => s.code === sourceSiteCode) || {
    id: sourceSiteCode,
    code: sourceSiteCode,
    name: sourceSiteCode === 'hung_vuong' ? 'Đại học Hùng Vương' : 'Canteen G-Group',
  };

  const targetSite = sitesList.find((s) => s.code === targetSiteCode) || {
    id: targetSiteCode,
    code: targetSiteCode,
    name: targetSiteCode === 'hung_vuong' ? 'Đại học Hùng Vương' : 'Canteen G-Group',
  };

  const dishesToCopyCount =
    selectionType === 'all' ? sourceDishes.length : selectedItemIds.size;

  const handleToggleItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      filteredDishes.forEach((d) => next.add(d.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedItemIds(new Set());
  };

  const handleExecuteCopy = async () => {
    setErrorMsg(null);

    if (sourceSiteCode === targetSiteCode) {
      setErrorMsg('Cơ sở nguồn và cơ sở đích không được trùng nhau.');
      return;
    }

    if (dishesToCopyCount === 0) {
      setErrorMsg('Vui lòng chọn ít nhất 1 món ăn để sao chép.');
      return;
    }

    setIsSubmitting(true);
    try {
      const idsToCopy = selectionType === 'custom' ? Array.from(selectedItemIds) : undefined;
      const res = await copyMenuBetweenSites({
        sourceSiteId: sourceSiteCode,
        targetSiteId: targetSiteCode,
        itemIds: idsToCopy,
        mode: copyMode,
        actor: currentUser,
        resetStockToPrepared: resetStock,
      });

      if (res.success) {
        onSuccess(res.count, sourceSite.name, targetSite.name);
        onClose();
      } else {
        setErrorMsg(res.error || 'Lỗi khi sao chép thực đơn.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi hệ thống khi sao chép thực đơn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Sao chép Thực đơn giữa các Cơ sở
              </h3>
              <p className="text-xs text-slate-500">
                Nhân bản nhanh toàn bộ hoặc từng món ăn từ cơ sở này sang cơ sở khác
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-700">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Site selection strip */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              {/* Source Site */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Cơ sở nguồn (Sao chép từ):</span>
                </label>
                <select
                  value={sourceSiteCode}
                  onChange={(e) => {
                    const nextSrc = e.target.value as SiteCode;
                    setSourceSiteCode(nextSrc);
                    if (targetSiteCode === nextSrc) {
                      const other = sitesList.find((s) => s.code !== nextSrc);
                      if (other) setTargetSiteCode(other.code);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {sitesList.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 font-medium">
                  Hiện có: <strong className="text-indigo-700 font-bold">{sourceDishes.length}</strong> món ăn
                </p>
              </div>

              {/* Destination Site */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cơ sở đích (Dán sang):</span>
                </label>
                <select
                  value={targetSiteCode}
                  onChange={(e) => setTargetSiteCode(e.target.value as SiteCode)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {sitesList
                    .filter((s) => s.code !== sourceSiteCode)
                    .map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-emerald-700 font-medium">
                  Món ăn sẽ được ghi nhận và phục vụ tại cơ sở này
                </p>
              </div>
            </div>
          </div>

          {/* Copy Mode Selection */}
          <div className="space-y-2">
            <label className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Chế độ sao chép:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Append Mode */}
              <button
                type="button"
                onClick={() => setCopyMode('append')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  copyMode === 'append'
                    ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-slate-900 text-xs">
                      Thêm tiếp vào thực đơn (Append)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Khuyên dùng
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Giữ nguyên các món hiện có tại cơ sở đích, chỉ thêm các món mới được sao chép vào.
                  </p>
                </div>
              </button>

              {/* Replace Mode */}
              <button
                type="button"
                onClick={() => setCopyMode('replace')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  copyMode === 'replace'
                    ? 'border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-rose-900 text-xs">
                      Thay thế toàn bộ (Replace)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                      Ghi đè
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Xóa thực đơn cũ của cơ sở đích và thay thế hoàn toàn bằng các món được sao chép.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Dishes Selection Scope */}
          <div className="space-y-2.5">
            <label className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-indigo-600" />
              <span>Phạm vi món ăn cần sao chép:</span>
            </label>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="selectionType"
                  checked={selectionType === 'all'}
                  onChange={() => setSelectionType('all')}
                  className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Sao chép tất cả ({sourceDishes.length} món)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="selectionType"
                  checked={selectionType === 'custom'}
                  onChange={() => {
                    setSelectionType('custom');
                    if (selectedItemIds.size === 0) {
                      setSelectedItemIds(new Set(sourceDishes.map((d) => d.id)));
                    }
                  }}
                  className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>
                  Chọn từng món cụ thể ({selectedItemIds.size}/{sourceDishes.length})
                </span>
              </label>
            </div>

            {/* Custom selection table */}
            {selectionType === 'custom' && (
              <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50/70 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm kiếm món trong danh sách..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="px-2 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-2 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {filteredDishes.length === 0 ? (
                    <p className="text-center py-4 text-slate-400 text-xs">
                      Không tìm thấy món ăn phù hợp với từ khóa
                    </p>
                  ) : (
                    filteredDishes.map((dish) => {
                      const isChecked = selectedItemIds.has(dish.id);
                      return (
                        <div
                          key={dish.id}
                          onClick={() => handleToggleItem(dish.id)}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                            isChecked
                              ? 'bg-indigo-50/80 border-indigo-200 text-slate-900'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by wrapper
                              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            {dish.imageUrl ? (
                              <img
                                src={dish.imageUrl}
                                alt={dish.name}
                                className="w-7 h-7 rounded-lg object-cover flex-shrink-0 border border-slate-200"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                                <UtensilsCrossed className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-xs truncate text-slate-900">
                                {dish.name}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {dish.category || 'Cơm trưa'}
                              </p>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-xs text-indigo-700 flex-shrink-0">
                            {formatVnd(dish.price)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reset Stock Option */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={resetStock}
                onChange={(e) => setResetStock(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-900">
                  Đặt lại số lượng tồn kho theo số lượng chuẩn bị nấu (Khuyên dùng)
                </span>
                <p className="text-[11px] text-slate-500">
                  Tồn kho món ăn tại cơ sở đích sẽ được thiết lập bằng <code>prepared_stock</code> (mặc định 50 suất) để sẵn sàng cho khách đặt.
                </p>
              </div>
            </label>
          </div>

          {/* Summary Preview Box */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-200/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <div className="text-xs text-slate-800">
                Sẽ sao chép{' '}
                <strong className="text-indigo-700 font-extrabold">{dishesToCopyCount} món</strong>{' '}
                từ <strong>{sourceSite.name}</strong> sang <strong>{targetSite.name}</strong>{' '}
                theo chế độ{' '}
                <strong className={copyMode === 'replace' ? 'text-rose-700' : 'text-emerald-700'}>
                  {copyMode === 'replace' ? 'Thay thế toàn bộ' : 'Thêm tiếp (Append)'}
                </strong>
                .
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition cursor-pointer min-h-[40px]"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleExecuteCopy}
            disabled={isSubmitting || dishesToCopyCount === 0}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shadow-md shadow-indigo-600/20 min-h-[40px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang sao chép...</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Sao chép {dishesToCopyCount} món</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
