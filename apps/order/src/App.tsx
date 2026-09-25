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
  formatVnd,
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
import { ShieldAlert } from 'lucide-react';

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

    const handleOrderCreated = () => {
      if (!mounted) return;
      const currentUser = userRef.current;
      if (currentUser) {
        if (currentViewRef.current === 'portal') {
          refreshPortalData();
        } else {
          refreshOrderData(currentUser);
        }
      }
    };

    const handleUserStatusChanged = () => {
      if (!mounted) return;
      const currentUser = userRef.current;
      if (currentUser) {
        refreshOrderData(currentUser);
        if (currentViewRef.current === 'portal') {
          refreshPortalData();
        }
      }
    };

    window.addEventListener('canteen_wallet_updated', handleWalletUpdated);
    window.addEventListener('canteen_time_gate_updated', handleTimeGateUpdated);
    window.addEventListener('canteen_order_created', handleOrderCreated);
    window.addEventListener('canteen_order_placed', handleOrderCreated);
    window.addEventListener('canteen_user_status_changed', handleUserStatusChanged);
    window.addEventListener('storage', handleStorage);

    // Chu kỳ cập nhật trạng thái thời gian và tự động đồng bộ đơn hàng khi tab hiển thị
    const clock = setInterval(async () => {
      if (!mounted) return;
      setTimeStatus(getTimeGateStatus());
      if (typeof document !== 'undefined' && !document.hidden) {
        const currentUser = userRef.current;
        if (currentUser) {
          if (currentViewRef.current === 'portal') {
            refreshPortalData();
          } else {
            refreshOrderData(currentUser);
          }
        }
      }
    }, 2_500);

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
      window.removeEventListener('canteen_order_created', handleOrderCreated);
      window.removeEventListener('canteen_order_placed', handleOrderCreated);
      window.removeEventListener('canteen_user_status_changed', handleUserStatusChanged);
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

  // Kiểm tra tài khoản có bị vô hiệu hóa không
  const isUserDisabled = Boolean(
    user.isDisabled || (user.isActive === false && Number(user.walletBalance ?? 0) > 0)
  );

  if (isUserDisabled) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-rose-100/60 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-slate-100/60 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 text-center space-y-5 relative z-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 shadow-sm mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold mb-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Tài khoản đã bị vô hiệu hóa</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Tài Khoản Đang Bị Tạm Khóa
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1.5 max-w-sm mx-auto">
              Quản trị viên Căn tin đã tạm thời vô hiệu hóa tài khoản của bạn. Bạn không thể thực hiện đặt món trong thời gian này.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-xs">
            <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
              <span className="text-slate-500">Họ và tên cán bộ:</span>
              <span className="font-bold text-slate-800">{user.name}</span>
            </div>
            <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
              <span className="text-slate-500">Email đăng nhập:</span>
              <span className="font-mono text-slate-700">{user.email}</span>
            </div>
            <div className="flex justify-between pt-0.5">
              <span className="text-slate-500">Số dư ví bảo lưu:</span>
              <span className="font-bold text-emerald-600">{formatVnd(user.walletBalance)}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Khi Quản trị viên mở lại tài khoản trên Portal, trang này sẽ tự động khôi phục và bạn có thể đặt suất ăn bình thường.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => refreshOrderData(user)}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition min-h-[44px]"
            >
              Kiểm tra lại
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md shadow-rose-600/20 transition min-h-[44px]"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

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
