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
  DEFAULT_SITES,
  getSites,
  getCachedSites,
  getSelectedSiteCode,
  setSelectedSiteCode,
  mapOrder,
  type UserProfile,
  type MenuItem,
  type Order,
  type QRExceptionToken,
  type TimeGateStatus,
  type Site,
  type SiteCode,
} from '@canteen/shared';
import { LoginPage } from './components/LoginPage';
import { OrderHome } from './components/OrderHome';
import { PortalDashboard } from './components/PortalDashboard';
import { PendingApprovalView } from './components/PendingApprovalView';
import { GuestEntryModal } from './components/GuestEntryModal';
import { ShieldAlert } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<'order' | 'portal'>('order');
  const [menu, setMenu] = useState<MenuItem[]>(() => getCachedMenu());
  const [orders, setOrders] = useState<Order[]>(() => getCachedOrders());
  const [timeStatus, setTimeStatus] = useState<TimeGateStatus>(() => getTimeGateStatus());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Multi-site & Guest states
  const [sitesList, setSitesList] = useState<Site[]>(() => getCachedSites());
  const [selectedSiteCode, setSelectedSiteCodeState] = useState<SiteCode>(() => getSelectedSiteCode());
  const [guestMode, setGuestMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('mode') === 'guest' || p.get('guest') === 'true' || p.get('site') === 'g_group') return true;
    }
    return false;
  });
  const [showEntryModal, setShowEntryModal] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('mode') || p.get('guest') || p.get('site')) return false;
    }
    return true;
  });

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
        const userSite = profile.siteId || selectedSiteCode || 'hung_vuong';
        promises.push(getMenu(userSite));
        keys.push('menu');
      }
      if (needOrders) {
        promises.push(getOrders({ userId: profile.id, authUserId: profile.authUserId, siteId: profile.siteId || 'hung_vuong' }));
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

  const refreshPortalData = useCallback(async (siteOrTables?: string | string[], tables?: string[]) => {
    if (isRefreshingPortalRef.current) {
      pendingRefreshPortalRef.current = true;
      return;
    }
    isRefreshingPortalRef.current = true;
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
      const isSuper = activeProfile?.role === 'super_admin';
      const effectiveSite: SiteCode = isSuper
        ? ((targetSite as SiteCode) || getSelectedSiteCode())
        : (activeProfile?.siteId === 'g_group' ? 'g_group' : 'hung_vuong');

      setSelectedSiteCodeState(effectiveSite);
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
        const [profileRes, menuRes, sitesRes, _] = await Promise.allSettled([
          getCurrentUserProfile(),
          getMenu(selectedSiteCode),
          getSites(),
          fetchTimeGateConfig(),
        ]);
        if (!mounted) return;
        if (sitesRes.status === 'fulfilled' && Array.isArray(sitesRes.value)) {
          setSitesList(sitesRes.value);
        }
        if (menuRes.status === 'fulfilled' && Array.isArray(menuRes.value) && menuRes.value.length > 0) {
          setMenu(menuRes.value);
        }
        setTimeStatus(getTimeGateStatus());
        const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
        setUser(profile);
        userRef.current = profile;

        if (profile) {
          setShowEntryModal(false);
          setGuestMode(false);
          if (['super_admin', 'admin', 'data_entry', 'executive'].includes(profile.role)) {
            setCurrentView('portal');
            const targetSite = profile.role === 'super_admin' ? getSelectedSiteCode() : (profile.siteId === 'g_group' ? 'g_group' : 'hung_vuong');
            setSelectedSiteCodeState(targetSite);
            setSelectedSiteCode(targetSite);
            refreshPortalData(targetSite);
          } else {
            setCurrentView('order');
            const [ordersRes] = await Promise.allSettled([
              getOrders({ userId: profile.id, authUserId: profile.authUserId }),
            ]);
            if (mounted && ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
              setOrders(ordersRes.value);
            }
          }
        } else if (guestMode) {
          setShowEntryModal(false);
          const guestOrders = getCachedOrders(undefined, selectedSiteCode);
          setOrders(guestOrders);
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

  // 2. Kênh Realtime Supabase: Kích hoạt cho cả user và khách lẻ để nhận cập nhật trạng thái đơn và cơ sở
  useEffect(() => {
    const handleRealtimeSync = (info?: { tables?: string[]; payload?: any }) => {
      setTimeStatus(getTimeGateStatus());
      const currentUser = userRef.current || user;
      const tables = info?.tables;
      if (currentViewRef.current === 'portal') {
        refreshPortalData(tables);
      } else if (currentUser) {
        refreshOrderData(currentUser, tables);
      } else if (guestMode) {
        getSites().then((s) => {
          if (Array.isArray(s) && s.length > 0) setSitesList(s);
        }).catch(() => {});
        getMenu(selectedSiteCode).then((m) => {
          if (Array.isArray(m) && m.length > 0) setMenu(m);
        }).catch(() => {});
        const o = getCachedOrders(undefined, selectedSiteCode);
        setOrders(o);
      }
    };

    const unsub = subscribeRealtime(handleRealtimeSync);

    return () => {
      unsub();
    };
  }, [user?.id, guestMode, selectedSiteCode, refreshOrderData, refreshPortalData]);

  // Lắng nghe cập nhật thông tin Cơ sở & Mã QR Ngân hàng tức thì toàn hệ thống
  useEffect(() => {
    const handleSiteUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const site = detail?.site;
      const siteCode = detail?.siteCode || site?.code;
      if (site && siteCode) {
        setSitesList((prev) => {
          const exists = prev.some((s) => s.code === siteCode);
          if (exists) return prev.map((s) => (s.code === siteCode ? site : s));
          return [...prev, site];
        });
      } else {
        getSites().then((s) => {
          if (Array.isArray(s) && s.length > 0) setSitesList(s);
        }).catch(() => {});
      }
    };

    window.addEventListener('canteen_site_updated', handleSiteUpdated);
    window.addEventListener('canteen_site_changed', handleSiteUpdated);
    return () => {
      window.removeEventListener('canteen_site_updated', handleSiteUpdated);
      window.removeEventListener('canteen_site_changed', handleSiteUpdated);
    };
  }, []);

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

      const updateList = (prev: Order[]) =>
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
          if (detail.paymentConfirmedAt || (detail as any).payment_confirmed_at) {
            patch.paymentConfirmedAt = detail.paymentConfirmedAt || (detail as any).payment_confirmed_at;
          }
          if (detail.confirmedBy || detail.paymentConfirmedBy || (detail as any).payment_confirmed_by) {
            patch.paymentConfirmedBy = detail.confirmedBy || detail.paymentConfirmedBy || (detail as any).payment_confirmed_by;
          }
          return { ...o, ...patch };
        });

      setOrders(updateList);
      setAllOrders(updateList);
    };

    const handleNewOrderEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const rawOrder = detail.order || detail;
      if (!rawOrder.id && !rawOrder.order_code && !rawOrder.orderCode) return;

      try {
        const mapped = mapOrder(rawOrder);
        setAllOrders((prev) => {
          const exists = prev.some((o) => o.id === mapped.id || o.orderCode === mapped.orderCode);
          if (exists) {
            return prev.map((o) => (o.id === mapped.id || o.orderCode === mapped.orderCode ? { ...o, ...mapped } : o));
          }
          return [mapped, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });

        // Cập nhật cho danh sách đơn cá nhân nếu trùng khớp user/guest
        const currentUser = userRef.current;
        if (currentUser && mapped.userId === currentUser.id) {
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === mapped.id || o.orderCode === mapped.orderCode);
            if (exists) {
              return prev.map((o) => (o.id === mapped.id || o.orderCode === mapped.orderCode ? { ...o, ...mapped } : o));
            }
            return [mapped, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        }
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

  const currentSite =
    sitesList.find((s) => s.code === selectedSiteCode) ||
    DEFAULT_SITES.find((s) => s.code === selectedSiteCode) ||
    DEFAULT_SITES[1];

  const guestUserProfile: UserProfile = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Khách hàng',
    role: 'teacher',
    roleTitle: 'Khách lẻ Căn tin',
    department: currentSite.name,
    phoneNumber: '',
    walletBalance: 0,
    monthlyAllowance: 0,
    isActive: true,
    siteId: currentSite.code,
  };

  const guestTimeStatus: TimeGateStatus = {
    isOpen: true,
    currentHour: new Date().getHours(),
    currentMinute: new Date().getMinutes(),
    message: 'Đang mở phục vụ khách lẻ (Không giới hạn khung giờ)',
    opensAt: '00:00',
    closesAt: '23:59',
  };

  if (!user) {
    if (showEntryModal) {
      return (
        <GuestEntryModal
          isOpen={showEntryModal}
          sites={sitesList}
          currentSiteCode={selectedSiteCode}
          onSelectStaffLogin={() => {
            setShowEntryModal(false);
            setGuestMode(false);
            setSelectedSiteCodeState('hung_vuong');
            setSelectedSiteCode('hung_vuong');
          }}
          onSelectGuestOrder={(siteCode) => {
            setShowEntryModal(false);
            setGuestMode(true);
            setSelectedSiteCodeState(siteCode);
            setSelectedSiteCode(siteCode);
            getMenu(siteCode).then((m) => {
              if (Array.isArray(m) && m.length > 0) setMenu(m);
            });
            const guestOrders = getCachedOrders(undefined, siteCode);
            setOrders(guestOrders);
          }}
        />
      );
    }

    if (guestMode) {
      return (
        <OrderHome
          currentUser={guestUserProfile}
          menu={menu}
          orders={orders}
          timeStatus={guestTimeStatus}
          error={error}
          onRefresh={async () => {
            const [m, s] = await Promise.all([
              getMenu(selectedSiteCode),
              getSites(),
            ]);
            if (Array.isArray(m) && m.length > 0) setMenu(m);
            if (Array.isArray(s) && s.length > 0) setSitesList(s);
            const o = getCachedOrders(undefined, selectedSiteCode);
            setOrders(o);
          }}
          onLogout={() => {
            setGuestMode(false);
            setShowEntryModal(true);
          }}
          isGuest={true}
          activeSite={currentSite}
          onExitGuest={() => {
            setGuestMode(false);
            setShowEntryModal(false);
          }}
          onSwitchSite={(code) => {
            setSelectedSiteCodeState(code);
            setSelectedSiteCode(code);
            getMenu(code).then((m) => {
              if (Array.isArray(m)) setMenu(m);
            });
            const o = getCachedOrders(undefined, code);
            setOrders(o);
          }}
        />
      );
    }

    return (
      <LoginPage
        onSuccess={async (profile) => {
          setUser(profile);
          userRef.current = profile;
          if (['super_admin', 'admin', 'data_entry', 'executive'].includes(profile.role)) {
            setCurrentView('portal');
            const targetSite = profile.role === 'super_admin' ? getSelectedSiteCode() : (profile.siteId === 'g_group' ? 'g_group' : 'hung_vuong');
            setSelectedSiteCodeState(targetSite);
            setSelectedSiteCode(targetSite);
            refreshPortalData(targetSite);
          } else {
            setCurrentView('order');
            refreshOrderData(profile);
          }
        }}
        onSwitchToGuest={() => {
          setGuestMode(true);
          setShowEntryModal(false);
          setSelectedSiteCodeState('g_group');
          setSelectedSiteCode('g_group');
          getMenu('g_group').then((m) => {
            if (Array.isArray(m) && m.length > 0) setMenu(m);
          });
          const guestOrders = getCachedOrders(undefined, 'g_group');
          setOrders(guestOrders);
        }}
      />
    );
  }

  const isManagementRole = Boolean(user && ['super_admin', 'admin', 'data_entry', 'executive'].includes(user.role));

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
