import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getCurrentUserProfile,
  getMenu,
  getAllMenuItems,
  getOrders,
  getUsers,
  getQRTokens,
  getTimeGateStatus,
  subscribeRealtime,
  logout,
  getCachedMenu,
  getCachedOrders,
  fetchTimeGateConfig,
  type UserProfile,
  type MenuItem,
  type Order,
  type QRExceptionToken,
  type TimeGateStatus,
} from '@canteen/shared';
import { LoginPage } from './components/LoginPage';
import { OrderHome } from './components/OrderHome';
import { PortalDashboard } from './components/PortalDashboard';
import { PendingApprovalView } from './components/PendingApprovalView';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<'order' | 'portal'>('order');
  const [menu, setMenu] = useState<MenuItem[]>(() => getCachedMenu());
  const [orders, setOrders] = useState<Order[]>(() => getCachedOrders());
  const [timeStatus, setTimeStatus] = useState<TimeGateStatus>(() => getTimeGateStatus());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Portal-specific states
  const [portalMenu, setPortalMenu] = useState<MenuItem[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [tokens, setTokens] = useState<QRExceptionToken[]>([]);

  const userRef = useRef<UserProfile | null>(user);
  userRef.current = user;
  const currentViewRef = useRef<'order' | 'portal'>(currentView);
  currentViewRef.current = currentView;

  const refreshOrderData = useCallback(async (profile: UserProfile) => {
    try {
      const [menuData, ordersData] = await Promise.all([
        getMenu(),
        getOrders({ userId: profile.id }),
      ]);
      setMenu(menuData);
      setOrders(ordersData);
      setTimeStatus(getTimeGateStatus());
      setError(null);
    } catch (e: any) {
      console.warn('[refreshOrderData notice]:', e);
    }
  }, []);

  const refreshPortalData = useCallback(async () => {
    try {
      const [m, o, u, t] = await Promise.all([
        getAllMenuItems(),
        getOrders(),
        getUsers(),
        getQRTokens(),
      ]);
      setPortalMenu(m);
      setAllOrders(o);
      setAllUsers(u);
      setTokens(t);
      setTimeStatus(getTimeGateStatus());
    } catch (e: any) {
      console.warn('[refreshPortalData notice]:', e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        // Tải đồng thời hồ sơ người dùng và thực đơn Supabase để tối ưu tốc độ phản hồi
        const [profile, menuData] = await Promise.all([
          getCurrentUserProfile(),
          getMenu(),
        ]);
        if (!mounted) return;
        setMenu(menuData);
        setUser(profile);
        if (profile) {
          if (['admin', 'data_entry', 'executive'].includes(profile.role)) {
            setCurrentView('portal');
            refreshPortalData();
          } else {
            setCurrentView('order');
            const [ordersData] = await Promise.all([
              getOrders({ userId: profile.id }),
              fetchTimeGateConfig(),
            ]);
            if (mounted) {
              setOrders(ordersData);
              setTimeStatus(getTimeGateStatus());
            }
          }
        }
      } catch (e: any) {
        console.error('Init error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();

    const unsub = subscribeRealtime(() => {
      if (!mounted) return;
      const currentUser = userRef.current;
      if (currentUser) {
        if (currentViewRef.current === 'portal') {
          refreshPortalData();
        } else {
          refreshOrderData(currentUser);
        }
      }
    });

    const clock = setInterval(() => {
      setTimeStatus(getTimeGateStatus());
    }, 30_000);

    return () => {
      mounted = false;
      unsub();
      clearInterval(clock);
    };
  }, [refreshOrderData, refreshPortalData]);

  const handleLogout = async () => {
    await logout();
    setUser(null);
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
            refreshPortalData();
          } else {
            setCurrentView('order');
            refreshOrderData(profile);
          }
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
