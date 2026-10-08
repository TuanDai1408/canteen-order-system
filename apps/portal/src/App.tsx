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
  getSelectedSiteCode,
  setSelectedSiteCode,
  mapOrder,
  type UserProfile,
  type MenuItem,
  type Order,
  type QRExceptionToken,
  type TimeGateStatus,
  type SiteCode,
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
  const userRef = useRef<UserProfile | null>(null);
  userRef.current = user;

  const currentSiteRef = useRef<SiteCode>(getSelectedSiteCode());

  const getEffectiveSite = useCallback((profile: UserProfile | null, targetSiteCode?: string): SiteCode => {
    if (!profile) return 'hung_vuong';
    if (profile.role === 'super_admin') {
      if (targetSiteCode === 'hung_vuong' || targetSiteCode === 'g_group') {
        return targetSiteCode;
      }
      return currentSiteRef.current || getSelectedSiteCode();
    }
    // Đối với admin và staff thông thường: BẮT BUỘC theo profile.siteId
    return profile.siteId === 'g_group' ? 'g_group' : 'hung_vuong';
  }, []);

  const refresh = useCallback(async (siteOrTables?: string | string[], tables?: string[]) => {
    if (isRefreshingRef.current) {
      pendingRefreshRef.current = true;
      return;
    }
    isRefreshingRef.current = true;
    try {
      let targetSite: string | undefined = undefined;
      let targetTables: string[] | undefined = undefined;

      if (typeof siteOrTables === 'string') {
        targetSite = siteOrTables;
        targetTables = tables;
      } else if (Array.isArray(siteOrTables)) {
        targetTables = siteOrTables;
      }

      const activeProfile = userRef.current;
      const effectiveSite = getEffectiveSite(activeProfile, targetSite);
      currentSiteRef.current = effectiveSite;

      // Đồng bộ vào localStorage nếu là super_admin chuyển site hoặc bảo vệ admin cố định site
      setSelectedSiteCode(effectiveSite);

      const shouldFetchAll = !targetTables || targetTables.length === 0;
      const needMenu = shouldFetchAll || (targetTables ? targetTables.includes('menu_items') || targetTables.includes('orders') || targetTables.includes('order_items') : false);
      const needOrders = shouldFetchAll || (targetTables ? targetTables.includes('orders') || targetTables.includes('order_items') : false);
      const needUsers = shouldFetchAll || (targetTables ? targetTables.includes('users') : false);
      const needTokens = shouldFetchAll || (targetTables ? targetTables.includes('qr_exception_tokens') : false);
      const needTimeGate = targetTables ? targetTables.includes('settings') || targetTables.includes('system_settings') : false;

      const promises: Promise<any>[] = [];
      const keys: string[] = [];

      if (needMenu) {
        promises.push(getAllMenuItems({ siteId: effectiveSite }));
        keys.push('menu');
      }
      if (needOrders) {
        promises.push(getOrders({ siteId: effectiveSite }));
        keys.push('orders');
      }
      if (needUsers) {
        promises.push(getUsers(effectiveSite));
        keys.push('users');
      }
      if (needTokens) {
        promises.push(getQRTokens(effectiveSite));
        keys.push('tokens');
      }
      if (needTimeGate) {
        promises.push(fetchTimeGateConfig());
        keys.push('timeGate');
      }

      const results = await Promise.allSettled(promises);
      if (!isMountedRef.current) return;

      results.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return;
        const key = keys[idx];
        if (key === 'menu' && Array.isArray(res.value) && res.value.length > 0) {
          setMenu(res.value);
        } else if (key === 'orders' && Array.isArray(res.value)) {
          setOrders(res.value);
        } else if (key === 'users' && Array.isArray(res.value)) {
          setUsers(res.value);
        } else if (key === 'tokens' && Array.isArray(res.value)) {
          setTokens(res.value);
        }
      });
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
  }, [getEffectiveSite]);

  // 1. Khởi tạo dữ liệu ban đầu
  useEffect(() => {
    isMountedRef.current = true;
    async function init() {
      try {
        const [profileRes, _] = await Promise.allSettled([
          getCurrentUserProfile(),
          fetchTimeGateConfig(),
        ]);
        if (!isMountedRef.current) return;
        setTimeStatus(getTimeGateStatus());
        const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
        setUser(profile);
        userRef.current = profile;

        if (profile) {
          const effectiveSite = getEffectiveSite(profile);
          currentSiteRef.current = effectiveSite;
          setSelectedSiteCode(effectiveSite);

          const [mRes, oRes, uRes, tRes] = await Promise.allSettled([
            getAllMenuItems({ siteId: effectiveSite }),
            getOrders({ siteId: effectiveSite }),
            getUsers(effectiveSite),
            getQRTokens(effectiveSite),
          ]);
          if (!isMountedRef.current) return;
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
        }
      } catch (err) {
        console.error('Portal init err:', err);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    }
    init();

    return () => {
      isMountedRef.current = false;
    };
  }, [getEffectiveSite]);

  // 2. Kênh Realtime Supabase: CHỈ kích hoạt sau khi đã có user đăng nhập, dọn dẹp khi logout/unmount
  useEffect(() => {
    if (!user) return;

    const unsub = subscribeRealtime((info) => {
      if (isMountedRef.current) {
        setTimeStatus(getTimeGateStatus());
        refresh(info?.tables);
      }
    });

    return () => {
      unsub();
    };
  }, [user?.id, refresh]);

  // Lắng nghe sự kiện cập nhật trạng thái in bill & trạng thái đơn hàng thời gian thực
  useEffect(() => {
    const handleOrderPrintUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { orderId?: string; id?: string; billType?: string; status?: string; paymentStatus?: string; [key: string]: any }
        | undefined;
      const targetId = detail?.orderId || detail?.id;
      if (!targetId) return;

      const fieldKey = Object.keys(detail).find((k) => k.startsWith('printed'));
      const statusKey = detail.status;
      const paymentStatusKey = detail.paymentStatus || (detail as any).payment_status;

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== targetId && o.orderCode !== targetId) return o;
          const patch: Partial<Order> = {};
          if (fieldKey) {
            patch[fieldKey as keyof Order] = detail[fieldKey] || undefined;
          }
          if (statusKey) {
            patch.status = statusKey as any;
          }
          if (paymentStatusKey) {
            patch.paymentStatus = paymentStatusKey as any;
          }
          return { ...o, ...patch };
        })
      );
    };

    const handleNewOrderEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const rawOrder = detail.order || detail;
      if (!rawOrder.id && !rawOrder.order_code && !rawOrder.orderCode) return;

      try {
        const mapped = mapOrder(rawOrder);
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === mapped.id || o.orderCode === mapped.orderCode);
          if (exists) {
            return prev.map((o) => (o.id === mapped.id || o.orderCode === mapped.orderCode ? { ...o, ...mapped } : o));
          }
          return [mapped, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });
      } catch (err) {
        console.warn('Realtime handleNewOrderEvent note:', err);
      }
    };

    window.addEventListener('canteen_order_updated', handleOrderPrintUpdated);
    window.addEventListener('canteen_payment_confirmed', handleOrderPrintUpdated);
    window.addEventListener('canteen_new_order_inserted', handleNewOrderEvent);
    window.addEventListener('canteen_order_created', handleNewOrderEvent);
    window.addEventListener('canteen_order_placed', handleNewOrderEvent);
    window.addEventListener('canteen_guest_order_pending', handleNewOrderEvent);

    return () => {
      window.removeEventListener('canteen_order_updated', handleOrderPrintUpdated);
      window.removeEventListener('canteen_payment_confirmed', handleOrderPrintUpdated);
      window.removeEventListener('canteen_new_order_inserted', handleNewOrderEvent);
      window.removeEventListener('canteen_order_created', handleNewOrderEvent);
      window.removeEventListener('canteen_order_placed', handleNewOrderEvent);
      window.removeEventListener('canteen_guest_order_pending', handleNewOrderEvent);
    };
  }, []);

  // 3. Đồng hồ local tính toán giờ (chu kỳ 30 giây, hoàn toàn thuần client, KHÔNG gọi API)
  useEffect(() => {
    const clock = setInterval(() => {
      if (isMountedRef.current) {
        setTimeStatus(getTimeGateStatus());
      }
    }, 30_000);
    return () => clearInterval(clock);
  }, []);

  // 4. Khi người dùng quay lại tab trình duyệt thì làm mới dữ liệu đúng 1 lần
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isMountedRef.current && typeof document !== 'undefined' && !document.hidden && user) {
        setTimeStatus(getTimeGateStatus());
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, refresh]);

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
          userRef.current = profile;
          await refresh();
        }}
      />
    );
  }

  if (!['super_admin', 'admin', 'data_entry', 'executive'].includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/50 p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">Không có quyền truy cập Portal</h1>
          <p className="text-slate-600 text-xs leading-relaxed">
            Portal chỉ dành cho Quản trị Cấp cao, Quản lý Căn tin, Nhân viên Bếp và Ban Giám hiệu.
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
