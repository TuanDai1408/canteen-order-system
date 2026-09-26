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
  const pendingRefreshOrderRef = useRef(false);
  const isRefreshingPortalRef = useRef(false);
  const pendingRefreshPortalRef = useRef(false);

  const refreshOrderData = useCallback(async (profile: UserProfile, tables?: string[]) => {
    if (isRefreshingOrderRef.current) {
      pendingRefreshOrderRef.current = true;
      return;
    }
    isRefreshingOrderRef.current = true;
    try {
      const shouldFetchAll = !tables || tables.length === 0;
      const needMenu = shouldFetchAll || tables.includes('menu_items') || tables.includes('orders') || tables.includes('order_items');
      const needOrders = shouldFetchAll || tables.includes('orders') || tables.includes('order_items');
      const needProfile = shouldFetchAll || tables.includes('users') || tables.includes('orders');
      const needTimeGate = tables?.includes('settings') || tables?.includes('system_settings');

      const promises: Promise<any>[] = [];
      const keys: string[] = [];

      if (needProfile) {
        promises.push(getCurrentUserProfile());
        keys.push('profile');
      }
      if (needMenu) {
        promises.push(getMenu());
        keys.push('menu');
      }
      if (needOrders) {
        promises.push(getOrders({ userId: profile.id, authUserId: profile.authUserId }));
        keys.push('orders');
      }
      if (needTimeGate) {
        promises.push(fetchTimeGateConfig());
        keys.push('timeGate');
      }

      const results = await Promise.allSettled(promises);
      results.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return;
        const key = keys[idx];
        if (key === 'profile' && res.value) {
          setUser(res.value);
          userRef.current = res.value;
        } else if (key === 'menu' && Array.isArray(res.value) && res.value.length > 0) {
          setMenu(res.value);
        } else if (key === 'orders' && Array.isArray(res.value)) {
          setOrders(res.value);
        }
      });
      setTimeStatus(getTimeGateStatus());
      setError(null);
    } catch (e: any) {
      console.warn('[refreshOrderData notice]:', e);
    } finally {
      isRefreshingOrderRef.current = false;
      if (pendingRefreshOrderRef.current) {
        pendingRefreshOrderRef.current = false;
        const targetProfile = userRef.current || profile;
        refreshOrderData(targetProfile);
      }
    }
  }, []);

  const refreshPortalData = useCallback(async (tables?: string[]) => {
    if (isRefreshingPortalRef.current) {
      pendingRefreshPortalRef.current = true;
      return;
    }
    isRefreshingPortalRef.current = true;
    try {
      const shouldFetchAll = !tables || tables.length === 0;
      const needMenu = shouldFetchAll || tables.includes('menu_items') || tables.includes('orders') || tables.includes('order_items');
      const needOrders = shouldFetchAll || tables.includes('orders') || tables.includes('order_items');
      const needUsers = shouldFetchAll || tables.includes('users');
      const needTokens = shouldFetchAll || tables.includes('qr_exception_tokens');
      const needTimeGate = tables?.includes('settings') || tables?.includes('system_settings');

      const promises: Promise<any>[] = [];
      const keys: string[] = [];

      if (needMenu) {
        promises.push(getAllMenuItems());
        keys.push('menu');
      }
      if (needOrders) {
        promises.push(getOrders());
        keys.push('orders');
      }
      if (needUsers) {
        promises.push(getUsers());
        keys.push('users');
      }
      if (needTokens) {
        promises.push(getQRTokens());
        keys.push('tokens');
      }
      if (needTimeGate) {
        promises.push(fetchTimeGateConfig());
        keys.push('timeGate');
      }

      const results = await Promise.allSettled(promises);
      results.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return;
        const key = keys[idx];
        if (key === 'menu' && Array.isArray(res.value) && res.value.length > 0) {
          setPortalMenu(res.value);
        } else if (key === 'orders' && Array.isArray(res.value)) {
          setAllOrders(res.value);
        } else if (key === 'users' && Array.isArray(res.value)) {
          setAllUsers(res.value);
        } else if (key === 'tokens' && Array.isArray(res.value)) {
          setTokens(res.value);
        }
      });
      setTimeStatus(getTimeGateStatus());
    } catch (e: any) {
      console.warn('[refreshPortalData notice]:', e);
    } finally {
      isRefreshingPortalRef.current = false;
      if (pendingRefreshPortalRef.current) {
        pendingRefreshPortalRef.current = false;
        refreshPortalData();
      }
    }
  }, []);

  // 1. Khởi tạo dữ liệu ban đầu
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const [profileRes, menuRes, _] = await Promise.allSettled([
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
        userRef.current = profile;

        if (profile) {
          if (['admin', 'data_entry', 'executive'].includes(profile.role)) {
            setCurrentView('portal');
            refreshPortalData();
          } else {
            setCurrentView('order');
            const [ordersRes] = await Promise.allSettled([
              getOrders({ userId: profile.id, authUserId: profile.authUserId }),
            ]);
            if (mounted && ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
              setOrders(ordersRes.value);
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

    return () => {
      mounted = false;
    };
  }, []);

  // 2. Kênh Realtime Supabase: CHỈ kích hoạt sau khi đã có user đăng nhập, dọn dẹp khi logout/unmount
  useEffect(() => {
    if (!user) return;

    const handleRealtimeSync = (info?: { tables?: string[]; payload?: any }) => {
      setTimeStatus(getTimeGateStatus());
      const currentUser = userRef.current || user;
      const tables = info?.tables;
      if (currentViewRef.current === 'portal') {
        refreshPortalData(tables);
      } else {
        refreshOrderData(currentUser, tables);
      }
    };

    const unsub = subscribeRealtime(handleRealtimeSync);

    return () => {
      unsub();
    };
  }, [user?.id, refreshOrderData, refreshPortalData]);

  // Cập nhật số dư ví lạc quan (optimistic) trên UI tức thì trước khi dữ liệu từ server về
  useEffect(() => {
    const handleWalletUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ walletBalance?: number }>;
      if (customEvent.detail && customEvent.detail.walletBalance !== undefined) {
        const newBalance = customEvent.detail.walletBalance;
        setUser((prev) => (prev ? { ...prev, walletBalance: newBalance } : prev));
      }
    };
    window.addEventListener('canteen_wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('canteen_wallet_updated', handleWalletUpdated);
  }, []);

  // 3. Đồng hồ local tính toán giờ (chu kỳ 30 giây, hoàn toàn thuần client, KHÔNG gọi API)
  useEffect(() => {
    const clock = setInterval(() => {
      setTimeStatus(getTimeGateStatus());
    }, 30_000);
    return () => clearInterval(clock);
  }, []);

  // 4. Khi người dùng quay lại tab trình duyệt thì làm mới dữ liệu một lần
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && userRef.current) {
        setTimeStatus(getTimeGateStatus());
        if (currentViewRef.current === 'portal') {
          refreshPortalData();
        } else {
          refreshOrderData(userRef.current);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
