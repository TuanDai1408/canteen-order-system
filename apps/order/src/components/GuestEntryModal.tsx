import React from 'react';
import { UserCheck, UtensilsCrossed, Building2, Store, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Site, SiteCode } from '@canteen/shared';

interface GuestEntryModalProps {
  isOpen: boolean;
  sites: Site[];
  currentSiteCode: SiteCode;
  onSelectStaffLogin: () => void;
  onSelectGuestOrder: (siteCode: SiteCode) => void;
}

export function GuestEntryModal({
  isOpen,
  sites,
  currentSiteCode,
  onSelectStaffLogin,
  onSelectGuestOrder,
}: GuestEntryModalProps) {
  if (!isOpen) return null;

  const gGroupSite = sites.find((s) => s.code === 'g_group') || sites[1] || sites[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-lg w-full overflow-hidden p-6 sm:p-8 space-y-6 relative">
        {/* Decorative blur elements */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-100/50 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-100/50 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="text-center space-y-2 relative z-10">
          <div className="flex justify-center mb-3">
            <BrandLogo height={52} />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Chào Mừng Đến Căn Tin
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
            Vui lòng lựa chọn hình thức trải nghiệm phù hợp để bắt đầu đặt suất ăn
          </p>
        </div>

        {/* 2 Options Cards */}
        <div className="space-y-3.5 relative z-10">
          {/* Option 1: Staff / Teacher Login */}
          <button
            onClick={onSelectStaffLogin}
            className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-indigo-100 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/80 transition-all duration-200 group cursor-pointer shadow-xs hover:shadow-md relative overflow-hidden"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/30 group-hover:scale-105 transition-transform">
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm sm:text-base font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors">
                    Cán bộ / Giáo viên
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    Cơ sở Hùng Vương
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  Đăng nhập tài khoản nội bộ, thanh toán tự động qua ví suất ăn, áp dụng khung giờ đặt món và mã ngoại lệ.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 group-hover:gap-2 transition-all">
                  <span>Đăng nhập tài khoản</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </button>

          {/* Option 2: Guest Order */}
          <button
            onClick={() => onSelectGuestOrder('g_group')}
            className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-teal-200 hover:border-teal-500 bg-teal-50/50 hover:bg-teal-50/90 transition-all duration-200 group cursor-pointer shadow-xs hover:shadow-md relative overflow-hidden ring-2 ring-teal-500/20"
          >
            <div className="absolute top-3 right-3">
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-xs">
                <Sparkles className="w-2.5 h-2.5" />
                Mới: Không cần đăng nhập
              </span>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-teal-600/30 group-hover:scale-105 transition-transform">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm sm:text-base font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors">
                    Khách Hàng Lẻ
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                    Canteen G-Group
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  Vào thẳng thực đơn, đặt món mọi khung giờ, thanh toán Tiền mặt tại quầy hoặc Chuyển khoản VietQR nhanh chóng.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 group-hover:gap-2 transition-all">
                  <span>Vào đặt món ngay</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer features */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            Đại học Hùng Vương
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Store className="w-3.5 h-3.5 text-teal-600" />
            Canteen G-Group
          </span>
        </div>
      </div>
    </div>
  );
}
