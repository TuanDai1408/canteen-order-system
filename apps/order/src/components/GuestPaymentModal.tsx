import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  QrCode,
  Banknote,
  Building,
  CreditCard,
  ChefHat,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { formatVnd, Site, PaymentMethod, PaymentStatus, getVietQrBankCode } from '@canteen/shared';

interface GuestPaymentModalProps {
  isOpen: boolean;
  order: {
    id: string;
    orderCode: string;
    totalAmount: number;
    paymentMethod: PaymentMethod;
    guestName?: string;
    guestPhone?: string;
    pickupTime?: string;
    site?: Site;
  } | null;
  status: PaymentStatus;
  rejectReason?: string;
  onClose: () => void;
}

export function GuestPaymentModal({
  isOpen,
  order,
  status,
  rejectReason,
  onClose,
}: GuestPaymentModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const bankName = order.site?.bankName || order.site?.bankAccountInfo?.bankName || 'MB Bank (Quân Đội)';
  const bankAccountNo = order.site?.bankAccountNo || order.site?.bankAccountInfo?.accountNumber || '999988886666';
  const bankAccountName = order.site?.bankAccountName || order.site?.bankAccountInfo?.accountHolder || 'CANTEEN G-GROUP';
  const transferNote = `CT ${order.orderCode}`;
  const bankCode = getVietQrBankCode(bankName);

  // Nếu có ảnh QR tuỳ chỉnh do Quản trị viên tải lên (không phải mẫu mặc định) thì hiển thị ảnh đó,
  // nếu không sẽ tạo mã VietQR động theo chuẩn ngân hàng kèm số tiền bill: amount=${order.totalAmount}
  const customQrImage =
    order.site?.bankQrImageUrl && !order.site.bankQrImageUrl.includes('MB-999988886666')
      ? order.site.bankQrImageUrl
      : order.site?.bankAccountInfo?.qrImageUrl && !order.site.bankAccountInfo.qrImageUrl.includes('MB-999988886666')
      ? order.site.bankAccountInfo.qrImageUrl
      : null;

  const qrUrl =
    customQrImage ||
    `https://img.vietqr.io/image/${bankCode}-${bankAccountNo}-compact2.png?amount=${order.totalAmount}&addInfo=${encodeURIComponent(
      transferNote
    )}&accountName=${encodeURIComponent(bankAccountName)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden my-auto p-6 sm:p-7 space-y-5 relative">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Đơn hàng khách lẻ</span>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>Mã đơn: #{order.orderCode}</span>
            </h3>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-medium text-slate-400">Tổng thanh toán</span>
            <p className="text-base font-black text-teal-600">{formatVnd(order.totalAmount)}</p>
          </div>
        </div>

        {/* 1. STATE: PENDING (Đang chờ thanh toán) */}
        {status === 'pending' && (
          <div className="space-y-4">
            {order.paymentMethod === 'cash' ? (
              // Tiền mặt
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 mx-auto flex items-center justify-center shadow-inner relative">
                  <Banknote className="w-8 h-8" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 animate-ping" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-lg font-black text-slate-900">
                    Chờ nhân viên xác nhận thanh toán…
                  </h4>
                  <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                    Vui lòng di chuyển đến quầy thu ngân Căn tin và đọc mã đơn{' '}
                    <strong className="text-indigo-600 font-mono text-sm">#{order.orderCode}</strong> để thanh toán tiền mặt.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Khách hàng:</span>
                    <span className="font-bold text-slate-800">{order.guestName || 'Khách vãng lai'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Số điện thoại:</span>
                    <span className="font-mono font-bold text-slate-800">{order.guestPhone || 'Chưa cung cấp'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thời gian nhận:</span>
                    <span className="font-bold text-slate-800">{order.pickupTime || 'Ngay khi có món'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2 text-left">
                  <RefreshCw className="w-4 h-4 shrink-0 text-amber-600 animate-spin" />
                  <span>
                    Hệ thống đang đồng bộ thời gian thực. Ngay khi nhân viên thu ngân bấm xác nhận, màn hình sẽ tự động chuyển sang hoàn tất!
                  </span>
                </div>
              </div>
            ) : (
              // Chuyển khoản VietQR
              <div className="space-y-4 text-center">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold">
                    <QrCode className="w-3.5 h-3.5 text-teal-600" />
                    <span>Quét mã VietQR chuyển khoản</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900">
                    Chờ nhân viên xác nhận chuyển khoản…
                  </h4>
                </div>

                {/* QR Code image */}
                <div className="bg-white p-3 rounded-2xl border-2 border-dashed border-teal-400 shadow-sm inline-block mx-auto max-w-[250px]">
                  <img
                    src={qrUrl}
                    alt="VietQR Chuyển khoản"
                    className="w-56 h-56 object-contain rounded-lg mx-auto"
                    onError={(e) => {
                      // Fallback if image fails
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="mt-2 py-1 px-2.5 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold text-teal-800">
                    <span>Số tiền bill:</span>
                    <span className="text-teal-950 font-black">{formatVnd(order.totalAmount)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Quét bằng mọi ứng dụng Ngân hàng</p>
                </div>

                {/* Bank transfer info table with 1-click copy */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60">
                    <span className="text-slate-500">Ngân hàng:</span>
                    <span className="font-bold text-slate-800">{bankName}</span>
                  </div>

                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60">
                    <span className="text-slate-500">Số tài khoản:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900">{bankAccountNo}</span>
                      <button
                        onClick={() => handleCopy(bankAccountNo, 'acc')}
                        className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
                        title="Sao chép STK"
                      >
                        {copiedKey === 'acc' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60">
                    <span className="text-slate-500">Chủ tài khoản:</span>
                    <span className="font-bold text-slate-800">{bankAccountName}</span>
                  </div>

                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60">
                    <span className="text-slate-500">Số tiền:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-teal-600">{formatVnd(order.totalAmount)}</span>
                      <button
                        onClick={() => handleCopy(String(order.totalAmount), 'amt')}
                        className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
                        title="Sao chép số tiền"
                      >
                        {copiedKey === 'amt' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-teal-50/80 -mx-1.5 px-2 py-1.5 rounded-lg border border-teal-200">
                    <span className="font-bold text-teal-900">Nội dung CK:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-indigo-700">{transferNote}</span>
                      <button
                        onClick={() => handleCopy(transferNote, 'note')}
                        className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 cursor-pointer flex items-center gap-0.5"
                      >
                        {copiedKey === 'note' ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-[11px] flex items-center gap-2 text-left">
                  <RefreshCw className="w-4 h-4 shrink-0 text-teal-600 animate-spin" />
                  <span>
                    Sau khi bạn chuyển khoản xong, nhân viên Portal sẽ duyệt và màn hình này sẽ tự động chuyển thành công!
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. STATE: PAID (Đã thanh toán thành công) */}
        {status === 'paid' && (
          <div className="space-y-4 text-center py-2 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-300 mx-auto flex items-center justify-center shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xl font-black text-slate-900">
                Thanh Toán Thành Công! 🎉
              </h4>
              <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                Đơn hàng <strong className="font-mono text-indigo-700">#{order.orderCode}</strong> đã được Căn tin xác nhận thanh toán. Phiếu bếp và bill đã được xuất tự động.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-3 text-left">
              <ChefHat className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Bếp đang chế biến món ăn</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Vui lòng chờ gọi số hoặc liên hệ quầy theo giờ nhận: <strong>{order.pickupTime || 'Ngay bây giờ'}</strong>.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition cursor-pointer shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 min-h-[44px]"
            >
              <span>Hoàn tất & Tiếp tục đặt món</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 3. STATE: REJECTED (Bị từ chối / Hủy) */}
        {status === 'rejected' && (
          <div className="space-y-4 text-center py-2 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 border border-rose-300 mx-auto flex items-center justify-center shadow-sm">
              <XCircle className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xl font-black text-slate-900">
                Đơn Hàng Đã Bị Từ Chối
              </h4>
              <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                Rất tiếc, nhân viên Căn tin không thể xác nhận thanh toán cho đơn hàng <strong className="font-mono text-slate-800">#{order.orderCode}</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-left">
              <p className="font-bold mb-1">Lý do hủy đơn:</p>
              <p className="text-[11px] text-rose-700">
                {rejectReason || 'Không nhận được thanh toán chuyển khoản hoặc hết suất ăn trong kho. Tồn kho món ăn đã được tự động hoàn lại.'}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl text-xs transition cursor-pointer min-h-[44px]"
            >
              Đóng & Quay lại thực đơn
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
