import React, { useState, useEffect } from 'react';
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
  Download,
  ZoomIn,
  Maximize2,
  X,
  Loader2,
} from 'lucide-react';
import {
  formatVnd,
  Site,
  PaymentMethod,
  PaymentStatus,
  getVietQrBankCode,
  getCachedSites,
  getSitePaymentQrUrl,
  downloadQrImage,
} from '@canteen/shared';

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
  const [, setSiteVersion] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const handleSiteUpdate = () => setSiteVersion((v) => v + 1);
    window.addEventListener('canteen_site_updated', handleSiteUpdate);
    return () => window.removeEventListener('canteen_site_updated', handleSiteUpdate);
  }, []);

  if (!isOpen || !order) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const siteCode = order.site?.code || 'g_group';
  const latestSite = getCachedSites().find((s) => s.code === siteCode) || order.site;
  const bankName = latestSite?.bankName || latestSite?.bankAccountInfo?.bankName || 'VietinBank';
  const bankAccountNo = latestSite?.bankAccountNo || latestSite?.bankAccountInfo?.accountNumber || '01CN001452330060082';
  const bankAccountName = latestSite?.bankAccountName || latestSite?.bankAccountInfo?.accountHolder || 'CANTEEN G-GROUP';
  const transferNote = `CT ${order.orderCode}`;

  const qrUrl = getSitePaymentQrUrl(latestSite, order.totalAmount, transferNote);

  const handleDownloadQr = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadQrImage(qrUrl, `VietQR-${order.orderCode}`);
    } finally {
      setTimeout(() => setIsDownloading(false), 500);
    }
  };

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

                {/* QR Code image with click-to-zoom & download */}
                <div className="space-y-2">
                  <div
                    onClick={() => setIsZoomOpen(true)}
                    className="group relative bg-white p-3 rounded-2xl border-2 border-dashed border-teal-400 hover:border-teal-600 shadow-sm inline-block mx-auto max-w-[250px] cursor-pointer transition hover:shadow-md"
                    title="Bấm để phóng to mã QR"
                  >
                    <img
                      src={qrUrl}
                      alt="VietQR Chuyển khoản"
                      className="w-56 h-56 object-contain rounded-lg mx-auto transition group-hover:scale-102"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://img.vietqr.io/image/ICB-${bankAccountNo}-compact2.png?amount=${order.totalAmount}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent(bankAccountName)}`;
                      }}
                    />
                    <div className="absolute inset-x-3 bottom-12 bg-slate-900/75 backdrop-blur-xs text-white text-[11px] font-bold py-1 px-2 rounded-lg opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 shadow-sm">
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Bấm để phóng to QR</span>
                    </div>
                    <div className="mt-2 py-1 px-2.5 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold text-teal-800">
                      <span>Số tiền bill:</span>
                      <span className="text-teal-950 font-black">{formatVnd(order.totalAmount)}</span>
                    </div>
                    <p className="text-[10px] text-teal-700 mt-1 font-medium flex items-center justify-center gap-1">
                      <Maximize2 className="w-3 h-3" />
                      <span>Bấm vào hình để phóng to & tải về</span>
                    </p>
                  </div>

                  {/* Action buttons: Phóng to & Tải về */}
                  <div className="flex items-center justify-center gap-2 max-w-[260px] mx-auto">
                    <button
                      type="button"
                      onClick={() => setIsZoomOpen(true)}
                      className="flex-1 py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-teal-600" />
                      <span>Phóng to</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      disabled={isDownloading}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-600/20 disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Tải ảnh QR</span>
                    </button>
                  </div>
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

      {/* MODAL PHÓNG TO MÃ QR & TẢI VỀ */}
      {isZoomOpen && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-150"
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden p-6 space-y-4 text-center relative animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
                <QrCode className="w-4 h-4 text-teal-600" />
                <span>Mã VietQR thanh toán #{order.orderCode}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                title="Đóng phóng to"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ảnh QR to và rõ nét */}
            <div className="bg-white p-3 rounded-2xl border-2 border-teal-500 shadow-inner inline-block mx-auto">
              <img
                src={qrUrl}
                alt={`VietQR #${order.orderCode}`}
                className="w-72 h-72 sm:w-80 sm:h-80 object-contain mx-auto rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://img.vietqr.io/image/ICB-${bankAccountNo}-compact2.png?amount=${order.totalAmount}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent(bankAccountName)}`;
                }}
              />
            </div>

            {/* Thông tin số tiền & tài khoản */}
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs text-left">
              <div className="flex justify-between items-center pb-1 border-b border-slate-200/60">
                <span className="text-slate-500">Số tiền thanh toán:</span>
                <span className="font-black text-base text-teal-700">{formatVnd(order.totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center pb-1 border-b border-slate-200/60">
                <span className="text-slate-500">Ngân hàng:</span>
                <span className="font-bold text-slate-800">{bankName}</span>
              </div>
              <div className="flex justify-between items-center pb-1 border-b border-slate-200/60">
                <span className="text-slate-500">Số tài khoản:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-900">{bankAccountNo}</span>
                  <button
                    onClick={() => handleCopy(bankAccountNo, 'acc_zoom')}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
                    title="Sao chép STK"
                  >
                    {copiedKey === 'acc_zoom' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center bg-teal-50/80 -mx-1 px-2 py-1 rounded-lg border border-teal-200">
                <span className="font-bold text-teal-900">Nội dung CK:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-indigo-700">{transferNote}</span>
                  <button
                    onClick={() => handleCopy(transferNote, 'note_zoom')}
                    className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 cursor-pointer flex items-center gap-0.5"
                  >
                    {copiedKey === 'note_zoom' ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Nút tải về lớn */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadQr}
                disabled={isDownloading}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Tải ảnh QR về máy</span>
              </button>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
