import { useState } from 'react';
import { login, getCurrentUserProfile, type UserProfile } from '@canteen/shared';
import {
  Building2,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';

interface Props {
  onSuccess: (user: UserProfile) => void;
}

export function LoginPage({ onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
      const profile = await getCurrentUserProfile();
      if (!profile) {
        setError('Tài khoản chưa được kích hoạt profile quản trị. Vui lòng kiểm tra lại.');
        return;
      }
      if (profile.role === 'teacher') {
        setError('Tài khoản Giáo viên vui lòng đăng nhập tại Ứng dụng Đặt món, không thể truy cập Portal quản trị.');
        return;
      }
      onSuccess(profile);
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập thất bại. Kiểm tra email hoặc mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8 relative overflow-hidden font-sans">
      {/* Background soft ambient accents */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-100/70 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-100/70 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-600/20 mb-3 sm:mb-4 text-white">
            <Building2 className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            Portal Quản Lý Canteen
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
            Trung tâm vận hành suất ăn, điều phối nhà bếp & quản lý ví
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Kết nối Trực tiếp Supabase Cloud</span>
          </div>
        </div>

        {/* Card with clean white background */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
          <div className="mb-5 pb-4 border-b border-slate-100 text-center">
            <h2 className="text-base font-bold text-slate-800">Đăng Nhập Quản Trị Hệ Thống</h2>
            <p className="text-xs text-slate-400 mt-0.5">Dành cho Ban Quản Lý, Bếp Trưởng và Ban Giám Hiệu</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Quản trị / Nhân viên Bếp
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@truonghoc.edu.vn"
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Mật khẩu bảo mật
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer min-h-[44px]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                <span className="text-base leading-none">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 sm:py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition duration-200 text-sm cursor-pointer min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Đang xác thực bảo mật...</span>
                </>
              ) : (
                <>
                  <span>Vào Bảng Điều Khiển Quản Trị</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-slate-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Phân quyền RBAC bảo mật - Đăng ký mới chỉ mở tại Ứng dụng Cán bộ</span>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © Ban Quản Lý Canteen & Dinh Dưỡng Học Đường
        </p>
      </div>
    </div>
  );
}
