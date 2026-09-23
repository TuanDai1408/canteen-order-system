import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationControlsProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  itemName?: string;
  className?: string;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  itemName = 'mục',
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  if (totalItems <= 0) return null;

  const startIdx = (validPage - 1) * pageSize + 1;
  const endIdx = Math.min(validPage * pageSize, totalItems);

  // Generate intelligent page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (validPage > 3) pages.push('...');
      const start = Math.max(2, validPage - 1);
      const end = Math.min(totalPages - 1, validPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (validPage < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div
      className={`px-4 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 text-slate-600 font-medium">
        <span>
          Hiển thị{' '}
          <strong className="text-slate-900 font-bold font-mono">
            {startIdx} - {endIdx}
          </strong>{' '}
          trên tổng số{' '}
          <strong className="text-slate-900 font-bold font-mono">{totalItems}</strong> {itemName}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
            <span className="text-slate-500 text-[11px]">Dòng/trang:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
              }}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer min-h-[30px]"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / trang
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={validPage <= 1}
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          title="Về trang đầu"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(validPage - 1)}
          disabled={validPage <= 1}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1 min-h-[32px]"
          title="Trang trước"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Trước</span>
        </button>

        <div className="flex items-center gap-1 px-1">
          {getPageNumbers().map((p, idx) =>
            p === '...' ? (
              <span key={`dots-${idx}`} className="px-1.5 py-1 text-slate-400 font-bold">
                ...
              </span>
            ) : (
              <button
                type="button"
                key={`page-${p}`}
                onClick={() => onPageChange(Number(p))}
                className={`min-w-[32px] h-8 px-2 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center ${
                  validPage === p
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(validPage + 1)}
          disabled={validPage >= totalPages}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1 min-h-[32px]"
          title="Trang sau"
        >
          <span className="hidden sm:inline">Sau</span>
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={validPage >= totalPages}
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          title="Đến trang cuối"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
