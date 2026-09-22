import { useState } from 'react';
import { login, getCurrentUserProfile, type UserProfile } from '@canteen/shared';

interface Props {
  onSuccess: (user: UserProfile) => void;
}

export function LoginPage({ onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        setError('Tài khoản chưa được gắn profile trong hệ thống. Liên hệ quản trị viên.');
        return;
      }
      onSuccess(profile);
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập thất bại. Kiểm tra email/mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-teal-700 to-teal-900 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🍱</div>
          <h1 className="text-2xl font-bold text-slate-800">Đặt suất ăn Canteen</h1>
          <p className="text-slate-500 text-sm mt-1">Dành cho Giáo viên & Cán bộ</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@truonghoc.edu.vn"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-semibold rounded-xl transition"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Quên mật khẩu? Liên hệ Ban Quản lý Căn tin
        </p>
      </div>
    </div>
  );
}
