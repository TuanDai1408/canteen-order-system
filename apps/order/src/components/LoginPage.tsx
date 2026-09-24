import { useState } from 'react';
import { login, signUp, getCurrentUserProfile, type UserProfile } from '@canteen/shared';
import { BrandLogo } from './BrandLogo';
import {
  UtensilsCrossed,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface Props {
  onSuccess: (user: UserProfile) => void;
}

export function LoginPage({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password, fullName.trim(), 'teacher');
        setSuccessMsg(
          'Đăng ký tài khoản thành công! Hồ sơ đã được đồng bộ lên Supabase. Tài khoản mới sẽ có hiệu lực sau khi Ban Quản Trị Canteen duyệt và cấp hạn mức ví. Hãy đăng nhập để theo dõi trạng thái.'
        );
        setMode('login');
        setLoading(false);
        return;
      }

      await login(email.trim(), password);
      const profile = await getCurrentUserProfile();
      if (!profile) {
        setError('Tài khoản chưa được kích hoạt hồ sơ trong hệ thống. Vui lòng liên hệ Quản trị.');
        return;
      }
      onSuccess(profile);
    } catch (err: any) {
      setError(err?.message || 'Thao tác không thành công. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8 relative overflow-hidden font-sans">
      {/* Decorative ambient gradients */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-teal-100/70 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-100/70 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-2.5 bg-white/95 rounded-2xl border border-slate-200/80 shadow-md mb-2">
            <BrandLogo height={72} />
          </div>
          <p className="text-slate-600 font-medium text-xs sm:text-sm mt-1 max-w-sm mx-auto">
            Hệ thống đặt suất ăn trực tuyến dành cho Cán bộ, Giảng viên & Nhân viên
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Kết nối Trực tiếp Supabase Cloud</span>
          </div>
        </div>

        {/* Card with clean white background */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
          {/* Mode switch */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Đăng ký mới</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Họ và tên cán bộ / giáo viên
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Cô Nguyễn Thị Mai"
                  className="w-full px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email công vụ giáo viên / cán bộ
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
                  placeholder="giaovien@canteen.edu.vn"
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Mật khẩu tài khoản
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
                  className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                <span className="text-base leading-none">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 sm:py-3.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2 transition duration-200 text-sm cursor-pointer min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Đang xử lý dữ liệu Supabase...</span>
                </>
              ) : mode === 'signup' ? (
                <>
                  <span>Tạo Tài Khoản Cán Bộ & Chờ Duyệt</span>
                  <UserPlus className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Đăng Nhập Đặt Món</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-slate-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Xác thực an toàn Supabase Auth</span>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © Cơm ngon Siba · ĂN SẠCH – SỐNG KHỎE
        </p>
      </div>
    </div>
  );
}
