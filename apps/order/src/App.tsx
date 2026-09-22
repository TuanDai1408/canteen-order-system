import { useEffect, useState, useCallback } from 'react';
import {
  getCurrentUserProfile,
  getMenu,
  getOrders,
  getTimeGateStatus,
  subscribeRealtime,
  logout,
  type UserProfile,
  type MenuItem,
  type Order,
  type TimeGateStatus,
} from '@canteen/shared';
import { LoginPage } from './components/LoginPage';
import { OrderHome } from './components/OrderHome';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [timeStatus, setTimeStatus] = useState<TimeGateStatus>(() => getTimeGateStatus());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async (profile: UserProfile) => {
    try {
      const [menuData, ordersData] = await Promise.all([
        getMenu(),
        getOrders({ userId: profile.id }),
      ]);
      setMenu(menuData);
      setOrders(ordersData);
      setTimeStatus(getTimeGateStatus());
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Không thể tải dữ liệu');
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const profile = await getCurrentUserProfile();
        setUser(profile);
        if (profile) {
          await refreshData(profile);
        }
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    init();

    const unsub = subscribeRealtime(() => {
      getCurrentUserProfile().then((profile) => {
        if (profile) {
          setUser(profile);
          refreshData(profile);
        }
      });
    });

    const clock = setInterval(() => {
      setTimeStatus(getTimeGateStatus());
    }, 30_000);

    return () => {
      unsub();
      clearInterval(clock);
    };
  }, [refreshData]);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setMenu([]);
    setOrders([]);
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Đang tải hệ thống...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onSuccess={async (profile) => {
          setUser(profile);
          await refreshData(profile);
        }}
      />
    );
  }

  // Chỉ cho phép teacher (và admin để test)
  if (user.role !== 'teacher' && user.role !== 'admin') {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-800 mb-2">Không có quyền truy cập</h1>
          <p className="text-slate-600 mb-6">
            Ứng dụng đặt món chỉ dành cho Giáo viên / Cán bộ.
            <br />
            Vai trò hiện tại của bạn: <strong>{user.roleTitle || user.role}</strong>
          </p>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  return (
    <OrderHome
      currentUser={user}
      menu={menu}
      orders={orders}
      timeStatus={timeStatus}
      error={error}
      onRefresh={() => refreshData(user)}
      onLogout={handleLogout}
      onUserUpdate={setUser}
    />
  );
}
