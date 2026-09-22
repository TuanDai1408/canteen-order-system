import { useEffect, useState, useCallback } from 'react';
import {
  getCurrentUserProfile,
  getMenu,
  getAllMenuItems,
  getOrders,
  getUsers,
  getAuditLogs,
  getQRTokens,
  getTimeGateStatus,
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-700 border-t-transparent rounded-full animate-spin" />
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
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow border p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Không có quyền truy cập Portal</h1>
          <p className="text-slate-600 mb-6">
            Portal chỉ dành cho Admin / Nhân viên nhập liệu / Ban Giám hiệu.
            <br />
            Vai trò của bạn: <strong>{user.roleTitle || user.role}</strong>
          </p>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm"
          >
            Đăng xuất
          </button>
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
