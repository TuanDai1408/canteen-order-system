import { useEffect, useState, useCallback } from 'react';
import {
  getCurrentUserProfile,
  getAllMenuItems,
  getOrders,
  getUsers,
  getAuditLogs,
  getQRTokens,
  getTimeGateStatus,
  fetchTimeGateConfig,
  subscribeRealtime,
  logout,
  type UserProfile,
  type MenuItem,
  type Order,
  type AuditLog,
  type QRExceptionToken,
  type TimeGateStatus,
} from '@canteen/shared';
import { LoginPage } from './components/LoginPage';
import { PortalDashboard } from './components/PortalDashboard';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [tokens, setTokens] = useState<QRExceptionToken[]>([]);
  const [timeStatus, setTimeStatus] = useState<TimeGateStatus>(() => getTimeGateStatus());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [m, o, u, l, t] = await Promise.all([
        getAllMenuItems(),
        getOrders(),
        getUsers(),
        getAuditLogs(50),
        getQRTokens(),
        fetchTimeGateConfig(),
      ]);
      setMenu(m);
      setOrders(o);
      setUsers(u);
      setLogs(l);
      setTokens(t);
      setTimeStatus(getTimeGateStatus());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const profile = await getCurrentUserProfile();
      setUser(profile);
      if (profile) await refresh();
      setLoading(false);
    }
    init();

    const unsub = subscribeRealtime(() => {
      getCurrentUserProfile().then((p) => {
        if (p) {
          setUser(p);
          refresh();
        }
      });
    });
    return unsub;
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
      logs={logs}
      tokens={tokens}
      timeStatus={timeStatus}
      onRefresh={refresh}
      onLogout={handleLogout}
    />
  );
}
