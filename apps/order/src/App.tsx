import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getCurrentUserProfile,
  getMenu,
  getAllMenuItems,
  getOrders,
  getUsers,
  getCachedUsers,
  getQRTokens,
  getCachedQRTokens,
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
  const [portalMenu, setPortalMenu] = useState<MenuItem[]>(() => getCachedMenu());
  const [allOrders, setAllOrders] = useState<Order[]>(() => getCachedOrders());
  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => getCachedUsers());
  const [tokens, setTokens] = useState<QRExceptionToken[]>(() => getCachedQRTokens());

  const userRef = useRef<UserProfile | null>(user);
  userRef.current = user;
  const currentViewRef = useRef<'order' | 'portal'>(currentView);
  currentViewRef.current = currentView;
  const isRefreshingOrderRef = useRef(false);
  const isRefreshingPortalRef = useRef(false);

  const refreshOrderData = useCallback(async (profile: UserProfile) => {
    if (isRefreshingOrderRef.current) return;
    isRefreshingOrderRef.current = true;
    try {
      const [profileRes, menuRes, ordersRes] = await Promise.allSettled([
        getCurrentUserProfile(),
        getMenu(),
        getOrders({ userId: profile.id, authUserId: profile.authUserId }),
        fetchTimeGateConfig(),
      ]);
      if (profileRes.status === 'fulfilled' && profileRes.value) {
        setUser(profileRes.value);
      }
      if (menuRes.status === 'fulfilled' && Array.isArray(menuRes.value) && menuRes.value.length > 0) {
        setMenu(menuRes.value);
      }
      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
        setOrders(ordersRes.value);
      }
      setTimeStatus(getTimeGateStatus());
      setError(null);
    } catch (e: any) {
      console.warn('[refreshOrderData notice]:', e);
    } finally {
      isRefreshingOrderRef.current = false;
    }
  }, []);

  const refreshPortalData = useCallback(async () => {
    if (isRefreshingPortalRef.current) return;
    isRefreshingPortalRef.current = true;
    try {
      const [profileRes, mRes, oRes, uRes, tRes] = await Promise.allSettled([
        getCurrentUserProfile(),
        getAllMenuItems(),
        getOrders(),
        getUsers(),
        getQRTokens(),
        fetchTimeGateConfig(),
      ]);
      if (profileRes.status === 'fulfilled' && profileRes.value) {
        setUser(profileRes.value);
      }
      if (mRes.status === 'fulfilled' && Array.isArray(mRes.value) && mRes.value.length > 0) {
        setPortalMenu(mRes.value);
      }
      if (oRes.status === 'fulfilled' && Array.isArray(oRes.value)) {
        setAllOrders(oRes.value);
      }
      if (uRes.status === 'fulfilled' && Array.isArray(uRes.value)) {
        setAllUsers(uRes.value);
      }
      if (tRes.status === 'fulfilled' && Array.isArray(tRes.value)) {
        setTokens(tRes.value);
      }
      setTimeStatus(getTimeGateStatus());
    } catch (e: any) {
      console.warn('[refreshPortalData notice]:', e);
    } finally {
      isRefreshingPortalRef.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const [profileRes, menuRes, timeCfgRes] = await Promise.allSettled([
          getCurrentUserProfile(),
          getMenu(),
          fetchTimeGateConfig(),
        ]);
        if (!mounted) return;
        if (menuRes.status === 'fulfilled' && Array.isArray(menuRes.value) && menuRes.value.length > 0) {
          setMenu(menuRes.value);
        }
        setTimeStatus(getTimeGateStatus());
        const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
        setUser(profile);

        if (profile) {
          if (['admin', 'data_entry', 'executive'].includes(profile.role)) {
            setCurrentView('portal');
            refreshPortalData();
          } else {
            setCurrentView('order');
            const [ordersRes] = await Promise.allSettled([
              getOrders({ userId: profile.id, authUserId: profile.authUserId }),
            ]);
            if (mounted) {
              if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
                setOrders(ordersRes.value);
              }
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

    const unsub = subscribeRealtime(async () => {
      if (!mounted) return;
      await fetchTimeGateConfig().catch(() => {});
      setTimeStatus(getTimeGateStatus());
      const currentUser = userRef.current;
      if (currentUser) {
        if (currentViewRef.current === 'portal') {
          refreshPortalData();
        } else {
          refreshOrderData(currentUser);
        }
      }
    });

    const handleWalletUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ walletBalance?: number }>;
      if (customEvent.detail && customEvent.detail.walletBalance !== undefined) {
        const newBalance = customEvent.detail.walletBalance;
        setUser((prev) => (prev ? { ...prev, walletBalance: newBalance } : prev));
      }
    };

    const handleTimeGateUpdated = () => {
      setTimeStatus(getTimeGateStatus());
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'canteen_time_gate_config' || !e.key) {
        setTimeStatus(getTimeGateStatus());
      }
    };

    window.addEventListener('canteen_wallet_updated', handleWalletUpdated);
    window.addEventListener('canteen_time_gate_updated', handleTimeGateUpdated);
    window.addEventListener('storage', handleStorage);

    // Chu kỳ cập nhật trạng thái thời gian mỗi 5s và đồng bộ config
    const clock = setInterval(async () => {
      if (!mounted) return;
      setTimeStatus(getTimeGateStatus());
    }, 5_000);

    const configSyncInterval = setInterval(async () => {
      if (!mounted) return;
      await fetchTimeGateConfig().catch(() => {});
      setTimeStatus(getTimeGateStatus());
    }, 10_000);

    return () => {
      mounted = false;
      unsub();
      window.removeEventListener('canteen_wallet_updated', handleWalletUpdated);
      window.removeEventListener('canteen_time_gate_updated', handleTimeGateUpdated);
      window.removeEventListener('storage', handleStorage);
      clearInterval(clock);
      clearInterval(configSyncInterval);
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
        onSwitchToOrder={() => {
          setCurrentView('order');
          if (user) refreshOrderData(user);
        }}
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
