import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getCurrentUserProfile,
  getAllMenuItems,
  getOrders,
  getUsers,
  getCachedUsers,
  getQRTokens,
  getCachedQRTokens,
  getTimeGateStatus,
  fetchTimeGateConfig,
  subscribeRealtime,
  logout,
  getCachedMenu,
  getCachedOrders,
  type UserProfile,
  type MenuItem,
  type Order,
  type QRExceptionToken,
  type TimeGateStatus,
} from '@canteen/shared';
import { LoginPage } from './components/LoginPage';
import { PortalDashboard } from './components/PortalDashboard';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>(() => getCachedMenu());
  const [orders, setOrders] = useState<Order[]>(() => getCachedOrders());
  const [users, setUsers] = useState<UserProfile[]>(() => getCachedUsers());
  const [tokens, setTokens] = useState<QRExceptionToken[]>(() => getCachedQRTokens());
  const [timeStatus, setTimeStatus] = useState<TimeGateStatus>(() => getTimeGateStatus());
  const [loading, setLoading] = useState(true);

  const isMountedRef = useRef(true);
  const isRefreshingRef = useRef(false);
  const pendingRefreshRef = useRef(false);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      pendingRefreshRef.current = true;
      return;
    }
    isRefreshingRef.current = true;
    try {
      const [profileRes, mRes, oRes, uRes, tRes] = await Promise.allSettled([
        getCurrentUserProfile(),
        getAllMenuItems(),
        getOrders(),
        getUsers(),
        getQRTokens(),
        fetchTimeGateConfig(),
      ]);
      if (!isMountedRef.current) return;
      if (profileRes.status === 'fulfilled' && profileRes.value) {
        setUser(profileRes.value);
      }
      if (mRes.status === 'fulfilled' && Array.isArray(mRes.value) && mRes.value.length > 0) {
        setMenu(mRes.value);
      }
      if (oRes.status === 'fulfilled' && Array.isArray(oRes.value)) {
        setOrders(oRes.value);
      }
      if (uRes.status === 'fulfilled' && Array.isArray(uRes.value)) {
        setUsers(uRes.value);
      }
      if (tRes.status === 'fulfilled' && Array.isArray(tRes.value)) {
        setTokens(tRes.value);
      }
      setTimeStatus(getTimeGateStatus());
    } catch (e) {
      console.warn('Portal refresh note:', e);
    } finally {
      isRefreshingRef.current = false;
      if (pendingRefreshRef.current && isMountedRef.current) {
        pendingRefreshRef.current = false;
        refresh();
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    async function init() {
      try {
        const [profileRes, mRes, timeCfgRes] = await Promise.allSettled([
          getCurrentUserProfile(),
          getAllMenuItems(),
          fetchTimeGateConfig(),
        ]);
        if (!isMountedRef.current) return;
        if (mRes.status === 'fulfilled' && Array.isArray(mRes.value) && mRes.value.length > 0) {
          setMenu(mRes.value);
        }
        setTimeStatus(getTimeGateStatus());
        const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
        setUser(profile);

        if (profile) {
          const [oRes, uRes, tRes] = await Promise.allSettled([
            getOrders(),
            getUsers(),
            getQRTokens(),
          ]);
          if (!isMountedRef.current) return;
          if (oRes.status === 'fulfilled' && Array.isArray(oRes.value)) {
            setOrders(oRes.value);
          }
          if (uRes.status === 'fulfilled' && Array.isArray(uRes.value)) {
            setUsers(uRes.value);
          }
          if (tRes.status === 'fulfilled' && Array.isArray(tRes.value)) {
            setTokens(tRes.value);
          }
          setTimeStatus(getTimeGateStatus());
        }
      } catch (err) {
        console.error('Portal init err:', err);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    }
    init();

    const unsub = subscribeRealtime(() => {
      if (isMountedRef.current) {
        setTimeStatus(getTimeGateStatus());
        refresh();
      }
    });

    // Cập nhật trạng thái giờ (time-gate) local với chu kỳ thưa (30 giây), thuần logic client không gọi API
    const clock = setInterval(() => {
      if (isMountedRef.current) {
        setTimeStatus(getTimeGateStatus());
      }
    }, 30_000);

    // Khi người dùng quay lại tab trình duyệt thì làm mới dữ liệu một lần
    const handleVisibilityChange = () => {
      if (isMountedRef.current && typeof document !== 'undefined' && !document.hidden) {
        setTimeStatus(getTimeGateStatus());
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      unsub();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(clock);
    };
  }, [refresh]);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-600 font-semibold">Đang tải Portal Quản Lý Canteen...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onSuccess={async (profile) => {
          setUser(profile);
          await refresh();
        }}
      />
    );
  }

  if (!['admin', 'data_entry', 'executive'].includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/50 p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">Không có quyền truy cập Portal</h1>
          <p className="text-slate-600 text-xs leading-relaxed">
            Portal chỉ dành cho Quản lý Căn tin, Nhân viên Bếp và Ban Giám hiệu.
            <br />
            Tài khoản hiện tại: <strong className="text-slate-900 font-bold">{user.name}</strong> ({user.roleTitle || user.role})
          </p>
          <div className="pt-2">
            <button
              onClick={handleLogout}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer min-h-[44px]"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất & Đăng nhập tài khoản Quản trị</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PortalDashboard
      currentUser={user}
      menu={menu}
      orders={orders}
      users={users}
      tokens={tokens}
      timeStatus={timeStatus}
      onRefresh={refresh}
      onLogout={handleLogout}
    />
  );
}
