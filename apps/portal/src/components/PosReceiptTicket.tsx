import React from 'react';
import {
  formatVnd,
  getOrderDisplayItems,
  getOrderTickets,
  type Order,
  type MenuItem,
  type OrderTicket,
  type TicketType,
} from '@canteen/shared';

export type PaperSize = 'k80' | 'k58';

interface PosReceiptTicketProps {
  order: Order;
  ticket?: OrderTicket;
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
  ticket,
  menu,
  paperSize = 'k80',
  index = 0,
  totalCount = 1,
  isPrintMode = false,
  isLast = false,
  isSingle = false,
}) => {
  // Nếu không truyền ticket riêng, mặc định dùng ticket từ getOrderTickets
  const currentTicket: OrderTicket =
    ticket || getOrderTickets(order, menu)[0] || {
      id: `${order.id || order.orderCode}-fallback`,
      ticketType: 'total',
      title: 'CƠM NGON SIBA',
      subtitle: 'ĂN SẠCH – SỐNG KHỎE · PHIẾU BẾP & XUẤT SUẤT ĂN',
      items: getOrderDisplayItems(order, menu),
      order,
      totalQuantity: 1,
      totalAmount: order.totalAmount,
    };

  const ticketType: TicketType = currentTicket.ticketType;
  const items = currentTicket.items;
  const isK58 = paperSize === 'k58';

  const formatPriceNum = (num: number) => {
    return formatVnd(num).replace(' ₫', '').replace(' đ', '');
  };

  const ticketBadgeLabel =
    ticketType === 'total'
      ? 'BILL TỔNG'
      : ticketType === 'food'
      ? 'BẾP CƠM'
      : 'BẾP NƯỚC';

  // Base container class depending on mode and paper size
  const containerClasses = isPrintMode
    ? `pos-receipt-ticket ${isK58 ? 'pos-k58' : 'pos-k80'} ${isLast ? 'is-last' : ''}`
    : `bg-white p-4 sm:p-5 rounded-xl border border-slate-300 shadow-xs font-mono leading-relaxed text-slate-900 mx-auto relative ${
        isK58 ? 'max-w-[270px] text-[11px]' : 'max-w-[340px] text-xs'
      }`;

  return (
    <div className={containerClasses}>
      {/* Page Number indicator in preview mode */}
      {!isPrintMode && (
        <div className="no-print absolute top-2 right-2 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-700 border border-slate-300">
          #{index + 1}/{totalCount} · {ticketBadgeLabel}
        </div>
      )}

      {/* Header with Brand Logo */}
      <div className="text-center pb-2 border-b border-dashed border-slate-400 space-y-1">
        <div className="flex justify-center my-0">
          <img
            src="/logo.svg"
            alt="Cơm Ngon SIBA"
            className={`object-contain select-none ${isK58 ? 'h-8 max-w-[140px]' : 'h-10 max-w-[180px]'}`}
          />
        </div>
        <h4 className="font-extrabold text-sm uppercase tracking-wider text-slate-900">
          CƠM NGON SIBA
        </h4>
        {ticketType === 'food' ? (
          <p className="text-[11px] font-black text-red-600 tracking-wider uppercase border border-dashed border-red-500 py-0.5 px-2 rounded-sm inline-block">
            PHIẾU BẾP – MÓN CƠM
          </p>
        ) : ticketType === 'drink' ? (
          <p className="text-[11px] font-black text-blue-600 tracking-wider uppercase border border-dashed border-blue-500 py-0.5 px-2 rounded-sm inline-block">
            PHIẾU BẾP – MÓN NƯỚC
          </p>
        ) : (
          <p className="text-[10px] font-extrabold text-red-600 tracking-wider uppercase">
            ĂN SẠCH – SỐNG KHỎE · PHIẾU BẾP & XUẤT SUẤT ĂN
          </p>
        )}
        {!isPrintMode && (
          <p className="text-[10px] text-slate-400 no-print">
            {isK58 ? 'Khổ nhiệt mini K58 (58mm)' : 'Khổ nhiệt tiêu chuẩn K80 (80mm)'}
          </p>
        )}
      </div>

      {/* Order info */}
      <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-600">Mã đơn:</span>
          <span className="font-extrabold text-slate-900 font-mono tracking-wide">{order.orderCode}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Giờ in:</span>
          <span className="font-semibold text-slate-800">
            {new Date().toLocaleString('vi-VN')}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Cán bộ:</span>
          <span className="font-bold text-slate-900">{order.userName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Đơn vị:</span>
          <span className="font-semibold text-slate-800">{order.userDepartment || 'Giáo viên'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Hình thức:</span>
          <span className="font-bold text-indigo-700">
            {order.deliveryMethod === 'room_delivery'
              ? `Giao phòng: ${order.roomNumber || 'P.Phòng'}`
              : 'Dùng tại Căn tin'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Giờ nhận:</span>
          <span className="font-bold text-amber-700">{order.pickupTime}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="py-2 border-b border-dashed border-slate-400">
        {ticketType === 'total' ? (
          // ================= BILL TỔNG: ĐẦY ĐỦ CỘT GIÁ TIỀN =================
          isK58 ? (
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between font-bold text-slate-600 pb-1 border-b border-slate-300">
                <span>Món ăn</span>
                <span>SL x Đơn giá / T.Tiền</span>
              </div>
              {items && items.length > 0 ? (
                items.map((it, i) => (
                  <div key={i} className="space-y-0.5 leading-tight">
                    <div className="font-semibold text-slate-900 whitespace-normal break-words">
                      {it.name}
                    </div>
                    <div className="flex justify-between text-slate-700 pl-1 font-mono">
                      <span>
                        {it.quantity} x {formatPriceNum(it.price || 0)}
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatPriceNum((it.quantity || 1) * (it.price || 0))}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-0.5 leading-tight">
                  <div className="font-semibold text-slate-900">Suất ăn Căn tin</div>
                  <div className="flex justify-between text-slate-700 pl-1 font-mono">
                    <span>1 x {formatPriceNum(order.totalAmount)}</span>
                    <span className="font-bold text-slate-900">{formatPriceNum(order.totalAmount)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1 border-b border-slate-300 pb-1">
                <span className="flex-1 min-w-0 pr-1">Tên món</span>
                <span className="w-6 text-center shrink-0">SL</span>
                <span className="w-14 text-right shrink-0">Đơn giá</span>
                <span className="w-16 text-right shrink-0">T.Tiền</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                {items && items.length > 0 ? (
                  items.map((it, i) => (
                    <div key={i} className="flex justify-between items-start leading-tight">
                      <span className="flex-1 min-w-0 pr-1.5 font-medium whitespace-normal break-words text-slate-900 leading-snug">
                        {it.name}
                      </span>
                      <span className="w-6 text-center font-bold shrink-0">{it.quantity}</span>
                      <span className="w-14 text-right text-slate-700 shrink-0 font-mono text-[10px]">
                        {formatPriceNum(it.price || 0)}
                      </span>
                      <span className="w-16 text-right font-bold text-slate-900 shrink-0 font-mono">
                        {formatPriceNum((it.quantity || 1) * (it.price || 0))}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between items-start leading-tight">
                    <span className="flex-1 min-w-0 pr-1.5 font-medium whitespace-normal break-words text-slate-900">
                      Suất ăn Căn tin
                    </span>
                    <span className="w-6 text-center font-bold shrink-0">1</span>
                    <span className="w-14 text-right text-slate-700 shrink-0 font-mono text-[10px]">
                      {formatPriceNum(order.totalAmount)}
                    </span>
                    <span className="w-16 text-right font-bold text-slate-900 shrink-0 font-mono">
                      {formatPriceNum(order.totalAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          // ================= BILL BẾP CƠM / BẾP NƯỚC: CHỈ HIỂN THỊ TÊN MÓN VÀ SỐ LƯỢNG =================
          isK58 ? (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between font-bold text-slate-600 pb-1 border-b border-slate-300">
                <span className="flex-1 min-w-0 pr-1">
                  {ticketType === 'food' ? 'Tên món cơm' : 'Tên đồ uống'}
                </span>
                <span className="w-10 text-right shrink-0">SL</span>
              </div>
              {items && items.length > 0 ? (
                items.map((it, i) => (
                  <div key={i} className="flex justify-between items-center py-1 border-b border-dotted border-slate-200 last:border-none leading-tight">
                    <div className="flex-1 min-w-0 pr-1">
                      <span className="font-bold text-slate-900 whitespace-normal break-words">
                        {it.name}
                      </span>
                      {it.isFromCombo && (
                        <span className="block text-[9px] text-slate-500 font-normal">
                          (Từ Combo)
                        </span>
                      )}
                    </div>
                    <span className="w-10 text-right font-black text-sm text-slate-900 shrink-0 font-mono">
                      x{it.quantity}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic py-1">Không có món</div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1 border-b border-slate-300 pb-1">
                <span className="flex-1 min-w-0 pr-2">
                  {ticketType === 'food' ? 'Tên món ăn / Cơm' : 'Tên đồ uống / Tráng miệng'}
                </span>
                <span className="w-16 text-right shrink-0">Số lượng</span>
              </div>
              <div className="space-y-1 text-[11px]">
                {items && items.length > 0 ? (
                  items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-dotted border-slate-200 last:border-none leading-tight">
                      <div className="flex-1 min-w-0 pr-2">
                        <span className="font-bold text-slate-900 whitespace-normal break-words leading-snug">
                          {it.name}
                        </span>
                        {it.isFromCombo && (
                          <span className="block text-[9px] text-slate-500 font-normal">
                            (Từ phần Combo)
                          </span>
                        )}
                      </div>
                      <span className="w-16 text-right font-black text-base text-slate-900 shrink-0 font-mono">
                        x{it.quantity}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic py-1">Không có món</div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Note if any */}
      {order.note && (
        <div className="py-1.5 border-b border-dashed border-slate-400 text-[10px] text-slate-800 break-words">
          <strong>Ghi chú:</strong> {order.note}
        </div>
      )}

      {/* Summary Section */}
      {ticketType === 'total' ? (
        <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
          <div className="flex justify-between font-bold text-xs pt-0.5">
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
      ) : (
        <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
          <div className="flex justify-between font-bold text-xs pt-0.5">
            <span>{ticketType === 'food' ? 'TỔNG MÓN BẾP CƠM:' : 'TỔNG ĐỒ UỐNG:'}</span>
            <span className="font-black text-sm font-mono tracking-tight text-slate-900">
              {currentTicket.totalQuantity} {ticketType === 'food' ? 'suất' : 'ly/phần'}
            </span>
          </div>
        </div>
      )}

      {/* Footer message */}
      <div className="text-center pt-2 text-[10px] text-slate-600 space-y-0.5">
        <p className="font-semibold text-slate-800">Chúc quý Thầy / Cô ngon miệng!</p>
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

