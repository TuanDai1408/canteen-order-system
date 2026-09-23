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
import { OrderHome } from './components/OrderHome';
import { PortalDashboard } from './components/PortalDashboard';
import { PendingApprovalView } from './components/PendingApprovalView';
import { fetchTimeGateConfig } from '@canteen/shared';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<'order' | 'portal'>('order');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [timeStatus, setTimeStatus] = useState<TimeGateStatus>(() => getTimeGateStatus());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Portal-specific states
  const [portalMenu, setPortalMenu] = useState<MenuItem[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [tokens, setTokens] = useState<QRExceptionToken[]>([]);

  const refreshOrderData = useCallback(async (profile: UserProfile) => {
    try {
      const [menuData, ordersData, updatedProfile] = await Promise.all([
        getMenu(),
        getOrders({ userId: profile.id }),
        getCurrentUserProfile(),
        fetchTimeGateConfig(),
      ]);
      setMenu(menuData);
      setOrders(ordersData);
      if (updatedProfile) {
        setUser(updatedProfile);
      }
      setTimeStatus(getTimeGateStatus());
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Không thể tải dữ liệu');
    }
  }, []);

  const refreshPortalData = useCallback(async () => {
    try {
      const [m, o, u, l, t] = await Promise.all([
        getAllMenuItems(),
        getOrders(),
        getUsers(),
        getAuditLogs(50),
        getQRTokens(),
      ]);
      setPortalMenu(m);
      setAllOrders(o);
      setAllUsers(u);
      setLogs(l);
      setTokens(t);
      setTimeStatus(getTimeGateStatus());
    } catch (e: any) {
      console.error(e);
    }
  }, []);

  const refreshAll = useCallback(async (profile: UserProfile) => {
    await Promise.all([
      refreshOrderData(profile),
      refreshPortalData(),
    ]);
  }, [refreshOrderData, refreshPortalData]);

  useEffect(() => {
    async function init() {
      try {
        const profile = await getCurrentUserProfile();
        setUser(profile);
        if (profile) {
          if (['admin', 'data_entry', 'executive'].includes(profile.role)) {
            setCurrentView('portal');
          } else {
            setCurrentView('order');
          }
          await refreshAll(profile);
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
          refreshAll(profile);
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
  }, [refreshAll]);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setMenu([]);
    setOrders([]);
    setCurrentView('order');
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Đang tải hệ thống Canteen...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onSuccess={async (profile) => {
          setUser(profile);
          if (['admin', 'data_entry', 'executive'].includes(profile.role)) {
            setCurrentView('portal');
          } else {
            setCurrentView('order');
          }
          await refreshAll(profile);
        }}
      />
    );
  }

  const isManagementRole = Boolean(user && ['admin', 'data_entry', 'executive'].includes(user.role));

  if (currentView === 'portal' && isManagementRole) {
    return (
      <PortalDashboard
        currentUser={user}
        menu={portalMenu}
        orders={allOrders}
        users={allUsers}
        logs={logs}
        tokens={tokens}
        timeStatus={timeStatus}
        onRefresh={refreshPortalData}
        onLogout={handleLogout}
        onSwitchToOrder={() => setCurrentView('order')}
      />
    );
  }

  // Nếu tài khoản cán bộ chưa được Ban Quản Trị Canteen duyệt và cấp ví
  if (user.role === 'teacher' && user.isActive === false) {
    return (
      <PendingApprovalView
        user={user}
        onRefresh={() => refreshOrderData(user)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <OrderHome
      currentUser={user}
      menu={menu}
      orders={orders}
      timeStatus={timeStatus}
      error={error}
      onRefresh={() => refreshOrderData(user)}
      onLogout={handleLogout}
      onUserUpdate={setUser}
      onSwitchToPortal={
        isManagementRole
          ? () => {
              refreshPortalData();
              setCurrentView('portal');
            }
          : undefined
      }
    />
  );
}
