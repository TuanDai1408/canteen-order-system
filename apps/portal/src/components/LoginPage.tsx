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
        setError('Tài khoản chưa được gắn profile. Liên hệ quản trị viên.');
        return;
      }
      onSuccess(profile);
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏢</div>
          <h1 className="text-2xl font-bold text-slate-800">Portal Quản lý Canteen</h1>
          <p className="text-slate-500 text-sm mt-1">Chỉ dành cho Ban Quản lý & Nhân viên</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-700 focus:outline-none"
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
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-700 focus:outline-none"
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
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white font-semibold rounded-xl"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập Portal'}
          </button>
        </form>
      </div>
    </div>
  );
}
