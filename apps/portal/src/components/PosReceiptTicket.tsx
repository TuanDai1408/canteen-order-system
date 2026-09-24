import React from 'react';
import { formatVnd, getOrderDisplayItems, type Order, type MenuItem } from '@canteen/shared';

export type PaperSize = 'k80' | 'k58';

interface PosReceiptTicketProps {
  order: Order;
  menu: MenuItem[];
  paperSize?: PaperSize;
  index?: number;
  totalCount?: number;
  isPrintMode?: boolean;
  isLast?: boolean;
  isSingle?: boolean;
}

export const PosReceiptTicket: React.FC<PosReceiptTicketProps> = ({
  order,
  menu,
  paperSize = 'k80',
  index = 0,
  totalCount = 1,
  isPrintMode = false,
  isLast = false,
  isSingle = false,
}) => {
  const displayItems = getOrderDisplayItems(order, menu);
  const isK58 = paperSize === 'k58';

  const formatPriceNum = (num: number) => {
    return formatVnd(num).replace(' ₫', '').replace(' đ', '');
  };

  // Base container class depending on mode and paper size
  const containerClasses = isPrintMode
    ? `pos-receipt-ticket ${isK58 ? 'pos-k58' : 'pos-k80'} ${isLast ? 'is-last' : ''}`
    : `bg-white p-5 rounded-xl border border-slate-300 shadow-xs font-mono leading-relaxed text-slate-900 mx-auto relative ${
        isK58 ? 'max-w-[270px] text-[11px]' : 'max-w-[340px] text-xs'
      }`;

  return (
    <div className={containerClasses}>
      {/* Page Number indicator in preview mode */}
      {!isPrintMode && !isSingle && (
        <div className="no-print absolute top-2 right-2 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600 border border-slate-200">
          #{index + 1}/{totalCount}
        </div>
      )}

      {/* Header */}
      <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
        <h4 className="font-bold text-sm uppercase tracking-wider text-slate-900">
          CƠM NGON SIBA
        </h4>
        <p className="text-[11px] font-bold text-red-600">
          ĂN SẠCH – SỐNG KHỎE · PHIẾU CHẾ BIẾN & XUẤT SUẤT ĂN
        </p>
        {!isPrintMode && (
          <p className="text-[10px] text-slate-400 no-print">
            {isK58 ? 'Khổ nhiệt mini K58 (58mm)' : 'Khổ nhiệt tiêu chuẩn K80 (80mm)'}
          </p>
        )}
      </div>

      {/* Order info */}
      <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-500">Mã đơn:</span>
          <span className="font-bold text-slate-900 font-mono tracking-wide">{order.orderCode}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Giờ in:</span>
          <span className="font-medium text-slate-800">
            {new Date().toLocaleString('vi-VN')}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Cán bộ:</span>
          <span className="font-bold text-slate-900">{order.userName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Đơn vị:</span>
          <span className="font-semibold text-slate-800">{order.userDepartment || 'Giáo viên'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Hình thức:</span>
          <span className="font-bold text-indigo-700">
            {order.deliveryMethod === 'room_delivery'
              ? `Giao phòng: ${order.roomNumber || 'P.Phòng'}`
              : 'Dùng tại Căn tin'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Giờ nhận suất:</span>
          <span className="font-bold text-amber-700">{order.pickupTime}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="py-2.5 border-b border-dashed border-slate-400">
        {isK58 ? (
          // K58 Layout: 2-line layout per item so long names like "Cơm cá thu sốt cà chua"
          // have full width and never get squeezed or overlapped.
          <div className="space-y-2 text-[10px]">
            <div className="flex justify-between font-bold text-slate-500 pb-1 border-b border-slate-200">
              <span>Món ăn</span>
              <span>SL x Đơn giá / T.Tiền</span>
            </div>
            {displayItems && displayItems.length > 0 ? (
              displayItems.map((it, i) => (
                <div key={i} className="space-y-0.5 leading-tight">
                  <div className="font-semibold text-slate-900 whitespace-normal break-words">
                    {it.name}
                  </div>
                  <div className="flex justify-between text-slate-600 pl-1 font-mono">
                    <span>
                      {it.quantity} x {formatPriceNum(it.price)}
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatPriceNum(it.quantity * it.price)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-0.5 leading-tight">
                <div className="font-semibold text-slate-900">Suất ăn Căn tin</div>
                <div className="flex justify-between text-slate-600 pl-1 font-mono">
                  <span>1 x {formatPriceNum(order.totalAmount)}</span>
                  <span className="font-bold text-slate-900">{formatPriceNum(order.totalAmount)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          // K80 Layout: 4 columns with flexible item name column and fixed numeric columns
          // Long dish names wrap cleanly into lines 2+ without overlapping SL, Đơn giá, T.Tiền.
          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1 border-b border-slate-200 pb-1">
              <span className="flex-1 min-w-0 pr-1">Tên món</span>
              <span className="w-6 text-center shrink-0">SL</span>
              <span className="w-13 text-right shrink-0">Đơn giá</span>
              <span className="w-16 text-right shrink-0">T.Tiền</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              {displayItems && displayItems.length > 0 ? (
                displayItems.map((it, i) => (
                  <div key={i} className="flex justify-between items-start leading-tight">
                    <span className="flex-1 min-w-0 pr-1.5 font-medium whitespace-normal break-words text-slate-900 leading-snug">
                      {it.name}
                    </span>
                    <span className="w-6 text-center font-bold shrink-0">{it.quantity}</span>
                    <span className="w-13 text-right text-slate-600 shrink-0 font-mono text-[10px]">
                      {formatPriceNum(it.price)}
                    </span>
                    <span className="w-16 text-right font-bold text-slate-900 shrink-0 font-mono">
                      {formatPriceNum(it.quantity * it.price)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between items-start leading-tight">
                  <span className="flex-1 min-w-0 pr-1.5 font-medium whitespace-normal break-words text-slate-900">
                    Suất ăn Căn tin
                  </span>
                  <span className="w-6 text-center font-bold shrink-0">1</span>
                  <span className="w-13 text-right text-slate-600 shrink-0 font-mono text-[10px]">
                    {formatPriceNum(order.totalAmount)}
                  </span>
                  <span className="w-16 text-right font-bold text-slate-900 shrink-0 font-mono">
                    {formatPriceNum(order.totalAmount)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Note if any */}
      {order.note && (
        <div className="py-2 border-b border-dashed border-slate-400 text-[10px] text-slate-700 break-words">
          <strong>Ghi chú:</strong> {order.note}
        </div>
      )}

      {/* Summary */}
      <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
        <div className="flex justify-between font-bold text-xs pt-1">
          <span>TỔNG CỘNG:</span>
          <span className="text-indigo-700 font-black text-sm font-mono tracking-tight">
            {formatVnd(order.totalAmount)}
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Thanh toán:</span>
          <span>Ví suất ăn Căn tin</span>
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Trạng thái:</span>
          <span className="font-semibold text-emerald-700">Đã trừ ví tự động</span>
        </div>
      </div>

      {/* Footer message */}
      <div className="text-center pt-3 text-[10px] text-slate-500 space-y-0.5">
        <p className="font-medium text-slate-800">Chúc quý Thầy / Cô ngon miệng!</p>
        <p className="text-[9px] text-slate-400 italic font-mono no-print">
          JetBrains Mono · Courier New (Monospace)
        </p>
      </div>

      {/* Paper tear line separator in preview modal */}
      {!isPrintMode && !isLast && (
        <div className="no-print mt-4 pt-2 text-center text-[10px] text-slate-400 border-t border-dashed border-slate-400 font-mono">
          ✂ - - - - - - - - [ VẾT CẮT GIẤY IN NHIỆT POS ] - - - - - - - - ✂
        </div>
      )}
    </div>
  );
};
