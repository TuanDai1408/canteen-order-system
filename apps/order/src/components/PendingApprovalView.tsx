import { useState } from 'react';
import { type UserProfile, formatVnd } from '@canteen/shared';
import {
  Clock,
  RefreshCw,
  LogOut,
  ShieldAlert,
  Wallet,
  Sparkles,
  Building2,
  Mail,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  user: UserProfile;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}

export function PendingApprovalView({ user, onRefresh, onLogout }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Decorative ambient gradients */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-amber-100/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-100/60 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg relative z-10 space-y-4">
        {/* Status Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 p-6 sm:p-8 text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 shadow-sm mx-auto">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>Hồ sơ đang chờ phê duyệt</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Tài Khoản Đang Chờ Cấp Hạn Mức
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1.5 max-w-md mx-auto">
              Hồ sơ của bạn đã được ghi nhận thành công trên cơ sở dữ liệu Supabase. Ban Quản Trị Căn tin sẽ xem xét duyệt và nạp tiền vào ví suất ăn của bạn.
            </p>
          </div>

          {/* User detail info card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2.5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-slate-500 font-medium">Họ và tên cán bộ:</span>
              <span className="font-bold text-slate-900">{user.name}</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-slate-500 font-medium">Email đăng nhập:</span>
              <span className="font-mono text-slate-700">{user.email}</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-slate-500 font-medium">Phòng ban:</span>
              <span className="text-slate-700 font-semibold">{user.department || 'Bộ phận nhà trường'}</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-slate-500 font-medium">Trạng thái ví suất ăn:</span>
              <span className="font-bold text-amber-700">Chưa cấp ({formatVnd(user.walletBalance || 0)})</span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-500 font-medium">Trạng thái kích hoạt:</span>
              <span className="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-100/70 px-2 py-0.5 rounded-md text-[11px]">
                <Clock className="w-3 h-3 animate-spin" />
                Chờ duyệt từ Portal
              </span>
            </div>
          </div>

          {/* Live notification note */}
          <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs text-left flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Tự động kích hoạt thời gian thực:</strong> Khi Quản lý Căn tin bấm duyệt và nạp hạn mức tại Portal Quản lý, trang này sẽ tự động chuyển sang giao diện đặt món mà không cần tải lại trang.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-teal-600/20 transition min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Đang kiểm tra dữ liệu...' : 'Kiểm tra trạng thái duyệt'}</span>
            </button>

            <button
              onClick={onLogout}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition min-h-[44px]"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          © Ban Quản Lý Căn Tin & Dinh Dưỡng Học Đường
        </p>
      </div>
    </div>
  );
}
