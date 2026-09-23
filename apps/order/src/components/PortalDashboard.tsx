import { useState, useMemo } from 'react';
import {
  formatVnd,
  updateMenuItem,
  createMenuItem,
  seedMenuToSupabase,
  createQRToken,
  updateOrderStatus,
  updateUserWallet,
  getTomorrowStr,
  type UserProfile,
  type MenuItem,
  type Order,
  type QRExceptionToken,
  type TimeGateStatus,
  type OrderStatus,
} from '@canteen/shared';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Receipt,
  Users,
  QrCode,
  TrendingUp,
  Building2,
  Plus,
  Minus,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  MapPin,
  ChefHat,
  X,
  Menu as MenuIcon,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface Props {
  currentUser: UserProfile;
  menu: MenuItem[];
  orders: Order[];
  users: UserProfile[];
  tokens: QRExceptionToken[];
  timeStatus: TimeGateStatus;
  onRefresh: () => void;
  onLogout: () => void;
  onSwitchToOrder?: () => void;
}

type Tab = 'overview' | 'menu' | 'orders' | 'users' | 'qr';

export function PortalDashboard({
  currentUser,
  menu,
  orders,
  users,
  tokens,
  timeStatus,
  onRefresh,
  onLogout,
  onSwitchToOrder,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Search & Filter states
  const [menuSearch, setMenuSearch] = useState('');
  const [menuFilterCat, setMenuFilterCat] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [orderDeliveryFilter, setOrderDeliveryFilter] = useState<'all' | 'dine_in' | 'room_delivery'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Modals state
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);
  const [newDish, setNewDish] = useState<{
    name: string;
    category: 'Cơm trưa' | 'Bún / Phở' | 'Món Chay' | 'Đồ uống / Tráng miệng';
    description: string;
    price: number;
    preparedStock: number;
    imageUrl: string;
  }>({
    name: '',
    category: 'Cơm trưa',
    description: '',
    price: 35000,
    preparedStock: 50,
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop',
  });

  const [walletModalUser, setWalletModalUser] = useState<UserProfile | null>(null);
  const [walletAmountChange, setWalletAmountChange] = useState<number>(50000);
  const [walletNote, setWalletNote] = useState('Nạp tiền trợ cấp Canteen');

  const [isCreateQROpen, setIsCreateQROpen] = useState(false);
  const [qrExpiryMins, setQrExpiryMins] = useState(30);
  const [qrNote, setQrNote] = useState('Cấp ngoại lệ đặt suất bổ sung');

  // Overview metrics
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== 'cancelled'), [orders]);
  const totalRevenue = useMemo(() => activeOrders.reduce((s, o) => s + o.totalAmount, 0), [activeOrders]);
  const roomDeliveryCount = useMemo(() => activeOrders.filter((o) => o.deliveryMethod === 'room_delivery').length, [activeOrders]);
  const dineInCount = useMemo(() => activeOrders.filter((o) => o.deliveryMethod === 'dine_in').length, [activeOrders]);

  const ordersByStatus = useMemo(() => ({
    confirmed: orders.filter((o) => o.status === 'confirmed').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
  }), [orders]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Menu Category List
  const menuCategories = useMemo(() => {
    const set = new Set<string>();
    menu.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return ['all', ...Array.from(set)];
  }, [menu]);

  // Filtered Menu
  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const matchCat = menuFilterCat === 'all' || item.category === menuFilterCat;
      const matchSearch =
        item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
        item.description.toLowerCase().includes(menuSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [menu, menuFilterCat, menuSearch]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
      const matchDelivery = orderDeliveryFilter === 'all' || o.deliveryMethod === orderDeliveryFilter;
      const matchSearch =
        o.orderCode.toLowerCase().includes(orderSearch.toLowerCase()) ||
        o.userName.toLowerCase().includes(orderSearch.toLowerCase()) ||
        (o.roomNumber && o.roomNumber.toLowerCase().includes(orderSearch.toLowerCase()));
      return matchStatus && matchDelivery && matchSearch;
    });
  }, [orders, orderStatusFilter, orderDeliveryFilter, orderSearch]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      return (
        (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.department || '').toLowerCase().includes(userSearch.toLowerCase())
      );
    });
  }, [users, userSearch]);

  // Create QR
  const handleCreateQR = async () => {
    try {
      const token = await createQRToken(currentUser, qrNote, qrExpiryMins);
      setMsg({
        type: 'ok',
        text: `Đã tạo mã QR: ${token.token} (Hiệu lực ${qrExpiryMins} phút)`,
      });
      setIsCreateQROpen(false);
      onRefresh();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Lỗi khi tạo mã QR' });
    }
  };

  // Adjust stock
  const handleToggleStock = async (item: MenuItem, delta: number) => {
    try {
      await updateMenuItem(
        item.id,
        { currentStock: Math.max(0, item.currentStock + delta) },
        currentUser
      );
      onRefresh();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    }
  };

  // Add new dish
  const handleAddDish = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMenuItem(
        {
          name: newDish.name.trim(),
          category: newDish.category,
          description: newDish.description.trim(),
          price: Number(newDish.price),
          preparedStock: Number(newDish.preparedStock),
          currentStock: Number(newDish.preparedStock),
          imageUrl:
            newDish.imageUrl.trim() ||
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop',
          isActive: true,
          forDate: getTomorrowStr(),
        },
        currentUser
      );
      setMsg({ type: 'ok', text: `Đã thêm món "${newDish.name}" vào thực đơn ngày mai!` });
      setIsAddDishOpen(false);
      setNewDish({
        name: '',
        category: 'Cơm trưa',
        description: '',
        price: 35000,
        preparedStock: 50,
        imageUrl:
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop',
      });
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Lỗi khi thêm món mới' });
    }
  };

  // Update wallet
  const handleUpdateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletModalUser) return;
    try {
      const newBal = Math.max(0, walletModalUser.walletBalance + walletAmountChange);
      await updateUserWallet(walletModalUser.id, newBal, walletNote);
      setMsg({
        type: 'ok',
        text: `Đã cập nhật ví cho ${walletModalUser.name}: ${formatVnd(walletModalUser.walletBalance)} → ${formatVnd(newBal)}`,
      });
      setWalletModalUser(null);
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Lỗi khi cập nhật ví' });
    }
  };

  const navItems = [
    { id: 'overview' as Tab, label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'menu' as Tab, label: 'Thực đơn ngày mai', icon: UtensilsCrossed, badge: menu.length },
    {
      id: 'orders' as Tab,
      label: 'Đơn hàng & Bếp',
      icon: Receipt,
      badge: ordersByStatus.confirmed + ordersByStatus.preparing,
    },
    { id: 'users' as Tab, label: 'Cán bộ & Ví suất ăn', icon: Users, badge: users.length },
    { id: 'qr' as Tab, label: 'Mã QR Ngoại lệ', icon: QrCode },
  ];

  const handleSelectTab = (selectedTab: Tab) => {
    setTab(selectedTab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-800 font-sans selection:bg-indigo-600 selection:text-white">
      {/* Mobile Top Navbar */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Mở menu quản trị"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900 text-sm">Portal Quản Lý</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          {onSwitchToOrder && (
            <button
              onClick={onSwitchToOrder}
              className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 font-semibold rounded-lg text-xs flex items-center gap-1 border border-indigo-200 cursor-pointer min-h-[44px]"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">App Đặt món</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Desktop persistent + Mobile slide-over) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 transition-transform duration-300 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:shadow-none'
        }`}
      >
        <div>
          {/* Logo & Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm tracking-tight text-slate-900">Portal Quản Lý</h2>
                <p className="text-[11px] text-slate-500 font-medium">Căn tin Học đường</p>
              </div>
            </div>

            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 md:hidden rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Timegate indicator in sidebar */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Cổng đặt hôm nay:</span>
            <span
              className={`font-bold flex items-center gap-1.5 ${
                timeStatus.isOpen ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  timeStatus.isOpen ? 'bg-emerald-500' : 'bg-rose-500'
                } animate-pulse`}
              />
              {timeStatus.isOpen ? 'Mở (đến 16h)' : 'Đã đóng'}
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/25'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                        isActive ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center font-extrabold text-xs flex-shrink-0">
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{currentUser.roleTitle || 'Quản lý'}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {onSwitchToOrder && (
            <button
              onClick={onSwitchToOrder}
              className="w-full py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs min-h-[44px]"
            >
              <UtensilsCrossed className="w-4 h-4 text-teal-600" />
              <span>Chuyển sang App Đặt món</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {/* Desktop Header */}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 px-6 items-center justify-between z-10 flex-shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-extrabold text-slate-900 capitalize">
              {navItems.find((n) => n.id === tab)?.label}
            </h1>
            <span className="text-xs text-slate-400">· Ngày phục vụ: {getTomorrowStr()}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[40px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Làm mới dữ liệu</span>
            </button>

            {tab === 'menu' && (
              <button
                onClick={() => setIsAddDishOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm món</span>
              </button>
            )}

            {tab === 'qr' && (
              <button
                onClick={() => setIsCreateQROpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo mã QR mới</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile secondary tab strip */}
        <div className="md:hidden bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[38px] ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Workspace Container */}
        <main className="flex-1 p-3 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 max-w-7xl w-full mx-auto">
          {/* Notifications */}
          {msg && (
            <div
              className={`p-3.5 sm:p-4 rounded-2xl border text-xs sm:text-sm flex items-center justify-between gap-3 shadow-sm ${
                msg.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {msg.type === 'ok' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                )}
                <span className="font-medium">{msg.text}</span>
              </div>
              <button
                onClick={() => setMsg(null)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ================= TAB: OVERVIEW ================= */}
          {tab === 'overview' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5 sm:mb-2">
                    <span className="font-medium">Tổng đơn ngày mai</span>
                    <Receipt className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900">
                    {activeOrders.length}
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span>🍽️ Tại chỗ: {dineInCount}</span>
                    <span className="hidden xs:inline">•</span>
                    <span>🚚 Phòng: {roomDeliveryCount}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5 sm:mb-2">
                    <span className="font-medium">Doanh thu dự kiến</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-emerald-600">
                    {formatVnd(totalRevenue)}
                  </div>
                  <p className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 truncate">
                    Tự động qua ví suất ăn
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5 sm:mb-2">
                    <span className="font-medium">Cán bộ đặt món</span>
                    <Users className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900">
                    {new Set(activeOrders.map((o) => o.userId)).size} /{' '}
                    {users.filter((u) => u.role === 'teacher').length}
                  </div>
                  <p className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 truncate">
                    Tỷ lệ tham gia ăn trưa
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5 sm:mb-2">
                    <span className="font-medium">Món trong thực đơn</span>
                    <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900">
                    {menu.filter((m) => m.isActive).length}
                  </div>
                  <p className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 truncate">
                    Đã mở bán cho ngày mai
                  </p>
                </div>
              </div>

              {/* Kitchen Real-Time Status Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-indigo-600" />
                  <span>Tiến độ Điều phối Nhà Bếp</span>
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/60">
                    <p className="text-xs font-semibold text-amber-800">Chờ chuẩn bị</p>
                    <p className="text-lg sm:text-xl font-extrabold text-amber-700 mt-0.5">
                      {ordersByStatus.confirmed}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/60">
                    <p className="text-xs font-semibold text-indigo-800">Bếp đang nấu</p>
                    <p className="text-lg sm:text-xl font-extrabold text-indigo-700 mt-0.5">
                      {ordersByStatus.preparing}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/60">
                    <p className="text-xs font-semibold text-emerald-800">Đã hoàn thành</p>
                    <p className="text-lg sm:text-xl font-extrabold text-emerald-700 mt-0.5">
                      {ordersByStatus.completed}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-600">Đơn đã hủy</p>
                    <p className="text-lg sm:text-xl font-extrabold text-slate-700 mt-0.5">
                      {ordersByStatus.cancelled}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Orders Overview */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Đơn hàng mới nhận</h3>
                  <button
                    onClick={() => setTab('orders')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer flex items-center gap-1 min-h-[44px]"
                  >
                    <span>Xem tất cả</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Mã đơn</th>
                        <th className="py-2.5 px-3">Người đặt</th>
                        <th className="py-2.5 px-3">Địa điểm nhận</th>
                        <th className="py-2.5 px-3">Giờ ăn</th>
                        <th className="py-2.5 px-3 text-right">Tổng tiền</th>
                        <th className="py-2.5 px-3 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.slice(0, 6).map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{o.orderCode}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900">{o.userName}</span>
                            <span className="text-slate-400 block text-[11px]">{o.userDepartment}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            {o.deliveryMethod === 'room_delivery' ? (
                              <span className="inline-flex items-center gap-1 text-teal-700 font-bold">
                                <MapPin className="w-3 h-3" />
                                {o.roomNumber || 'Giao phòng'}
                              </span>
                            ) : (
                              <span className="text-slate-500">Tại Căn tin</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">{o.pickupTime}</td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-indigo-600">
                            {formatVnd(o.totalAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                o.status === 'confirmed'
                                  ? 'bg-amber-100 text-amber-800'
                                  : o.status === 'preparing'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : o.status === 'completed'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {o.status === 'confirmed'
                                ? 'Chờ nấu'
                                : o.status === 'preparing'
                                  ? 'Đang nấu'
                                  : o.status === 'completed'
                                    ? 'Xong'
                                    : 'Hủy'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: MENU ================= */}
          {tab === 'menu' && (
            <div className="space-y-4">
              {/* Search & Category toolbar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {menuCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setMenuFilterCat(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[38px] ${
                        menuFilterCat === cat
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {cat === 'all' ? 'Tất cả' : cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-60">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Tìm tên món ăn..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <button
                    onClick={async () => {
                      setSeeding(true);
                      try {
                        const res = await seedMenuToSupabase();
                        if (res.success) {
                          setMsg({
                            type: 'ok',
                            text: `Đã nạp ${res.count} món ăn vào bảng menu_items trên Supabase Cloud thành công!`,
                          });
                          onRefresh();
                        } else {
                          setMsg({
                            type: 'err',
                            text: `Lỗi đồng bộ Supabase: ${res.error || 'Vui lòng kiểm tra quyền RLS'}`,
                          });
                        }
                      } finally {
                        setSeeding(false);
                      }
                    }}
                    disabled={seeding}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 min-h-[40px] flex-shrink-0 cursor-pointer shadow-xs disabled:opacity-60"
                    title="Nạp thực đơn vào Supabase"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{seeding ? 'Đang nạp...' : 'Nạp Supabase'}</span>
                  </button>

                  <button
                    onClick={() => setIsAddDishOpen(true)}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 min-h-[40px] flex-shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>

              {/* Menu Grid */}
              {filteredMenu.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <UtensilsCrossed className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">
                    {menu.length === 0 ? 'Thực đơn trên Supabase đang trống' : 'Không tìm thấy món ăn phù hợp'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {menu.length === 0
                      ? 'Cơ sở dữ liệu Supabase chưa có món nào. Bạn có thể bấm "Thêm" hoặc "Nạp Supabase" để tạo món ăn thật.'
                      : 'Không có món ăn phù hợp với bộ lọc tìm kiếm hiện tại.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {filteredMenu.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="h-40 rounded-xl overflow-hidden bg-slate-100 relative mb-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <UtensilsCrossed className="w-8 h-8" />
                            </div>
                          )}
                          <span className="absolute top-2 left-2 bg-white/95 backdrop-blur-xs text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-md shadow-xs border border-slate-200/60">
                            {item.category}
                          </span>
                        </div>

                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-extrabold text-slate-900 text-sm leading-snug">{item.name}</h4>
                          <span className="text-indigo-600 font-extrabold text-sm whitespace-nowrap">
                            {formatVnd(item.price)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-[11px] text-slate-400 font-medium">Tồn kho:</p>
                          <p className="text-xs font-bold text-slate-900">
                            <span
                              className={
                                item.currentStock === 0
                                  ? 'text-rose-600'
                                  : item.currentStock < 10
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                              }
                            >
                              {item.currentStock}
                            </span>{' '}
                            / {item.preparedStock}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleStock(item, -5)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-mono font-bold cursor-pointer min-h-[36px]"
                            title="Trừ 5 suất"
                          >
                            -5
                          </button>
                          <button
                            onClick={() => handleToggleStock(item, -1)}
                            className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer min-h-[36px]"
                            title="Trừ 1 suất"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleStock(item, 1)}
                            className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer min-h-[36px]"
                            title="Thêm 1 suất"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleStock(item, 5)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-mono font-bold cursor-pointer min-h-[36px]"
                            title="Thêm 5 suất"
                          >
                            +5
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB: ORDERS ================= */}
          {tab === 'orders' && (
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-xs">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  <span className="text-xs text-slate-500 font-semibold flex items-center gap-1 mr-1">
                    <Filter className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Lọc:</span>
                  </span>
                  {(['all', 'confirmed', 'preparing', 'completed', 'cancelled'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setOrderStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[38px] ${
                        orderStatusFilter === st
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st === 'all'
                        ? 'Tất cả'
                        : st === 'confirmed'
                          ? 'Chờ nấu'
                          : st === 'preparing'
                            ? 'Đang nấu'
                            : st === 'completed'
                              ? 'Xong'
                              : 'Đã hủy'}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <select
                    value={orderDeliveryFilter}
                    onChange={(e: any) => setOrderDeliveryFilter(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                  >
                    <option value="all">Tất cả hình thức</option>
                    <option value="dine_in">Tại Căn tin</option>
                    <option value="room_delivery">Giao tận phòng</option>
                  </select>

                  <div className="relative min-w-[180px] flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Mã đơn, cán bộ, phòng..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                    />
                  </div>
                </div>
              </div>

              {/* Orders Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Mã đơn</th>
                        <th className="py-3 px-4">Cán bộ / Giáo viên</th>
                        <th className="py-3 px-4">Phòng nhận</th>
                        <th className="py-3 px-4">Giờ nhận</th>
                        <th className="py-3 px-4">Chi tiết món ăn</th>
                        <th className="py-3 px-4 text-right">Tổng tiền</th>
                        <th className="py-3 px-4 text-center">Trạng thái</th>
                        <th className="py-3 px-4 text-center">Thao tác bếp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {o.orderCode}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <p className="font-bold text-slate-900">{o.userName}</p>
                            <p className="text-[11px] text-slate-500">{o.userDepartment}</p>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {o.deliveryMethod === 'room_delivery' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 font-bold border border-teal-200">
                                <Building2 className="w-3.5 h-3.5" />
                                {o.roomNumber || 'Giao phòng'}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">Ăn tại chỗ</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                            {o.pickupTime}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <div className="space-y-0.5">
                              {o.items.map((it, i) => (
                                <p key={i} className="text-slate-700 text-[11px] truncate">
                                  <strong className="text-indigo-600">{it.quantity}×</strong> {it.name}
                                </p>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-indigo-600 whitespace-nowrap">
                            {formatVnd(o.totalAmount)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                o.status === 'confirmed'
                                  ? 'bg-amber-100 text-amber-800'
                                  : o.status === 'preparing'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : o.status === 'completed'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {o.status === 'confirmed'
                                ? 'Đã xác nhận'
                                : o.status === 'preparing'
                                  ? 'Bếp đang nấu'
                                  : o.status === 'completed'
                                    ? 'Đã hoàn thành'
                                    : 'Đã hủy'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {o.status === 'confirmed' && (
                              <button
                                onClick={async () => {
                                  await updateOrderStatus(o.id, 'preparing', currentUser);
                                  onRefresh();
                                }}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer min-h-[36px]"
                              >
                                Nấu món
                              </button>
                            )}
                            {o.status === 'preparing' && (
                              <button
                                onClick={async () => {
                                  await updateOrderStatus(o.id, 'completed', currentUser);
                                  onRefresh();
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition cursor-pointer min-h-[36px]"
                              >
                                Hoàn tất
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredOrders.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Không có đơn hàng nào khớp với bộ lọc.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: USERS ================= */}
          {tab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="relative min-w-[240px] flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Tìm theo tên giáo viên, phòng ban..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Họ và tên</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Phòng ban</th>
                        <th className="py-3 px-4">Phòng mặc định</th>
                        <th className="py-3 px-4 text-right">Số dư ví</th>
                        <th className="py-3 px-4 text-right">Hạn mức tháng</th>
                        <th className="py-3 px-4 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{u.email}</td>
                          <td className="py-3 px-4 text-slate-700">{u.department}</td>
                          <td className="py-3 px-4 text-slate-500">{u.defaultRoom || '—'}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-emerald-600">
                            {formatVnd(u.walletBalance)}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-500 font-semibold">
                            {formatVnd(u.monthlyAllowance)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => {
                                setWalletModalUser(u);
                                setWalletAmountChange(50000);
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-indigo-700 font-bold rounded-xl text-[11px] border border-slate-200 hover:border-indigo-200 transition cursor-pointer min-h-[36px]"
                            >
                              Nạp / Chỉnh ví
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: QR TOKENS ================= */}
          {tab === 'qr' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Mã QR Ngoại Lệ (Exception Tokens)</h3>
                  <p className="text-xs text-slate-500">
                    Dùng khi cổng đặt món thường đã đóng (sau 16:00). Cán bộ nhập mã này để được phép đặt suất ăn bổ sung.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateQROpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer min-h-[40px] shadow-sm flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tạo mã mới</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Mã Token</th>
                        <th className="py-3 px-4">Ghi chú</th>
                        <th className="py-3 px-4">Tạo bởi</th>
                        <th className="py-3 px-4">Thời gian hết hạn</th>
                        <th className="py-3 px-4 text-center">Trạng thái</th>
                        <th className="py-3 px-4 text-center">Sao chép</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tokens.map((t) => {
                        const isExpired = new Date(t.expiresAt) < new Date();
                        return (
                          <tr key={t.token} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono font-extrabold text-indigo-700">{t.token}</td>
                            <td className="py-3 px-4 text-slate-700">{t.note || '—'}</td>
                            <td className="py-3 px-4 text-slate-500">{t.createdByName}</td>
                            <td className="py-3 px-4 text-slate-700">
                              {new Date(t.expiresAt).toLocaleString('vi-VN')}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {t.isUsed ? (
                                <span className="text-slate-400 font-medium">Đã dùng</span>
                              ) : isExpired ? (
                                <span className="text-rose-600 font-medium">Hết hạn</span>
                              ) : (
                                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                                  Còn hiệu lực
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => copyText(t.token)}
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer min-h-[38px] min-w-[38px] inline-flex items-center justify-center"
                                title="Sao chép Token"
                              >
                                {copiedToken === t.token ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {tokens.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-xs">Chưa có mã QR ngoại lệ nào.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ================= MODAL: ADD DISH ================= */}
      {isAddDishOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Thêm món vào thực đơn ngày mai</h3>
              <button
                onClick={() => setIsAddDishOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDish} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên món ăn</label>
                <input
                  type="text"
                  required
                  value={newDish.name}
                  onChange={(e) => setNewDish({ ...newDish, name: e.target.value })}
                  placeholder="VD: Cơm sườn nướng mật ong"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phân loại</label>
                  <select
                    value={newDish.category}
                    onChange={(e) =>
                      setNewDish({
                        ...newDish,
                        category: e.target.value as
                          | 'Cơm trưa'
                          | 'Bún / Phở'
                          | 'Món Chay'
                          | 'Đồ uống / Tráng miệng',
                      })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  >
                    <option value="Cơm trưa">Cơm trưa</option>
                    <option value="Bún / Phở">Bún / Phở</option>
                    <option value="Món Chay">Món Chay</option>
                    <option value="Đồ uống / Tráng miệng">Đồ uống / Tráng miệng</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Đơn giá (VNĐ)</label>
                  <input
                    type="number"
                    step="1000"
                    required
                    value={newDish.price}
                    onChange={(e) => setNewDish({ ...newDish, price: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số lượng dự kiến nấu</label>
                <input
                  type="number"
                  required
                  value={newDish.preparedStock}
                  onChange={(e) => setNewDish({ ...newDish, preparedStock: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả món ăn</label>
                <textarea
                  rows={2}
                  value={newDish.description}
                  onChange={(e) => setNewDish({ ...newDish, description: e.target.value })}
                  placeholder="Thành phần dinh dưỡng, món xào hoặc canh đi kèm..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL Hình ảnh</label>
                <input
                  type="url"
                  value={newDish.imageUrl}
                  onChange={(e) => setNewDish({ ...newDish, imageUrl: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddDishOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm shadow-indigo-600/30 min-h-[44px]"
                >
                  Thêm món ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADJUST WALLET ================= */}
      {walletModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Điều chỉnh ví suất ăn</h3>
                <p className="text-xs text-slate-500 mt-0.5">{walletModalUser.name}</p>
              </div>
              <button
                onClick={() => setWalletModalUser(null)}
                className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateWallet} className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[11px] text-slate-500 font-medium">Số dư hiện tại:</p>
                <p className="text-lg font-extrabold text-emerald-600">{formatVnd(walletModalUser.walletBalance)}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Số tiền thay đổi (+ nạp thêm, - trừ bớt)
                </label>
                <input
                  type="number"
                  step="5000"
                  required
                  value={walletAmountChange}
                  onChange={(e) => setWalletAmountChange(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lý do điều chỉnh</label>
                <input
                  type="text"
                  required
                  value={walletNote}
                  onChange={(e) => setWalletNote(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Số dư sau chỉnh:</span>
                <span className="font-extrabold text-slate-900">
                  {formatVnd(Math.max(0, walletModalUser.walletBalance + walletAmountChange))}
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWalletModalUser(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Cập nhật ví
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE QR TOKEN ================= */}
      {isCreateQROpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Tạo Mã QR Ngoại Lệ</h3>
              <button
                onClick={() => setIsCreateQROpen(false)}
                className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Thời gian hiệu lực</label>
                <select
                  value={qrExpiryMins}
                  onChange={(e) => setQrExpiryMins(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                >
                  <option value={15}>15 phút</option>
                  <option value={30}>30 phút</option>
                  <option value={60}>60 phút (1 giờ)</option>
                  <option value={240}>4 giờ</option>
                  <option value={1440}>24 giờ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú mục đích</label>
                <input
                  type="text"
                  value={qrNote}
                  onChange={(e) => setQrNote(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateQROpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  onClick={handleCreateQR}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Tạo Token ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
