import { useState, useMemo } from 'react';
import {
  formatVnd,
  updateMenuItem,
  createMenuItem,
  seedMenuToSupabase,
  createQRToken,
  updateOrderStatus,
  updateUserWallet,
  createUserByAdmin,
  approveUserAndFundWallet,
  fileToBase64,
  getCustomTimeGateConfig,
  setCustomTimeGateConfig,
  getTomorrowStr,
  parseItemsFromNote,
  type UserProfile,
  type MenuItem,
  type Order,
  type QRExceptionToken,
  type TimeGateStatus,
  type OrderStatus,
  type UserRole,
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
  Printer,
  Menu as MenuIcon,
  ChevronRight,
  Sparkles,
  Pencil,
  Upload,
  Clock,
  UserPlus,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { ImageUploader } from './ImageUploader';

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
  const [qrQuantity, setQrQuantity] = useState<number>(1);
  const [isCreatingQR, setIsCreatingQR] = useState(false);
  const [isAddingDish, setIsAddingDish] = useState(false);
  const [isSavingDish, setIsSavingDish] = useState(false);
  const [isUpdatingWallet, setIsUpdatingWallet] = useState(false);

  // POS Thermal Receipt state
  const [printReceiptOrder, setPrintReceiptOrder] = useState<Order | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [batchPrintOrders, setBatchPrintOrders] = useState<Order[] | null>(null);

  // Admin Time Gate Settings
  const initialTimeCfg = getCustomTimeGateConfig();
  const [timeOpen, setTimeOpen] = useState(initialTimeCfg.openTime);
  const [timeClose, setTimeClose] = useState(initialTimeCfg.closeTime);
  const [isSavingTime, setIsSavingTime] = useState(false);

  // Edit Dish state
  const [editingDish, setEditingDish] = useState<MenuItem | null>(null);
  const [editDishForm, setEditDishForm] = useState<{
    id: string;
    name: string;
    category: 'Cơm trưa' | 'Bún / Phở' | 'Món Chay' | 'Đồ uống / Tráng miệng';
    description: string;
    price: number;
    preparedStock: number;
    currentStock: number;
    imageUrl: string;
    isActive: boolean;
  } | null>(null);

  // Add User state (Cán bộ & Ví suất ăn)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'pending' | 'active'>('all');
  const [approvingUser, setApprovingUser] = useState<UserProfile | null>(null);
  const [approvalWalletAmount, setApprovalWalletAmount] = useState<number>(1000000);
  const [approvalNote, setApprovalNote] = useState('Phê duyệt tài khoản & cấp hạn mức ví suất ăn ban đầu');
  const [isApproving, setIsApproving] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const [newUserForm, setNewUserForm] = useState<{
    name: string;
    email: string;
    password: string;
    role: UserRole;
    department: string;
    phoneNumber: string;
    defaultRoom: string;
    walletBalance: number;
    monthlyAllowance: number;
  }>({
    name: '',
    email: '',
    password: 'Canteen@123456',
    role: 'teacher',
    department: 'Tổ Chuyên Môn',
    phoneNumber: '',
    defaultRoom: '',
    walletBalance: 1000000,
    monthlyAllowance: 1000000,
  });

  // Overview metrics
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== 'cancelled'), [orders]);
  const totalRevenue = useMemo(() => activeOrders.reduce((s, o) => s + o.totalAmount, 0), [activeOrders]);
  const roomDeliveryCount = useMemo(() => activeOrders.filter((o) => o.deliveryMethod === 'room_delivery').length, [activeOrders]);
  const dineInCount = useMemo(() => activeOrders.filter((o) => o.deliveryMethod === 'dine_in').length, [activeOrders]);

  const dishSummary = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; totalAmount: number }>();
    for (const ord of activeOrders) {
      const items = (ord.items && ord.items.length > 0) ? ord.items : parseItemsFromNote((ord as any).note);
      if (items && items.length > 0) {
        for (const it of items) {
          const dishName = it.name || 'Suất ăn Căn tin';
          const curr = map.get(dishName) || { name: dishName, quantity: 0, totalAmount: 0 };
          curr.quantity += it.quantity;
          curr.totalAmount += (it.price || 0) * it.quantity;
          map.set(dishName, curr);
        }
      } else {
        const dishName = 'Suất ăn Căn tin';
        const curr = map.get(dishName) || { name: dishName, quantity: 0, totalAmount: 0 };
        curr.quantity += 1;
        curr.totalAmount += ord.totalAmount || 0;
        map.set(dishName, curr);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [activeOrders]);

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

  // Filtered Orders (Sorted newest first)
  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
        const matchDelivery = orderDeliveryFilter === 'all' || o.deliveryMethod === orderDeliveryFilter;
        const matchSearch =
          o.orderCode.toLowerCase().includes(orderSearch.toLowerCase()) ||
          o.userName.toLowerCase().includes(orderSearch.toLowerCase()) ||
          (o.roomNumber && o.roomNumber.toLowerCase().includes(orderSearch.toLowerCase()));
        return matchStatus && matchDelivery && matchSearch;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, orderStatusFilter, orderDeliveryFilter, orderSearch]);

  // Pending users count for approval
  const pendingUsersCount = useMemo(() => {
    return users.filter((u) => u.isActive === false).length;
  }, [users]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchStatus =
        userStatusFilter === 'all'
          ? true
          : userStatusFilter === 'pending'
          ? u.isActive === false
          : u.isActive !== false;
      const matchSearch =
        (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.department || '').toLowerCase().includes(userSearch.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [users, userSearch, userStatusFilter]);

  // Handle Approve User & Fund Initial Wallet
  const handleApproveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingUser) return;
    setIsApproving(true);
    try {
      await approveUserAndFundWallet(
        {
          userId: approvingUser.id,
          walletAmount: approvalWalletAmount,
          note: approvalNote,
        },
        currentUser
      );
      setMsg({
        type: 'ok',
        text: `Đã phê duyệt tài khoản "${approvingUser.name}" và cấp hạn mức ví ${formatVnd(approvalWalletAmount)} thành công!`,
      });
      setApprovingUser(null);
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || 'Lỗi khi phê duyệt tài khoản' });
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Order status update with loading indicator
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, status, currentUser);
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || 'Lỗi khi cập nhật trạng thái đơn hàng' });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Create QR
  const handleCreateQR = async () => {
    setIsCreatingQR(true);
    try {
      const token = await createQRToken(currentUser, qrNote, qrExpiryMins, qrQuantity);
      setMsg({
        type: 'ok',
        text: `Đã tạo mã QR: ${token.token} (Hiệu lực ${qrExpiryMins} phút, số lượng: ${qrQuantity} suất)`,
      });
      setIsCreateQROpen(false);
      onRefresh();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Lỗi khi tạo mã QR' });
    } finally {
      setIsCreatingQR(false);
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
    setIsAddingDish(true);
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
    } finally {
      setIsAddingDish(false);
    }
  };

  // Update wallet
  const handleUpdateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletModalUser) return;
    setIsUpdatingWallet(true);
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
    } finally {
      setIsUpdatingWallet(false);
    }
  };

  // Save Admin Time Gate Config
  const handleSaveTimeGate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTime(true);
    try {
      await setCustomTimeGateConfig(timeOpen, timeClose, currentUser);
      setMsg({
        type: 'ok',
        text: `Đã cập nhật khung giờ nhận đơn thường: ${timeOpen} – ${timeClose} thành công!`,
      });
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Lỗi khi cập nhật khung giờ nhận đơn' });
    } finally {
      setIsSavingTime(false);
    }
  };

  // Image Upload handler (From local computer)
  const handleImageFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'new' | 'edit'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'err', text: 'Kích thước file ảnh không được vượt quá 5MB.' });
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      if (target === 'new') {
        setNewDish((prev) => ({ ...prev, imageUrl: base64 }));
      } else if (target === 'edit' && editDishForm) {
        setEditDishForm((prev) => (prev ? { ...prev, imageUrl: base64 } : null));
      }
      setMsg({ type: 'ok', text: `Đã tải lên ảnh từ máy tính (${file.name})` });
    } catch (err: any) {
      setMsg({ type: 'err', text: 'Không thể đọc file ảnh từ máy tính.' });
    }
  };

  // Start Edit Dish
  const handleStartEditDish = (item: MenuItem) => {
    setEditingDish(item);
    setEditDishForm({
      id: item.id,
      name: item.name,
      category: item.category as any,
      description: item.description || '',
      price: item.price,
      preparedStock: item.preparedStock,
      currentStock: item.currentStock,
      imageUrl: item.imageUrl || '',
      isActive: item.isActive,
    });
  };

  // Save Edit Dish
  const handleSaveEditDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDish || !editDishForm) return;

    setIsSavingDish(true);
    try {
      await updateMenuItem(
        editingDish.id,
        {
          name: editDishForm.name.trim(),
          category: editDishForm.category,
          description: editDishForm.description.trim(),
          price: Number(editDishForm.price),
          preparedStock: Number(editDishForm.preparedStock),
          currentStock: Number(editDishForm.currentStock),
          imageUrl: editDishForm.imageUrl.trim(),
          isActive: editDishForm.isActive,
        },
        currentUser
      );
      setMsg({ type: 'ok', text: `Đã cập nhật món ăn "${editDishForm.name}" thành công!` });
      setEditingDish(null);
      setEditDishForm(null);
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Lỗi khi cập nhật món ăn' });
    } finally {
      setIsSavingDish(false);
    }
  };

  // Create New User (Synced with Supabase)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);
    try {
      const created = await createUserByAdmin(
        {
          name: newUserForm.name.trim(),
          email: newUserForm.email.trim(),
          password: newUserForm.password.trim(),
          role: newUserForm.role,
          department: newUserForm.department.trim(),
          phoneNumber: newUserForm.phoneNumber.trim(),
          defaultRoom: newUserForm.defaultRoom.trim(),
          walletBalance: Number(newUserForm.walletBalance),
          monthlyAllowance: Number(newUserForm.monthlyAllowance),
        },
        currentUser
      );
      setMsg({
        type: 'ok',
        text: `Đã tạo thành viên "${created.name}" (${created.email}) đồng bộ trên Supabase thành công!`,
      });
      setIsAddUserOpen(false);
      setNewUserForm({
        name: '',
        email: '',
        password: 'Canteen@123456',
        role: 'teacher',
        department: 'Tổ Chuyên Môn',
        phoneNumber: '',
        defaultRoom: '',
        walletBalance: 1000000,
        monthlyAllowance: 1000000,
      });
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Lỗi khi tạo thành viên mới' });
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Batch Print Selection Helpers
  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const toggleSelectAllOrders = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    }
  };

  const selectPendingKitchenOrders = () => {
    const kitchenOrders = orders.filter(
      (o) => o.status === 'confirmed' || o.status === 'preparing'
    );
    setSelectedOrderIds(kitchenOrders.map((o) => o.id));
    if (kitchenOrders.length > 0) {
      setBatchPrintOrders(kitchenOrders);
    } else {
      setMsg({ type: 'ok', text: 'Hiện không có đơn nào đang chờ nấu hoặc đang nấu.' });
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
    {
      id: 'users' as Tab,
      label: 'Cán bộ & Ví suất ăn',
      icon: Users,
      badge: pendingUsersCount > 0 ? pendingUsersCount : undefined,
      isPendingBadge: pendingUsersCount > 0,
    },
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
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Supabase Live
            </span>
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
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[11px] text-emerald-600 font-semibold">Supabase Live Cloud</p>
                </div>
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
                      className={`text-[11px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                        (item as any).isPendingBadge
                          ? 'bg-amber-500 text-white animate-pulse'
                          : isActive
                          ? 'bg-indigo-700 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {(item as any).isPendingBadge && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      )}
                      <span>
                        {item.badge}
                        {(item as any).isPendingBadge ? ' chờ duyệt' : ''}
                      </span>
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
                            <div className="flex items-center justify-center gap-1.5">
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
                              <button
                                onClick={() => setPrintReceiptOrder(o)}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-100 cursor-pointer"
                                title="In Bill POS nhiệt (K80 / K58)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Admin Time Gate Settings */}
              {currentUser.role === 'admin' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-extrabold text-slate-900 text-sm">
                          Cấu hình Khung giờ Nhận Đơn Thường (Admin)
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Quyền Admin
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Cán bộ và giáo viên chỉ có thể đặt suất ăn thường trong khung giờ này. Sau giờ đóng, hệ thống sẽ yêu cầu Mã QR ngoại lệ.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                          timeStatus.isOpen
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            timeStatus.isOpen ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        {timeStatus.isOpen ? 'Cổng Đang MỞ' : 'Cổng Đã ĐÓNG'}
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSaveTimeGate} className="mt-4 flex flex-col sm:flex-row items-end gap-3">
                    <div className="w-full sm:w-44">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Giờ mở nhận đơn:
                      </label>
                      <input
                        type="time"
                        required
                        value={timeOpen}
                        onChange={(e) => setTimeOpen(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="w-full sm:w-44">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Giờ chốt nhận đơn:
                      </label>
                      <input
                        type="time"
                        required
                        value={timeClose}
                        onChange={(e) => setTimeClose(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="flex-1 text-xs text-slate-500 pb-1">
                      <p>
                        Hiện tại: <strong className="text-slate-800 font-mono">{timeOpen} – {timeClose}</strong> hàng ngày.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingTime}
                      className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-xs min-h-[38px]"
                    >
                      {isSavingTime ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>{isSavingTime ? 'Đang lưu vào Supabase...' : 'Lưu cấu hình giờ'}</span>
                    </button>
                  </form>
                </div>
              )}
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
                    className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[40px] flex-shrink-0 cursor-pointer shadow-xs disabled:opacity-60"
                    title="Nạp toàn bộ thực đơn chuẩn vào Supabase database"
                  >
                    {seeding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>{seeding ? 'Đang nạp...' : 'Nạp vào Supabase'}</span>
                  </button>

                  <button
                    onClick={() => setIsAddDishOpen(true)}
                    className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[40px] flex-shrink-0 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm món</span>
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
                      ? 'Cơ sở dữ liệu Supabase chưa có món nào. Bạn có thể bấm "Thêm món" hoặc "Nạp vào Supabase" để tạo món ăn thật.'
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

                          <button
                            onClick={() => handleStartEditDish(item)}
                            className="absolute top-2 right-2 bg-white/95 hover:bg-white backdrop-blur-xs text-slate-700 hover:text-indigo-600 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-xs border border-slate-200/80 flex items-center gap-1 transition cursor-pointer"
                            title="Chỉnh sửa thông tin và ảnh món"
                          >
                            <Pencil className="w-3 h-3 text-indigo-600" />
                            <span>Sửa món</span>
                          </button>
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

              {/* Bảng tổng hợp các món ăn nhà bếp cần chuẩn bị */}
              {dishSummary.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                        <ChefHat className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          Tổng hợp Món ăn Nhà Bếp Cần Nấu (Ngày mai)
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Tự động tổng hợp từ tất cả các đơn đặt suất ăn của cán bộ, giáo viên
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Tổng: {dishSummary.reduce((s, d) => s + d.quantity, 0)} suất ăn
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                    {dishSummary.map((dish, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 hover:bg-indigo-50/40 rounded-xl border border-slate-200 transition flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-xs text-slate-900 truncate">{dish.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Doanh thu: {formatVnd(dish.totalAmount)}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-extrabold text-xs font-mono flex-shrink-0 shadow-2xs">
                          {dish.quantity} suất
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Batch Action Bar */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                  <span className="text-xs font-bold text-slate-800">
                    In Bill Hàng Loạt Máy POS (K80 / K58):
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Đã chọn <strong className="text-indigo-600">{selectedOrderIds.length}</strong> / {filteredOrders.length} đơn
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={selectPendingKitchenOrders}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5 min-h-[36px]"
                  >
                    <ChefHat className="w-4 h-4 text-indigo-600" />
                    <span>Chọn & In Đơn Bếp ({orders.filter(o => o.status === 'confirmed' || o.status === 'preparing').length})</span>
                  </button>

                  {selectedOrderIds.length > 0 && (
                    <>
                      <button
                        onClick={() => setSelectedOrderIds([])}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer min-h-[36px]"
                      >
                        Bỏ chọn
                      </button>

                      <button
                        onClick={() =>
                          setBatchPrintOrders(orders.filter((o) => selectedOrderIds.includes(o.id)))
                        }
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 min-h-[36px]"
                      >
                        <Printer className="w-4 h-4" />
                        <span>In {selectedOrderIds.length} Phiếu POS</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Orders Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[750px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredOrders.length > 0 &&
                              selectedOrderIds.length === filteredOrders.length
                            }
                            onChange={toggleSelectAllOrders}
                            className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            title="Chọn / Bỏ chọn tất cả"
                          />
                        </th>
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
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(o.id)}
                              onChange={() => toggleSelectOrder(o.id)}
                              className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
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
                              {(() => {
                                const orderItems = (o.items && o.items.length > 0) ? o.items : parseItemsFromNote((o as any).note);
                                if (orderItems && orderItems.length > 0) {
                                  return orderItems.map((it, i) => (
                                    <p key={i} className="text-slate-700 text-[11px] truncate font-medium">
                                      <strong className="text-indigo-600">{it.quantity}×</strong> {it.name || 'Suất ăn Căn tin'}
                                    </p>
                                  ));
                                }
                                return (
                                  <p className="text-slate-500 text-[11px] italic">
                                    1× Suất ăn Căn tin
                                  </p>
                                );
                              })()}
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
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setPrintReceiptOrder(o)}
                                className="px-2.5 py-1.5 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs transition cursor-pointer min-h-[36px] flex items-center gap-1 border border-slate-200"
                                title="In Bill POS nhiệt (K80 / K58)"
                              >
                                <Printer className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="font-mono text-[11px] font-bold">In Bill</span>
                              </button>
                              {o.status === 'confirmed' && (
                                <button
                                  disabled={updatingOrderId === o.id}
                                  onClick={() => handleUpdateOrderStatus(o.id, 'preparing')}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition cursor-pointer min-h-[36px] flex items-center gap-1.5"
                                >
                                  {updatingOrderId === o.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : null}
                                  <span>{updatingOrderId === o.id ? 'Đang chuyển...' : 'Nấu món'}</span>
                                </button>
                              )}
                              {o.status === 'preparing' && (
                                <button
                                  disabled={updatingOrderId === o.id}
                                  onClick={() => handleUpdateOrderStatus(o.id, 'completed')}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition cursor-pointer min-h-[36px] flex items-center gap-1.5"
                                >
                                  {updatingOrderId === o.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : null}
                                  <span>{updatingOrderId === o.id ? 'Đang cập nhật...' : 'Hoàn tất'}</span>
                                </button>
                              )}
                            </div>
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
              {/* Notification banner for pending accounts */}
              {pendingUsersCount > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">
                        Có {pendingUsersCount} tài khoản cán bộ mới đang chờ duyệt & cấp ví
                      </h4>
                      <p className="text-[11px] text-amber-700">
                        Theo quy định, tài khoản mới cần được Quản trị duyệt hồ sơ và cấp hạn mức ví ban đầu để có thể đặt món.
                      </p>
                    </div>
                  </div>

                  {userStatusFilter !== 'pending' && (
                    <button
                      onClick={() => setUserStatusFilter('pending')}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap min-h-[36px]"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Xem {pendingUsersCount} tài khoản chờ duyệt</span>
                    </button>
                  )}
                </div>
              )}

              {/* User filter tabs & search */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setUserStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[38px] ${
                      userStatusFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Tất cả cán bộ ({users.length})
                  </button>

                  <button
                    onClick={() => setUserStatusFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                      userStatusFilter === 'pending'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>Chờ duyệt & Nạp ví</span>
                    {pendingUsersCount > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                          userStatusFilter === 'pending'
                            ? 'bg-white text-amber-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {pendingUsersCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setUserStatusFilter('active')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[38px] ${
                      userStatusFilter === 'active'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Đang hoạt động ({users.length - pendingUsersCount})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Tìm theo tên giáo viên, phòng ban..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[38px]"
                    />
                  </div>

                  <button
                    onClick={() => setIsAddUserOpen(true)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs min-h-[38px] whitespace-nowrap"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Thêm cán bộ</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Họ và tên</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Phòng ban</th>
                        <th className="py-3 px-4">Trạng thái</th>
                        <th className="py-3 px-4 text-right">Số dư ví</th>
                        <th className="py-3 px-4 text-right">Hạn mức tháng</th>
                        <th className="py-3 px-4 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => {
                        const isPending = u.isActive === false;
                        return (
                          <tr key={u.id} className={`hover:bg-slate-50/70 ${isPending ? 'bg-amber-50/30' : ''}`}>
                            <td className="py-3 px-4">
                              <p className="font-bold text-slate-900">{u.name}</p>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                                {u.role === 'admin'
                                  ? 'Quản trị viên'
                                  : u.role === 'data_entry'
                                  ? 'Nhập liệu'
                                  : u.role === 'executive'
                                  ? 'Ban giám hiệu'
                                  : 'Giáo viên / Cán bộ'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{u.email}</td>
                            <td className="py-3 px-4 text-slate-700">
                              <div>{u.department || 'Nhà trường'}</div>
                              {u.defaultRoom && (
                                <span className="text-[10px] text-slate-400">Phòng: {u.defaultRoom}</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {isPending ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100/80 text-amber-800 border border-amber-300">
                                  <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                                  <span>Chờ duyệt & cấp ví</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Đang hoạt động</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-emerald-600">
                              {formatVnd(u.walletBalance)}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-500 font-semibold">
                              {formatVnd(u.monthlyAllowance)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isPending ? (
                                <button
                                  onClick={() => {
                                    setApprovingUser(u);
                                    setApprovalWalletAmount(1000000);
                                    setApprovalNote('Phê duyệt tài khoản & cấp hạn mức ví suất ăn ban đầu');
                                  }}
                                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-amber-500/20 transition min-h-[36px] mx-auto"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Duyệt & Nạp ví</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setWalletModalUser(u);
                                    setWalletAmountChange(50000);
                                  }}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-indigo-700 font-bold rounded-xl text-[11px] border border-slate-200 hover:border-indigo-200 transition cursor-pointer min-h-[36px]"
                                >
                                  Nạp / Chỉnh ví
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Không tìm thấy cán bộ nào trong danh sách.
                    </div>
                  )}
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
                        <th className="py-3 px-4 text-center">Số suất cấp</th>
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
                            <td className="py-3 px-4 text-center">
                              <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-[11px] border border-indigo-200">
                                {t.quantity || 1} suất
                              </span>
                            </td>
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

              {/* Image selection via Supabase Storage ImageUploader */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Hình ảnh món ăn (Tự động nén WebP & Lưu Supabase Storage)
                </label>
                <ImageUploader
                  itemId="temp"
                  currentImageUrl={newDish.imageUrl}
                  onUploaded={(url) => setNewDish({ ...newDish, imageUrl: url })}
                  onRemoved={() => setNewDish({ ...newDish, imageUrl: '' })}
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
                  disabled={isAddingDish}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm shadow-indigo-600/30 min-h-[44px] flex items-center justify-center gap-2 transition"
                >
                  {isAddingDish ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Thêm món ngay</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT DISH ================= */}
      {editingDish && editDishForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Chỉnh sửa món ăn</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingDish.name}</p>
              </div>
              <button
                onClick={() => {
                  setEditingDish(null);
                  setEditDishForm(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDish} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên món ăn</label>
                <input
                  type="text"
                  required
                  value={editDishForm.name}
                  onChange={(e) => setEditDishForm({ ...editDishForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phân loại</label>
                  <select
                    value={editDishForm.category}
                    onChange={(e: any) =>
                      setEditDishForm({ ...editDishForm, category: e.target.value })
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
                    value={editDishForm.price}
                    onChange={(e) =>
                      setEditDishForm({ ...editDishForm, price: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Suất dự kiến nấu</label>
                  <input
                    type="number"
                    required
                    value={editDishForm.preparedStock}
                    onChange={(e) =>
                      setEditDishForm({ ...editDishForm, preparedStock: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tồn kho hiện tại</label>
                  <input
                    type="number"
                    required
                    value={editDishForm.currentStock}
                    onChange={(e) =>
                      setEditDishForm({ ...editDishForm, currentStock: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả món ăn</label>
                <textarea
                  rows={2}
                  value={editDishForm.description}
                  onChange={(e) =>
                    setEditDishForm({ ...editDishForm, description: e.target.value })
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              {/* Image selection via Supabase Storage ImageUploader */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Hình ảnh món ăn (Tự động nén WebP & Lưu Supabase Storage)
                </label>
                <ImageUploader
                  itemId={editingDish.id}
                  currentImageUrl={editDishForm.imageUrl}
                  onUploaded={(url) => setEditDishForm({ ...editDishForm, imageUrl: url })}
                  onRemoved={() => setEditDishForm({ ...editDishForm, imageUrl: '' })}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-dish-active"
                  checked={editDishForm.isActive}
                  onChange={(e) =>
                    setEditDishForm({ ...editDishForm, isActive: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="edit-dish-active" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Kích hoạt hiển thị trên Thực đơn ngày mai
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingDish(null);
                    setEditDishForm(null);
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingDish}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm shadow-indigo-600/30 min-h-[44px] flex items-center justify-center gap-2 transition"
                >
                  {isSavingDish ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu thay đổi món ăn</span>
                  )}
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
                  disabled={isUpdatingWallet}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer min-h-[44px] flex items-center justify-center gap-2 transition"
                >
                  {isUpdatingWallet ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang cập nhật...</span>
                    </>
                  ) : (
                    <span>Cập nhật ví</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: APPROVE USER & FUND INITIAL WALLET ================= */}
      {approvingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Phê Duyệt Tài Khoản Cán Bộ</h3>
                  <p className="text-[11px] text-slate-500">Kích hoạt tài khoản & Cấp hạn mức ví</p>
                </div>
              </div>
              <button
                onClick={() => setApprovingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User overview info */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Cán bộ / Giáo viên:</span>
                <span className="font-bold text-slate-900">{approvingUser.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-700">{approvingUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bộ phận:</span>
                <span className="text-slate-700 font-semibold">{approvingUser.department || 'Nhà trường'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trạng thái hiện tại:</span>
                <span className="font-bold text-amber-600">⏳ Chờ duyệt kích hoạt</span>
              </div>
            </div>

            <form onSubmit={handleApproveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Hạn mức cấp ví ban đầu (VNĐ) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="50000"
                  min="0"
                  required
                  value={approvalWalletAmount}
                  onChange={(e) => setApprovalWalletAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-extrabold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />

                {/* Preset quick buttons */}
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[500000, 1000000, 1500000, 2000000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setApprovalWalletAmount(amt)}
                      className={`py-1.5 text-[10px] font-bold rounded-lg border transition cursor-pointer ${
                        approvalWalletAmount === amt
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {formatVnd(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi chú cấp ví & phê duyệt
                </label>
                <input
                  type="text"
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApprovingUser(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isApproving}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang kích hoạt...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Duyệt & Cấp ví</span>
                    </>
                  )}
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
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Số lượng suất được phép đặt
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQrQuantity((prev) => Math.max(1, prev - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={qrQuantity}
                    onChange={(e) => setQrQuantity(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    className="w-20 text-center py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setQrQuantity((prev) => Math.min(50, prev + 1))}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer"
                  >
                    +
                  </button>
                  <div className="flex gap-1 ml-auto">
                    {[1, 2, 5, 10].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQrQuantity(q)}
                        className={`px-2 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                          qrQuantity === q
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {q} suất
                      </button>
                    ))}
                  </div>
                </div>
              </div>

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
                  disabled={isCreatingQR}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer min-h-[44px] flex items-center justify-center gap-2 transition"
                >
                  {isCreatingQR ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang tạo...</span>
                    </>
                  ) : (
                    <span>Tạo Token ngay</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD USER (CÁN BỘ & ĐỒNG BỘ SUPABASE) ================= */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Thêm Cán Bộ / Thành Viên Mới
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đồng bộ tức thì lên Supabase Auth & Bảng users
                </p>
              </div>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và tên <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: TS. Nguyễn Văn A"
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email đăng nhập <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="nguyenvana@school.edu.vn"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mật khẩu ban đầu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-400">Mặc định: Canteen@123456</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vai trò hệ thống
                  </label>
                  <select
                    value={newUserForm.role}
                    onChange={(e: any) =>
                      setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  >
                    <option value="teacher">Giáo viên / Cán bộ nhân viên</option>
                    <option value="data_entry">Nhân viên Canteen / Nhập liệu</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                    <option value="executive">Ban Giám Hiệu / Lãnh đạo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phòng ban / Khoa</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Tổ Chuyên Môn, Khoa CNTT..."
                    value={newUserForm.department}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, department: e.target.value })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phòng làm việc mặc định
                  </label>
                  <input
                    type="text"
                    placeholder="VD: P.204 Nhà A"
                    value={newUserForm.defaultRoom}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, defaultRoom: e.target.value })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    placeholder="0912345678"
                    value={newUserForm.phoneNumber}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, phoneNumber: e.target.value })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số dư ví ban đầu (VNĐ)
                  </label>
                  <input
                    type="number"
                    step="50000"
                    required
                    value={newUserForm.walletBalance}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, walletBalance: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm shadow-indigo-600/30 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {isCreatingUser ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>{isCreatingUser ? 'Đang tạo trên Supabase...' : 'Tạo thành viên ngay'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POS Thermal Bill Modal (K80 / K58 Monospace) */}
      {printReceiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-sm">Hóa đơn nhiệt POS (K80 / K58)</span>
              </div>
              <button
                onClick={() => setPrintReceiptOrder(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 bg-slate-100/70 overflow-y-auto max-h-[75vh]">
              {/* Printable thermal ticket with JetBrains Mono / Courier New */}
              <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-sm font-mono text-xs leading-relaxed text-slate-900 pos-printable mx-auto max-w-[340px]">
                <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
                  <h4 className="font-bold text-sm uppercase tracking-wider">CANTEEN HỌC ĐƯỜNG</h4>
                  <p className="text-[11px] text-slate-600">PHIẾU CHẾ BIẾN & XUẤT SUẤT ĂN</p>
                  <p className="text-[10px] text-slate-500">
                    Khổ in nhiệt K80 / K58
                  </p>
                </div>

                <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mã đơn:</span>
                    <span className="font-bold text-slate-900 font-mono">{printReceiptOrder.orderCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Giờ in:</span>
                    <span className="font-medium text-slate-800">{new Date().toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cán bộ:</span>
                    <span className="font-bold text-slate-900">{printReceiptOrder.userName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Đơn vị:</span>
                    <span className="font-semibold text-slate-800">{printReceiptOrder.userDepartment || 'Giáo viên'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hình thức:</span>
                    <span className="font-bold text-indigo-700">
                      {printReceiptOrder.deliveryMethod === 'room_delivery'
                        ? `Giao phòng (${printReceiptOrder.roomNumber || 'Theo phòng'})`
                        : 'Ăn tại Căn tin'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Giờ ăn:</span>
                    <span className="font-bold text-slate-900">{printReceiptOrder.pickupTime}</span>
                  </div>
                </div>

                {/* Monospace aligned column table */}
                <div className="py-2.5 border-b border-dashed border-slate-400">
                  <div className="flex justify-between font-bold text-[11px] pb-1 border-b border-slate-200 mb-1.5">
                    <span className="w-1/2">Tên món</span>
                    <span className="w-10 text-center">SL</span>
                    <span className="w-16 text-right">Đơn giá</span>
                    <span className="w-18 text-right">T.Tiền</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {printReceiptOrder.items && printReceiptOrder.items.length > 0 ? (
                      printReceiptOrder.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-start">
                          <span className="w-1/2 pr-1 truncate font-medium">{it.name || 'Suất ăn Căn tin'}</span>
                          <span className="w-10 text-center font-bold">{it.quantity}</span>
                          <span className="w-16 text-right text-slate-600">{formatVnd(it.price).replace(' ₫', '')}</span>
                          <span className="w-18 text-right font-bold text-slate-900">
                            {formatVnd(it.price * it.quantity).replace(' ₫', '')}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between items-start">
                        <span className="w-1/2 pr-1 truncate font-medium">Suất ăn Căn tin</span>
                        <span className="w-10 text-center font-bold">1</span>
                        <span className="w-16 text-right text-slate-600">{formatVnd(printReceiptOrder.totalAmount).replace(' ₫', '')}</span>
                        <span className="w-18 text-right font-bold text-slate-900">
                          {formatVnd(printReceiptOrder.totalAmount).replace(' ₫', '')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                  <div className="flex justify-between font-bold text-xs pt-1">
                    <span>TỔNG CỘNG:</span>
                    <span className="text-indigo-600 font-extrabold text-sm font-mono">
                      {formatVnd(printReceiptOrder.totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Thanh toán:</span>
                    <span>Ví suất ăn Căn tin</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Trạng thái:</span>
                    <span className="font-semibold text-emerald-700">Đã trừ ví tự động</span>
                  </div>
                </div>

                <div className="text-center pt-3 text-[10px] text-slate-500 space-y-0.5">
                  <p className="font-medium">Chúc quý Thầy / Cô ngon miệng!</p>
                  <p className="text-[9px] text-slate-400 italic font-mono">JetBrains Mono · Courier New (Monospace)</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => setPrintReceiptOrder(null)}
                className="px-4 py-2.5 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded-xl hover:bg-slate-100 cursor-pointer min-h-[44px]"
              >
                Đóng
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer min-h-[44px]"
              >
                <Printer className="w-4 h-4" />
                <span>In Phiếu Nhiệt POS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: BATCH POS RECEIPTS PRINT ================= */}
      {batchPrintOrders && batchPrintOrders.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400" />
                <div>
                  <h4 className="font-bold text-sm">In Hàng Loạt Hóa Đơn POS ({batchPrintOrders.length} đơn)</h4>
                  <p className="text-[11px] text-slate-400">Khổ nhiệt K80 / K58 · Monospace</p>
                </div>
              </div>
              <button
                onClick={() => setBatchPrintOrders(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 bg-slate-100/80 overflow-y-auto max-h-[75vh] space-y-6">
              {batchPrintOrders.map((ord, idx) => (
                <div
                  key={ord.id}
                  className="bg-white p-5 rounded-xl border border-slate-300 shadow-sm font-mono text-xs leading-relaxed text-slate-900 pos-printable mx-auto max-w-[340px] relative break-after-page"
                >
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600 border border-slate-200">
                    #{idx + 1}/{batchPrintOrders.length}
                  </div>

                  <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
                    <h4 className="font-bold text-sm uppercase tracking-wider">CANTEEN HỌC ĐƯỜNG</h4>
                    <p className="text-[11px] text-slate-600">PHIẾU CHẾ BIẾN & XUẤT SUẤT ĂN</p>
                    <p className="text-[10px] text-slate-500">Khổ in nhiệt K80 / K58</p>
                  </div>

                  <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mã đơn:</span>
                      <span className="font-bold text-slate-900 font-mono">{ord.orderCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Giờ in:</span>
                      <span className="font-medium text-slate-800">{new Date().toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cán bộ:</span>
                      <span className="font-bold text-slate-900">{ord.userName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Phòng ban:</span>
                      <span>{ord.userDepartment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Hình thức:</span>
                      <span className="font-bold text-indigo-700">
                        {ord.deliveryMethod === 'room_delivery' ? `Giao phòng: ${ord.roomNumber || 'P.Phòng'}` : 'Dùng tại Căn tin'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Giờ nhận suất:</span>
                      <span className="font-bold text-amber-700">{ord.pickupTime}</span>
                    </div>
                  </div>

                  <div className="py-2.5 border-b border-dashed border-slate-400">
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1 border-b border-slate-200 pb-1">
                      <span>Món</span>
                      <span>SL × Giá</span>
                      <span className="text-right">T.Tiền</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      {ord.items.map((it, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="truncate max-w-[140px] font-medium text-slate-800">{it.name}</span>
                          <span className="text-slate-500 font-mono text-[10px]">
                            {it.quantity}×{formatVnd(it.price).replace('₫', '')}
                          </span>
                          <span className="font-bold text-slate-900 font-mono text-right">
                            {formatVnd(it.quantity * it.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {ord.note && (
                    <div className="py-2 border-b border-dashed border-slate-400 text-[10px] text-slate-700">
                      <strong>Ghi chú:</strong> {ord.note}
                    </div>
                  )}

                  <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                    <div className="flex justify-between font-bold text-xs pt-1">
                      <span>TỔNG CỘNG:</span>
                      <span className="text-indigo-600 font-extrabold text-sm font-mono">
                        {formatVnd(ord.totalAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Thanh toán:</span>
                      <span>Ví suất ăn Căn tin</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Trạng thái:</span>
                      <span className="font-semibold text-emerald-700">Đã trừ ví tự động</span>
                    </div>
                  </div>

                  <div className="text-center pt-3 text-[10px] text-slate-500 space-y-0.5">
                    <p className="font-medium">Chúc quý Thầy / Cô ngon miệng!</p>
                    <p className="text-[9px] text-slate-400 italic font-mono">JetBrains Mono · Courier New (Monospace)</p>
                  </div>

                  {idx < batchPrintOrders.length - 1 && (
                    <div className="mt-4 pt-2 text-center text-[10px] text-slate-400 border-t border-dashed border-slate-400">
                      ✂ - - - - - - - - [ VẾT CẮT GIẤY IN NHIỆT POS ] - - - - - - - - ✂
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => setBatchPrintOrders(null)}
                className="px-4 py-2.5 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded-xl hover:bg-slate-100 cursor-pointer min-h-[44px]"
              >
                Đóng
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer min-h-[44px]"
              >
                <Printer className="w-4 h-4" />
                <span>In Tất Cả {batchPrintOrders.length} Phiếu POS</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
