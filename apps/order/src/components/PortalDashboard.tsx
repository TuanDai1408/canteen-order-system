import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  getTomorrowStr,
  getTodayStr,
  parseItemsFromNote,
  getOrderDisplayItems,
  getCachedOrders,
  setCachedOrders,
  DEFAULT_MENU_ITEMS,
  type UserProfile,
  type MenuItem,
  type Order,
  type QRExceptionToken,
  type TimeGateStatus,
  type OrderStatus,
  type UserRole,
} from '@canteen/shared';
import { PosReceiptTicket, type PaperSize } from './PosReceiptTicket';
import { BrandLogo } from './BrandLogo';
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
  FileSpreadsheet,
  Calendar,
  StickyNote,
  Flame,
  Inbox,
  ArrowRight,
  RotateCcw,
  Phone,
} from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { BulkMenuUploadModal } from './BulkMenuUploadModal';
import { PaginationControls } from './PaginationControls';
import { exportOrdersToExcel, exportUsersToExcel } from '../utils/exportExcel';

/**
 * Bộ đếm thời gian thực từ lúc khách đặt món (Order Live Elapsed Timer)
 */
function OrderLiveElapsedTimer({
  createdAt,
  isCompleted = false,
}: {
  createdAt?: string;
  isCompleted?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isCompleted) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCompleted]);

  if (!createdAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
        <span>Vừa xong</span>
      </span>
    );
  }

  const orderTime = new Date(createdAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((now - orderTime) / 1000));
  const elapsedMin = Math.floor(elapsedSec / 60);
  const secRem = elapsedSec % 60;

  let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let timeText = '';

  if (elapsedMin < 1) {
    timeText = `${secRem}s trước`;
    badgeColor = 'bg-teal-50 text-teal-700 border-teal-200 font-semibold';
  } else if (elapsedMin < 60) {
    timeText = `${String(elapsedMin).padStart(2, '0')}:${String(secRem).padStart(2, '0')} trước`;
    if (elapsedMin >= 30) {
      badgeColor = 'bg-rose-50 text-rose-700 border-rose-300 font-bold animate-pulse';
    } else if (elapsedMin >= 15) {
      badgeColor = 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
    } else {
      badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold';
    }
  } else {
    const hours = Math.floor(elapsedMin / 60);
    const mins = elapsedMin % 60;
    timeText = `${hours}h ${mins}p trước`;
    badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border shadow-2xs whitespace-nowrap ${badgeColor}`}
      title={`Khách đặt lúc ${new Date(createdAt).toLocaleTimeString('vi-VN')} (${timeText})`}
    >
      <Clock className="w-3 h-3 shrink-0" />
      <span>{timeText}</span>
    </span>
  );
}

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
  const [orderDateFilter, setOrderDateFilter] = useState<string>('');
  const [orderSearch, setOrderSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [ordersViewMode, setOrdersViewMode] = useState<'all' | 'table' | 'kds'>('all');

  // Modals state
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [newDish, setNewDish] = useState<{
    name: string;
    category: string;
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
  const [receiptPaperSize, setReceiptPaperSize] = useState<PaperSize>('k80');
  const [batchTestCount, setBatchTestCount] = useState<number | null>(null);

  // Filtered batch orders (for testing preset count: 2, 10, or all)
  const displayedBatchOrders = useMemo(() => {
    if (!batchPrintOrders) return [];
    if (batchTestCount && batchTestCount > 0) {
      return batchPrintOrders.slice(0, batchTestCount);
    }
    return batchPrintOrders;
  }, [batchPrintOrders, batchTestCount]);

  // Edit Dish state
  const [editingDish, setEditingDish] = useState<MenuItem | null>(null);
  const [editDishForm, setEditDishForm] = useState<{
    id: string;
    name: string;
    category: string;
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

  // Tổng hợp món ăn cho Màn hình Nhà bếp (KDS) theo ngày lọc hiện tại
  const kitchenDishSummary = useMemo(() => {
    // Lọc theo ngày được chọn (hoặc tất cả các ngày nếu chọn 'all'), loại bỏ đơn hủy
    const targetOrders = (orderDateFilter && orderDateFilter !== 'all'
      ? orders.filter((o) => {
          const d = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
          return d === orderDateFilter && o.status !== 'cancelled';
        })
      : activeOrders);

    const map = new Map<string, {
      name: string;
      category: string;
      quantity: number;
      dineInQty: number;
      roomDeliveryQty: number;
      totalAmount: number;
      confirmedCount: number;
      preparingCount: number;
      completedCount: number;
      notes: string[];
    }>();

    for (const ord of targetOrders) {
      const items = getOrderDisplayItems(ord, menu);
      const isRoom = ord.deliveryMethod === 'room_delivery';
      const ordNote = (ord.note || ord.notes || '').trim();

      if (items && items.length > 0) {
        for (const it of items) {
          const dishName = it.name || 'Suất ăn Căn tin';
          const menuItem = menu.find((m) => m.name === dishName || m.id === it.menuItemId);
          const cat = menuItem?.category || 'Món chính';
          const curr = map.get(dishName) || {
            name: dishName,
            category: cat,
            quantity: 0,
            dineInQty: 0,
            roomDeliveryQty: 0,
            totalAmount: 0,
            confirmedCount: 0,
            preparingCount: 0,
            completedCount: 0,
            notes: [],
          };
          curr.quantity += it.quantity;
          curr.totalAmount += (it.price || 0) * it.quantity;
          if (isRoom) curr.roomDeliveryQty += it.quantity;
          else curr.dineInQty += it.quantity;

          if (ord.status === 'confirmed') curr.confirmedCount += it.quantity;
          else if (ord.status === 'preparing') curr.preparingCount += it.quantity;
          else if (ord.status === 'completed') curr.completedCount += it.quantity;

          if (ordNote && !curr.notes.includes(ordNote)) {
            curr.notes.push(ordNote);
          }
          map.set(dishName, curr);
        }
      } else {
        const dishName = 'Suất ăn Căn tin';
        const curr = map.get(dishName) || {
          name: dishName,
          category: 'Món chính',
          quantity: 0,
          dineInQty: 0,
          roomDeliveryQty: 0,
          totalAmount: 0,
          confirmedCount: 0,
          preparingCount: 0,
          completedCount: 0,
          notes: [],
        };
        curr.quantity += 1;
        curr.totalAmount += ord.totalAmount || 0;
        if (isRoom) curr.roomDeliveryQty += 1;
        else curr.dineInQty += 1;

        if (ord.status === 'confirmed') curr.confirmedCount += 1;
        else if (ord.status === 'preparing') curr.preparingCount += 1;
        else if (ord.status === 'completed') curr.completedCount += 1;

        if (ordNote && !curr.notes.includes(ordNote)) {
          curr.notes.push(ordNote);
        }
        map.set(dishName, curr);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [orders, activeOrders, orderDateFilter, menu]);

  const dishSummary = kitchenDishSummary;

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

  // Danh sách các ngày có đơn hàng trong hệ thống (sắp xếp ngày mới nhất lên đầu)
  const availableOrderDates = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      const d = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
      if (d) set.add(d);
    }
    return Array.from(set).sort().reverse();
  }, [orders]);

  // Mặc định chọn ngày mới nhất có đơn hàng khi mở portal
  useEffect(() => {
    if (!orderDateFilter && availableOrderDates.length > 0) {
      setOrderDateFilter(availableOrderDates[0]);
    }
  }, [availableOrderDates, orderDateFilter]);

  // Tự động tải lại dữ liệu tức thì (Realtime auto-refresh) khi khách đặt món hoặc thay đổi trạng thái
  useEffect(() => {
    // 1. Polling nhẹ 3 giây một lần khi đang mở ứng dụng quản lý
    const pollInterval = setInterval(() => {
      onRefresh();
    }, 3000);

    // 2. Lắng nghe sự kiện tức thì (Custom Event & Storage)
    const handleImmediateOrderSync = () => {
      onRefresh();
    };

    window.addEventListener('canteen_order_created', handleImmediateOrderSync);
    window.addEventListener('canteen_order_updated', handleImmediateOrderSync);
    window.addEventListener('canteen_order_cancelled', handleImmediateOrderSync);
    window.addEventListener('storage', handleImmediateOrderSync);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('canteen_order_created', handleImmediateOrderSync);
      window.removeEventListener('canteen_order_updated', handleImmediateOrderSync);
      window.removeEventListener('canteen_order_cancelled', handleImmediateOrderSync);
      window.removeEventListener('storage', handleImmediateOrderSync);
    };
  }, [onRefresh]);

  // Phân bổ đơn hàng cho Màn hình Nhà Bếp (KDS) theo 3 trạng thái
  const targetKdsOrders = useMemo(() => {
    return (orderDateFilter && orderDateFilter !== 'all'
      ? orders.filter((o) => {
          const d = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
          return d === orderDateFilter && o.status !== 'cancelled';
        })
      : orders.filter((o) => o.status !== 'cancelled')
    ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // Cũ nhất nấu trước (FIFO)
  }, [orders, orderDateFilter]);

  const kdsConfirmedOrders = useMemo(
    () => targetKdsOrders.filter((o) => o.status === 'confirmed'),
    [targetKdsOrders]
  );
  const kdsPreparingOrders = useMemo(
    () => targetKdsOrders.filter((o) => o.status === 'preparing'),
    [targetKdsOrders]
  );
  const kdsCompletedOrders = useMemo(
    () => targetKdsOrders.filter((o) => o.status === 'completed'),
    [targetKdsOrders]
  );

  // Filtered Orders (Sorted newest first)
  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
        const matchDelivery = orderDeliveryFilter === 'all' || o.deliveryMethod === orderDeliveryFilter;
        const orderDate = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
        const matchDate = !orderDateFilter || orderDateFilter === 'all' || orderDate === orderDateFilter;
        const matchSearch =
          o.orderCode.toLowerCase().includes(orderSearch.toLowerCase()) ||
          o.userName.toLowerCase().includes(orderSearch.toLowerCase()) ||
          (o.roomNumber && o.roomNumber.toLowerCase().includes(orderSearch.toLowerCase())) ||
          (o.note && o.note.toLowerCase().includes(orderSearch.toLowerCase())) ||
          (o.notes && o.notes.toLowerCase().includes(orderSearch.toLowerCase()));
        return matchStatus && matchDelivery && matchDate && matchSearch;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, orderStatusFilter, orderDeliveryFilter, orderDateFilter, orderSearch]);

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

  // Pagination states for all table tabs
  const [overviewOrderPage, setOverviewOrderPage] = useState(1);
  const [overviewOrderPageSize, setOverviewOrderPageSize] = useState(20);

  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);

  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);

  const [menuPage, setMenuPage] = useState(1);
  const [menuPageSize, setMenuPageSize] = useState(12);

  const [qrPage, setQrPage] = useState(1);
  const [qrPageSize, setQrPageSize] = useState(10);

  // Reset page numbers when search / filters change
  useEffect(() => {
    setOrderPage(1);
  }, [orderStatusFilter, orderDeliveryFilter, orderDateFilter, orderSearch]);

  useEffect(() => {
    setUserPage(1);
  }, [userStatusFilter, userSearch]);

  useEffect(() => {
    setMenuPage(1);
  }, [menuSearch, menuFilterCat]);

  // Paginated Slices
  const sortedOverviewOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [orders]);

  const paginatedOverviewOrders = useMemo(() => {
    const start = (overviewOrderPage - 1) * overviewOrderPageSize;
    return sortedOverviewOrders.slice(start, start + overviewOrderPageSize);
  }, [sortedOverviewOrders, overviewOrderPage, overviewOrderPageSize]);

  const paginatedOrders = useMemo(() => {
    const start = (orderPage - 1) * orderPageSize;
    return filteredOrders.slice(start, start + orderPageSize);
  }, [filteredOrders, orderPage, orderPageSize]);

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  const paginatedMenu = useMemo(() => {
    const start = (menuPage - 1) * menuPageSize;
    return filteredMenu.slice(start, start + menuPageSize);
  }, [filteredMenu, menuPage, menuPageSize]);

  const paginatedTokens = useMemo(() => {
    const start = (qrPage - 1) * qrPageSize;
    return tokens.slice(start, start + qrPageSize);
  }, [tokens, qrPage, qrPageSize]);

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
      setBatchTestCount(null);
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
              <BrandLogo size={40} />
              <div>
                <h2 className="font-extrabold text-sm tracking-tight text-slate-900">
                  <span className="text-orange-600">A.</span>
                  <span className="text-emerald-700">KITCHEN</span>
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[11px] text-slate-600 font-semibold truncate max-w-[130px]">Bếp ăn ĐH Hùng Vương</p>
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
              {timeStatus.isOpen ? `Mở (đến ${timeStatus.closesAt || '16:00'})` : 'Đã đóng'}
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
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                      Đơn hàng mới nhận
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Tổng {sortedOverviewOrders.length} đơn
                    </span>
                  </div>
                  <button
                    onClick={() => setTab('orders')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer flex items-center gap-1.5 transition"
                  >
                    <span>Xem toàn bộ & Màn hình Bếp</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="w-full">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-[16%]">Đơn hàng & Thời gian</th>
                        <th className="py-2.5 px-3 w-[22%]">Cán bộ / Khách hàng</th>
                        <th className="py-2.5 px-2.5 w-[18%]">Nơi nhận & Giờ ăn</th>
                        <th className="py-2.5 px-3 w-[23%]">Món ăn & Ghi chú</th>
                        <th className="py-2.5 px-2.5 w-[10%] text-right">Tổng tiền</th>
                        <th className="py-2.5 px-2.5 w-[11%] text-center">Trạng thái & Xử lý</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedOverviewOrders.map((o) => {
                        const orderItems = getOrderDisplayItems(o, menu);
                        return (
                          <tr key={o.id} className="hover:bg-slate-50/70 transition">
                            {/* Mã đơn & Thời gian đặt kèm Live Timer */}
                            <td className="py-3 px-3 align-top space-y-1">
                              <p className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                                {o.orderCode}
                              </p>
                              <div>
                                <OrderLiveElapsedTimer
                                  createdAt={o.createdAt}
                                  isCompleted={o.status === 'completed' || o.status === 'cancelled'}
                                />
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {o.createdAt
                                  ? `${new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${new Date(o.createdAt).toLocaleDateString('vi-VN')}`
                                  : '11:30'}
                              </p>
                            </td>

                            {/* Cán bộ & Liên hệ */}
                            <td className="py-3 px-3 align-top space-y-0.5">
                              <p className="font-bold text-slate-900 leading-snug">{o.userName}</p>
                              <p className="text-[11px] text-slate-500 leading-tight">{o.userDepartment}</p>
                              {o.userPhone && (
                                <p className="text-[10px] text-slate-600 flex items-center gap-1 font-mono pt-0.5">
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{o.userPhone}</span>
                                </p>
                              )}
                            </td>

                            {/* Nơi nhận & Giờ ăn */}
                            <td className="py-3 px-2.5 align-top space-y-1">
                              <div>
                                {o.deliveryMethod === 'room_delivery' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[10px] border border-teal-200">
                                    <Building2 className="w-3 h-3 text-teal-600 shrink-0" />
                                    <span>Giao {o.roomNumber || 'phòng'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px] border border-slate-200">
                                    🍽️ Tại Căn tin
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col text-[11px] space-y-0.5">
                                <span className="font-bold text-slate-700">
                                  ⏰ {o.pickupTime || '11:30'}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  📅 {o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : 'Ngày mai')}
                                </span>
                              </div>
                            </td>

                            {/* Chi tiết món & Ghi chú */}
                            <td className="py-3 px-3 align-top space-y-1">
                              <div className="space-y-0.5">
                                {orderItems && orderItems.length > 0 ? (
                                  orderItems.map((it, idx) => (
                                    <p key={idx} className="text-slate-800 text-[11px] font-medium leading-tight">
                                      <strong className="text-indigo-600 font-bold">{it.quantity}×</strong> {it.name}
                                    </p>
                                  ))
                                ) : (
                                  <p className="text-slate-500 text-[11px] italic">
                                    1× Suất ăn Căn tin
                                  </p>
                                )}
                              </div>
                              {(o.note || o.notes) && (
                                <div className="mt-1 p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-snug flex items-start gap-1 shadow-2xs">
                                  <StickyNote className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                  <span className="break-words font-medium">{o.note || o.notes}</span>
                                </div>
                              )}
                              {o.isExceptionOrder && (
                                <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  ⚡ Đơn QR Ngoại lệ
                                </span>
                              )}
                            </td>

                            {/* Tổng tiền */}
                            <td className="py-3 px-2.5 text-right align-top font-extrabold text-indigo-600 text-xs whitespace-nowrap">
                              {formatVnd(o.totalAmount)}
                            </td>

                            {/* Trạng thái & Thao tác */}
                            <td className="py-3 px-2.5 text-center align-top space-y-1.5">
                              <div>
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    o.status === 'confirmed'
                                      ? 'bg-amber-100 text-amber-800'
                                      : o.status === 'preparing'
                                        ? 'bg-orange-100 text-orange-800'
                                        : o.status === 'completed'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {o.status === 'confirmed'
                                    ? '⏳ Chờ nấu'
                                    : o.status === 'preparing'
                                      ? '🔥 Đang nấu'
                                      : o.status === 'completed'
                                        ? '✅ Xong'
                                        : 'Đã hủy'}
                                </span>
                              </div>
                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                <button
                                  onClick={() => setPrintReceiptOrder(o)}
                                  className="p-1.5 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs transition cursor-pointer border border-slate-200"
                                  title="In Bill POS"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                {o.status === 'confirmed' && (
                                  <button
                                    disabled={updatingOrderId === o.id}
                                    onClick={() => handleUpdateOrderStatus(o.id, 'preparing')}
                                    className="px-2 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center gap-0.5 shadow-2xs"
                                    title="Chuyển sang Bếp đang nấu"
                                  >
                                    <Flame className="w-3 h-3" />
                                    <span>Nấu</span>
                                  </button>
                                )}
                                {o.status === 'preparing' && (
                                  <button
                                    disabled={updatingOrderId === o.id}
                                    onClick={() => handleUpdateOrderStatus(o.id, 'completed')}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center gap-0.5 shadow-2xs"
                                    title="Xác nhận hoàn thành món"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Xong</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {sortedOverviewOrders.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Chưa có đơn hàng nào được ghi nhận.
                    </div>
                  )}
                </div>

                <PaginationControls
                  currentPage={overviewOrderPage}
                  totalItems={sortedOverviewOrders.length}
                  pageSize={overviewOrderPageSize}
                  pageSizeOptions={[10, 20, 50, 100]}
                  onPageChange={setOverviewOrderPage}
                  onPageSizeChange={(sz) => {
                    setOverviewOrderPageSize(sz);
                    setOverviewOrderPage(1);
                  }}
                  itemName="đơn hàng"
                />
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
                    onClick={() => setIsBulkUploadOpen(true)}
                    className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[40px] flex-shrink-0 cursor-pointer shadow-xs transition"
                    title="Thêm hàng loạt món ăn từ file Excel (.xlsx, .csv)"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Nhập từ File Excel</span>
                  </button>

                  <button
                    onClick={() => setIsAddDishOpen(true)}
                    className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[40px] flex-shrink-0 cursor-pointer shadow-xs transition"
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
                      ? 'Cơ sở dữ liệu Supabase chưa có món nào. Bạn có thể bấm "Thêm món" hoặc "Nhập từ File Excel" để tạo món ăn thật.'
                      : 'Không có món ăn phù hợp với bộ lọc tìm kiếm hiện tại.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                    {paginatedMenu.map((item) => {
                      const isOutOfStock = item.currentStock <= 0;
                      return (
                        <div
                          key={item.id}
                          className={`bg-white border rounded-2xl p-2.5 sm:p-4 shadow-xs flex flex-col justify-between transition-all ${
                            isOutOfStock
                              ? 'border-slate-300/80 bg-slate-50/90 opacity-60'
                              : 'border-slate-200 hover:border-indigo-200'
                          }`}
                        >
                          <div>
                            <div className="h-28 sm:h-40 rounded-xl overflow-hidden bg-slate-100 relative mb-2 sm:mb-3">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className={`w-full h-full object-cover transition-all ${
                                    isOutOfStock ? 'grayscale opacity-60' : ''
                                  }`}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                  <UtensilsCrossed className="w-6 h-6 sm:w-8 sm:h-8" />
                                </div>
                              )}

                              {isOutOfStock && (
                                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-1 text-center">
                                  <span className="bg-red-600/90 text-white font-extrabold text-[10px] sm:text-xs px-2 py-1 rounded-md shadow-sm uppercase tracking-wider">
                                    Hết suất
                                  </span>
                                </div>
                              )}

                              <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-white/95 backdrop-blur-xs text-slate-800 text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md shadow-xs border border-slate-200/60">
                                {item.category}
                              </span>

                              <button
                                onClick={() => handleStartEditDish(item)}
                                className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-white/95 hover:bg-white backdrop-blur-xs text-slate-700 hover:text-indigo-600 text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-lg shadow-xs border border-slate-200/80 flex items-center gap-1 transition cursor-pointer"
                                title="Chỉnh sửa thông tin và ảnh món"
                              >
                                <Pencil className="w-3 h-3 text-indigo-600" />
                                <span className="hidden sm:inline">Sửa món</span>
                              </button>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-0.5 sm:gap-2">
                              <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2">
                                {item.name}
                              </h4>
                              <span className="text-indigo-600 font-extrabold text-xs sm:text-sm whitespace-nowrap">
                                {formatVnd(item.price)}
                              </span>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-500 mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          </div>

                          <div className="mt-2.5 sm:mt-4 pt-2 sm:pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                            <div className="flex items-center justify-between sm:block">
                              <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Tồn kho:</p>
                              <p className="text-xs font-bold text-slate-900">
                                <span
                                  className={
                                    item.currentStock === 0
                                      ? 'text-rose-600 font-extrabold'
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

                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleToggleStock(item, -5)}
                                className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] sm:text-xs font-mono font-bold cursor-pointer min-h-[30px] sm:min-h-[36px]"
                                title="Trừ 5 suất"
                              >
                                -5
                              </button>
                              <button
                                onClick={() => handleToggleStock(item, -1)}
                                className="w-7 h-7 sm:w-8 sm:h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer min-h-[30px] sm:min-h-[36px]"
                                title="Trừ 1 suất"
                              >
                                <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleStock(item, 1)}
                                className="w-7 h-7 sm:w-8 sm:h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer min-h-[30px] sm:min-h-[36px]"
                                title="Thêm 1 suất"
                              >
                                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleStock(item, 5)}
                                className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] sm:text-xs font-mono font-bold cursor-pointer min-h-[30px] sm:min-h-[36px]"
                                title="Thêm 5 suất"
                              >
                                +5
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-xs">
                    <PaginationControls
                      currentPage={menuPage}
                      totalItems={filteredMenu.length}
                      pageSize={menuPageSize}
                      pageSizeOptions={[6, 12, 24, 48]}
                      onPageChange={setMenuPage}
                      onPageSizeChange={(sz) => {
                        setMenuPageSize(sz);
                        setMenuPage(1);
                      }}
                      itemName="món ăn"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB: ORDERS ================= */}
          {tab === 'orders' && (
            <div className="space-y-4">
              {/* Filter controls & View Switcher */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                {/* Row 1: Status & Date Filter */}
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between pb-1 border-b border-slate-100">
                  {/* Status Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                    <span className="text-xs text-slate-500 font-semibold flex items-center gap-1 mr-1 shrink-0">
                      <Filter className="w-3.5 h-3.5" />
                      <span>Trạng thái:</span>
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

                  {/* Date Filter */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 font-semibold flex items-center gap-1 shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Lọc ngày:</span>
                    </span>

                    {/* Quick Date Select Dropdown */}
                    <select
                      value={orderDateFilter}
                      onChange={(e) => setOrderDateFilter(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[38px] cursor-pointer shadow-2xs"
                    >
                      {availableOrderDates.length > 0 ? (
                        <>
                          {availableOrderDates.map((dateStr, idx) => (
                            <option key={dateStr} value={dateStr}>
                              {idx === 0 ? `📅 ${dateStr} (Ngày mới nhất)` : `📅 ${dateStr}`}
                            </option>
                          ))}
                          <option value="all">🌐 Tất cả các ngày (Toàn bộ)</option>
                        </>
                      ) : (
                        <option value="all">Tất cả các ngày</option>
                      )}
                    </select>

                    {/* Date Picker Input for Custom Date */}
                    <input
                      type="date"
                      value={orderDateFilter === 'all' ? '' : orderDateFilter}
                      onChange={(e) => setOrderDateFilter(e.target.value || 'all')}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[38px] shadow-2xs"
                      title="Chọn ngày cụ thể bất kỳ"
                    />

                    {/* Reset to Newest Date or Show All */}
                    {availableOrderDates.length > 0 && orderDateFilter !== availableOrderDates[0] && (
                      <button
                        type="button"
                        onClick={() => setOrderDateFilter(availableOrderDates[0])}
                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer min-h-[38px]"
                        title="Quay lại ngày mới nhất"
                      >
                        Về ngày mới nhất
                      </button>
                    )}

                    {orderDateFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setOrderDateFilter('all')}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-medium transition cursor-pointer min-h-[38px]"
                        title="Xem toàn bộ không giới hạn ngày"
                      >
                        Xem tất cả
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Delivery, Search & Export */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                  <div className="flex items-center gap-2">
                    <select
                      value={orderDeliveryFilter}
                      onChange={(e: any) => setOrderDeliveryFilter(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                    >
                      <option value="all">Tất cả hình thức</option>
                      <option value="dine_in">Tại Căn tin</option>
                      <option value="room_delivery">Giao tận phòng</option>
                    </select>

                    <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                      Hiển thị <strong className="text-slate-900">{filteredOrders.length}</strong> đơn hàng
                      {orderDateFilter && orderDateFilter !== 'all' ? ` (${orderDateFilter})` : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end">
                    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        placeholder="Mã đơn, tên cán bộ, phòng, ghi chú..."
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                      />
                    </div>

                    <button
                      onClick={() => exportOrdersToExcel(filteredOrders)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs min-h-[40px] whitespace-nowrap transition"
                      title="Xuất danh sách đơn hàng đã lọc ra file Excel (.xlsx) bao gồm cả cột Ghi chú"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Xuất Excel ({filteredOrders.length})</span>
                    </button>
                  </div>
                </div>

                {/* Row 3: View Mode Switcher & Realtime Sync Status */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-slate-100">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setOrdersViewMode('table')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer min-h-[34px] ${
                        ordersViewMode === 'table'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Bảng danh sách đơn</span>
                    </button>
                    <button
                      onClick={() => setOrdersViewMode('kds')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer min-h-[34px] ${
                        ordersViewMode === 'kds'
                          ? 'bg-white text-orange-600 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ChefHat className="w-3.5 h-3.5" />
                      <span>Màn hình Bếp (KDS 3 Cột)</span>
                    </button>
                    <button
                      onClick={() => setOrdersViewMode('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer min-h-[34px] ${
                        ordersViewMode === 'all'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Xem kết hợp cả hai</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Tự động cập nhật tức thì khi có order</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Batch Action Bar */}
              {(ordersViewMode === 'table' || ordersViewMode === 'all') && (
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
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderIds(filteredOrders.slice(0, 2).map((o) => o.id))}
                        className="px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Chọn nhanh 2 đơn đầu tiên"
                      >
                        2 đơn
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderIds(filteredOrders.slice(0, 10).map((o) => o.id))}
                        className="px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Chọn nhanh 10 đơn đầu tiên"
                      >
                        10 đơn
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderIds(filteredOrders.map((o) => o.id))}
                        className="px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Chọn toàn bộ đơn hiển thị"
                      >
                        Tất cả ({filteredOrders.length})
                      </button>
                    </div>

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
                          onClick={() => {
                            setBatchTestCount(null);
                            setBatchPrintOrders(orders.filter((o) => selectedOrderIds.includes(o.id)));
                          }}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 min-h-[36px]"
                        >
                          <Printer className="w-4 h-4" />
                          <span>In {selectedOrderIds.length} Phiếu POS</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ================= BẢNG DANH SÁCH ĐƠN HÀNG FULL KHÔNG CẦN SCROLL ================= */}
              {(ordersViewMode === 'table' || ordersViewMode === 'all') && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="w-full">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-2 w-8 text-center shrink-0">
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
                          <th className="py-3 px-2.5 w-[16%]">Đơn hàng & Thời gian</th>
                          <th className="py-3 px-2.5 w-[20%]">Cán bộ & Nơi nhận</th>
                          <th className="py-3 px-2 w-[11%] text-center">Ngày phục vụ</th>
                          <th className="py-3 px-3 w-[27%]">Món ăn & Ghi chú</th>
                          <th className="py-3 px-2.5 w-[11%] text-right">Tổng tiền</th>
                          <th className="py-3 px-2.5 w-[15%] text-center">Trạng thái & Bếp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedOrders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-2 text-center align-top">
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.includes(o.id)}
                                onChange={() => toggleSelectOrder(o.id)}
                                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer mt-0.5"
                              />
                            </td>

                            {/* Mã đơn & Thời gian khách đặt kèm bộ đếm */}
                            <td className="py-3 px-2.5 align-top space-y-1">
                              <p className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                                {o.orderCode}
                              </p>
                              <div>
                                <OrderLiveElapsedTimer
                                  createdAt={o.createdAt}
                                  isCompleted={o.status === 'completed' || o.status === 'cancelled'}
                                />
                              </div>
                              <p className="text-[10px] text-slate-400 font-normal">
                                {o.createdAt
                                  ? `${new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${new Date(o.createdAt).toLocaleDateString('vi-VN')}`
                                  : '11:30'}
                              </p>
                            </td>

                            {/* Cán bộ & Phòng / Căn tin */}
                            <td className="py-3 px-2.5 align-top space-y-1">
                              <p className="font-bold text-slate-900 leading-snug">{o.userName}</p>
                              <p className="text-[11px] text-slate-500 leading-tight">{o.userDepartment}</p>
                              <div className="pt-0.5 flex flex-wrap items-center gap-1">
                                {o.deliveryMethod === 'room_delivery' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[10px] border border-teal-200">
                                    <Building2 className="w-3 h-3 text-teal-600 shrink-0" />
                                    <span>{o.roomNumber || 'Giao phòng'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px] border border-slate-200">
                                    🍽️ Tại Căn tin
                                  </span>
                                )}
                                <span className="text-[10px] font-bold text-slate-700">
                                  ⏰ {o.pickupTime || '11:30'}
                                </span>
                              </div>
                            </td>

                            {/* Ngày phục vụ */}
                            <td className="py-3 px-2 text-center align-top">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 shadow-2xs">
                                <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span>{o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : 'Ngày mai')}</span>
                              </span>
                            </td>

                            {/* Chi tiết món & Ghi chú */}
                            <td className="py-3 px-3 align-top space-y-1">
                              <div className="space-y-0.5">
                                {(() => {
                                  const orderItems = getOrderDisplayItems(o, menu);
                                  if (orderItems && orderItems.length > 0) {
                                    return orderItems.map((it, i) => (
                                      <p key={i} className="text-slate-800 text-[11px] font-medium leading-tight">
                                        <strong className="text-indigo-600 font-bold">{it.quantity}×</strong> {it.name}
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
                              {(o.note || o.notes) && (
                                <div className="mt-1 p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-snug flex items-start gap-1 shadow-2xs">
                                  <StickyNote className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <span className="font-bold text-amber-800">Ghi chú: </span>
                                    <span className="break-words font-medium">{o.note || o.notes}</span>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Tổng tiền */}
                            <td className="py-3 px-2.5 text-right align-top font-extrabold text-indigo-600 text-xs whitespace-nowrap">
                              {formatVnd(o.totalAmount)}
                            </td>

                            {/* Trạng thái & Thao tác bếp */}
                            <td className="py-3 px-2.5 text-center align-top space-y-1.5">
                              <div>
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    o.status === 'confirmed'
                                      ? 'bg-amber-100 text-amber-800'
                                      : o.status === 'preparing'
                                        ? 'bg-orange-100 text-orange-800'
                                        : o.status === 'completed'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {o.status === 'confirmed'
                                    ? '⏳ Chờ nấu'
                                    : o.status === 'preparing'
                                      ? '🔥 Đang nấu'
                                      : o.status === 'completed'
                                        ? '✅ Hoàn thành'
                                        : 'Đã hủy'}
                                </span>
                              </div>

                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                <button
                                  onClick={() => setPrintReceiptOrder(o)}
                                  className="px-2 py-1 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] transition cursor-pointer flex items-center gap-0.5 border border-slate-200"
                                  title="In Bill POS nhiệt"
                                >
                                  <Printer className="w-3 h-3 text-indigo-600" />
                                  <span className="font-bold">Bill</span>
                                </button>
                                {o.status === 'confirmed' && (
                                  <button
                                    disabled={updatingOrderId === o.id}
                                    onClick={() => handleUpdateOrderStatus(o.id, 'preparing')}
                                    className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    {updatingOrderId === o.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Flame className="w-3 h-3" />
                                    )}
                                    <span>Nấu</span>
                                  </button>
                                )}
                                {o.status === 'preparing' && (
                                  <button
                                    disabled={updatingOrderId === o.id}
                                    onClick={() => handleUpdateOrderStatus(o.id, 'completed')}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    {updatingOrderId === o.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    )}
                                    <span>Xong</span>
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

                  <PaginationControls
                    currentPage={orderPage}
                    totalItems={filteredOrders.length}
                    pageSize={orderPageSize}
                    pageSizeOptions={[10, 20, 50, 100]}
                    onPageChange={setOrderPage}
                    onPageSizeChange={(sz) => {
                      setOrderPageSize(sz);
                      setOrderPage(1);
                    }}
                    itemName="đơn hàng"
                  />
                </div>
              )}

              {/* ================= MÀN HÌNH NHÀ BẾP (KDS) - 3 CỘT ĐIỀU HÀNH CHẾ BIẾN ================= */}
              {(ordersViewMode === 'kds' || ordersViewMode === 'all') && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                  {/* Header bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0 shadow-2xs">
                        <ChefHat className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">
                            MÀN HÌNH NHÀ BẾP (KDS) — ĐIỀU HÀNH CHẾ BIẾN THEO MÓN
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-orange-50 text-orange-700 border border-orange-200">
                            {orderDateFilter === 'all' ? 'Toàn bộ các ngày' : `Ngày: ${orderDateFilter || 'Ngày mai'}`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Theo dõi thời gian thực từng món ăn & đếm thời gian từ lúc order qua 3 giai đoạn chế biến
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.print()}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition cursor-pointer flex items-center gap-1.5 min-h-[38px] shadow-2xs"
                        title="In bảng thống kê món cần nấu cho nhà bếp"
                      >
                        <Printer className="w-4 h-4 text-orange-600" />
                        <span>In Bảng Bếp</span>
                      </button>
                    </div>
                  </div>

                  {/* Kitchen Metrics Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-medium text-slate-500 block">Số loại món nấu</span>
                      <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
                        {kitchenDishSummary.length} <span className="text-xs font-normal text-slate-500">món</span>
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-medium text-slate-500 block">Tổng số suất ăn</span>
                      <span className="text-xl sm:text-2xl font-black text-orange-600 mt-1 block">
                        {kitchenDishSummary.reduce((s, d) => s + d.quantity, 0)} <span className="text-xs font-normal text-slate-500">suất</span>
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-medium text-slate-500 block">Ăn tại Căn tin</span>
                      <span className="text-xl sm:text-2xl font-black text-indigo-600 mt-1 block">
                        {kitchenDishSummary.reduce((s, d) => s + d.dineInQty, 0)} <span className="text-xs font-normal text-slate-500">suất</span>
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-medium text-slate-500 block">Giao tận phòng</span>
                      <span className="text-xl sm:text-2xl font-black text-teal-600 mt-1 block">
                        {kitchenDishSummary.reduce((s, d) => s + d.roomDeliveryQty, 0)} <span className="text-xs font-normal text-slate-500">suất</span>
                      </span>
                    </div>
                  </div>

                  {/* Quick Dish Breakdown Summary Pills */}
                  {kitchenDishSummary.length > 0 && (
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
                        <span>Tổng hợp nhanh số suất cần nấu:</span>
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {kitchenDishSummary.map((d, i) => (
                          <div
                            key={i}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2 text-xs shadow-2xs"
                          >
                            <span className="font-bold text-slate-900">{d.name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-orange-600 text-white font-mono font-extrabold text-[11px]">
                              {d.quantity} suất
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ================= 3 CỘT KANBAN KDS ================= */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
                    {/* CỘT 1: NHẬN ORDER (CHỜ NẤU) */}
                    <div className="bg-slate-50/60 rounded-2xl border border-amber-200 overflow-hidden flex flex-col shadow-2xs">
                      <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Inbox className="w-4 h-4 text-amber-700" />
                          <h4 className="font-extrabold text-amber-900 text-xs sm:text-sm">
                            1. NHẬN ORDER (CHỜ NẤU)
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-900">
                          {kdsConfirmedOrders.length} đơn
                        </span>
                      </div>

                      <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[650px]">
                        {kdsConfirmedOrders.map((o) => {
                          const orderItems = getOrderDisplayItems(o, menu);
                          return (
                            <div
                              key={o.id}
                              className="bg-white border border-slate-200 hover:border-amber-400 rounded-xl p-3 shadow-xs space-y-2 transition"
                            >
                              {/* Top Bar: Code, Customer, Room, Time Counter */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-mono font-bold text-slate-900 text-xs">
                                    {o.orderCode}
                                  </p>
                                  <p className="font-bold text-xs text-slate-800 mt-0.5">
                                    {o.userName}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {o.userDepartment}
                                  </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                  <OrderLiveElapsedTimer createdAt={o.createdAt} />
                                  <span className="text-[10px] font-bold text-slate-600">
                                    ⏰ {o.pickupTime || '11:30'}
                                  </span>
                                </div>
                              </div>

                              {/* Delivery Badge */}
                              <div>
                                {o.deliveryMethod === 'room_delivery' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[10px] border border-teal-200">
                                    <Building2 className="w-3 h-3 text-teal-600" />
                                    <span>Giao {o.roomNumber || 'phòng'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px] border border-slate-200">
                                    🍽️ Ăn tại Căn tin
                                  </span>
                                )}
                              </div>

                              {/* Dish list */}
                              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                                {orderItems && orderItems.length > 0 ? (
                                  orderItems.map((it, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <span className="font-semibold text-slate-800">
                                        {it.name}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono font-bold text-[10px]">
                                        x{it.quantity}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-800">Suất ăn Căn tin</span>
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono font-bold text-[10px]">x1</span>
                                  </div>
                                )}
                              </div>

                              {/* Note if any */}
                              {(o.note || o.notes) && (
                                <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-tight flex items-start gap-1">
                                  <StickyNote className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                  <span className="break-words font-medium">{o.note || o.notes}</span>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100">
                                <button
                                  onClick={() => setPrintReceiptOrder(o)}
                                  className="px-2 py-1 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>In Bill</span>
                                </button>
                                <button
                                  disabled={updatingOrderId === o.id}
                                  onClick={() => handleUpdateOrderStatus(o.id, 'preparing')}
                                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                >
                                  {updatingOrderId === o.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Flame className="w-3.5 h-3.5" />
                                  )}
                                  <span>Bắt đầu nấu</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {kdsConfirmedOrders.length === 0 && (
                          <div className="p-6 text-center text-slate-400 text-xs">
                            Không có món nào đang chờ nhận nấu.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CỘT 2: NẤU MÓN (ĐANG NẤU) */}
                    <div className="bg-slate-50/60 rounded-2xl border border-orange-200 overflow-hidden flex flex-col shadow-2xs">
                      <div className="p-3 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Flame className="w-4 h-4 text-orange-600" />
                          <h4 className="font-extrabold text-orange-900 text-xs sm:text-sm">
                            2. NẤU MÓN (ĐANG NẤU)
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-orange-200 text-orange-900">
                          {kdsPreparingOrders.length} đơn
                        </span>
                      </div>

                      <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[650px]">
                        {kdsPreparingOrders.map((o) => {
                          const orderItems = getOrderDisplayItems(o, menu);
                          return (
                            <div
                              key={o.id}
                              className="bg-orange-50/30 border border-orange-200 hover:border-orange-400 rounded-xl p-3 shadow-xs space-y-2 transition"
                            >
                              {/* Top Bar */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-mono font-bold text-slate-900 text-xs">
                                    {o.orderCode}
                                  </p>
                                  <p className="font-bold text-xs text-slate-800 mt-0.5">
                                    {o.userName}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {o.userDepartment}
                                  </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                  <OrderLiveElapsedTimer createdAt={o.createdAt} />
                                  <span className="text-[10px] font-bold text-slate-600">
                                    ⏰ {o.pickupTime || '11:30'}
                                  </span>
                                </div>
                              </div>

                              {/* Delivery Badge */}
                              <div>
                                {o.deliveryMethod === 'room_delivery' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[10px] border border-teal-200">
                                    <Building2 className="w-3 h-3 text-teal-600" />
                                    <span>Giao {o.roomNumber || 'phòng'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px] border border-slate-200">
                                    🍽️ Ăn tại Căn tin
                                  </span>
                                )}
                              </div>

                              {/* Dish list */}
                              <div className="p-2 bg-white rounded-lg border border-orange-100 space-y-1">
                                {orderItems && orderItems.length > 0 ? (
                                  orderItems.map((it, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <span className="font-semibold text-slate-900">
                                        {it.name}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded bg-orange-600 text-white font-mono font-bold text-[10px]">
                                        x{it.quantity}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-900">Suất ăn Căn tin</span>
                                    <span className="px-1.5 py-0.5 rounded bg-orange-600 text-white font-mono font-bold text-[10px]">x1</span>
                                  </div>
                                )}
                              </div>

                              {/* Note if any */}
                              {(o.note || o.notes) && (
                                <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-tight flex items-start gap-1">
                                  <StickyNote className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                  <span className="break-words font-medium">{o.note || o.notes}</span>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="pt-1 flex items-center justify-between gap-2 border-t border-orange-200/60">
                                <button
                                  disabled={updatingOrderId === o.id}
                                  onClick={() => handleUpdateOrderStatus(o.id, 'confirmed')}
                                  className="px-2 py-1 text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border border-slate-200"
                                  title="Trả lại bước Nhận order"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Trả lại</span>
                                </button>
                                <button
                                  disabled={updatingOrderId === o.id}
                                  onClick={() => handleUpdateOrderStatus(o.id, 'completed')}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                >
                                  {updatingOrderId === o.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  <span>Hoàn thành món</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {kdsPreparingOrders.length === 0 && (
                          <div className="p-6 text-center text-slate-400 text-xs">
                            Hiện không có món nào đang nấu trên bếp.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CỘT 3: HOÀN THÀNH (ĐÃ XONG) */}
                    <div className="bg-slate-50/60 rounded-2xl border border-emerald-200 overflow-hidden flex flex-col shadow-2xs">
                      <div className="p-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          <h4 className="font-extrabold text-emerald-900 text-xs sm:text-sm">
                            3. HOÀN THÀNH (ĐÃ XONG)
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-200 text-emerald-900">
                          {kdsCompletedOrders.length} đơn
                        </span>
                      </div>

                      <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[650px]">
                        {kdsCompletedOrders.map((o) => {
                          const orderItems = getOrderDisplayItems(o, menu);
                          return (
                            <div
                              key={o.id}
                              className="bg-emerald-50/20 border border-emerald-200 rounded-xl p-3 shadow-xs space-y-2"
                            >
                              {/* Top Bar */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-mono font-bold text-slate-900 text-xs">
                                    {o.orderCode}
                                  </p>
                                  <p className="font-bold text-xs text-slate-800 mt-0.5">
                                    {o.userName}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {o.userDepartment}
                                  </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                                    ✅ Đã nấu xong
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-600">
                                    ⏰ {o.pickupTime || '11:30'}
                                  </span>
                                </div>
                              </div>

                              {/* Delivery Badge */}
                              <div>
                                {o.deliveryMethod === 'room_delivery' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[10px] border border-teal-200">
                                    <Building2 className="w-3 h-3 text-teal-600" />
                                    <span>Giao {o.roomNumber || 'phòng'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px] border border-slate-200">
                                    🍽️ Ăn tại Căn tin
                                  </span>
                                )}
                              </div>

                              {/* Dish list */}
                              <div className="p-2 bg-white rounded-lg border border-emerald-100 space-y-1">
                                {orderItems && orderItems.length > 0 ? (
                                  orderItems.map((it, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <span className="font-semibold text-slate-800">
                                        {it.name}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono font-bold text-[10px]">
                                        x{it.quantity}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-800">Suất ăn Căn tin</span>
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono font-bold text-[10px]">x1</span>
                                  </div>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div className="pt-1 flex items-center justify-between gap-2 border-t border-emerald-200/60">
                                <button
                                  onClick={() => setPrintReceiptOrder(o)}
                                  className="px-2 py-1 text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-100 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 border border-slate-200"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>In Bill</span>
                                </button>
                                <button
                                  disabled={updatingOrderId === o.id}
                                  onClick={() => handleUpdateOrderStatus(o.id, 'preparing')}
                                  className="px-2.5 py-1 text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border border-slate-200"
                                  title="Chuyển lại sang Nấu món nếu cần chế biến thêm"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Nấu lại</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {kdsCompletedOrders.length === 0 && (
                          <div className="p-6 text-center text-slate-400 text-xs">
                            Chưa có món nào hoàn thành cho ngày này.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[180px] flex-1">
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
                    onClick={() => exportUsersToExcel(filteredUsers)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs min-h-[38px] whitespace-nowrap transition"
                    title="Xuất danh sách cán bộ và số dư ví ra file Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Xuất Excel ({filteredUsers.length})</span>
                  </button>

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
                      {paginatedUsers.map((u) => {
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

                <PaginationControls
                  currentPage={userPage}
                  totalItems={filteredUsers.length}
                  pageSize={userPageSize}
                  pageSizeOptions={[10, 20, 50]}
                  onPageChange={setUserPage}
                  onPageSizeChange={(sz) => {
                    setUserPageSize(sz);
                    setUserPage(1);
                  }}
                  itemName="cán bộ"
                />
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
                    Dùng khi cổng đặt món thường đã đóng (sau {timeStatus.closesAt || '16:00'}). Cán bộ nhập mã này để được phép đặt suất ăn bổ sung.
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
                  <table className="w-full text-left text-xs min-w-[600px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Mã Token</th>
                        <th className="py-3 px-3 text-center">Số lượt cấp</th>
                        <th className="py-3 px-3 text-center">Đã dùng / Còn lại</th>
                        <th className="py-3 px-4">Ghi chú</th>
                        <th className="py-3 px-4">Tạo bởi / Người dùng</th>
                        <th className="py-3 px-4">Hạn sử dụng</th>
                        <th className="py-3 px-4 text-center">Trạng thái</th>
                        <th className="py-3 px-4 text-center">Sao chép</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedTokens.map((t) => {
                        const isExpired = new Date(t.expiresAt) < new Date();
                        const qty = Number(t.quantity) || 1;
                        const used = Number(t.usedCount) || 0;
                        const remaining = Math.max(0, qty - used);
                        const isFullyUsed = t.isUsed || remaining <= 0;

                        return (
                          <tr key={t.token} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono font-extrabold text-indigo-700">
                              {t.token}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-[11px] border border-indigo-200">
                                {qty} lượt
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <div className="inline-flex flex-col items-center gap-0.5">
                                <span className="font-bold text-slate-800 text-xs">
                                  Đã dùng: <strong className="text-orange-600 font-mono">{used}</strong> / {qty}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                    remaining > 0
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                                  }`}
                                >
                                  {remaining > 0 ? `Còn lại: ${remaining} lượt` : 'Hết lượt'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-700">{t.note || '—'}</td>
                            <td className="py-3 px-4 text-slate-700">
                              <p className="font-bold text-slate-800">{t.createdByName || 'Admin'}</p>
                              {t.usedBy && (
                                <p className="text-[10px] text-indigo-600 mt-0.5 font-medium">
                                  Đã dùng bởi: {t.usedBy}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {new Date(t.expiresAt).toLocaleString('vi-VN')}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isFullyUsed ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  Đã dùng hết ({used}/{qty})
                                </span>
                              ) : isExpired ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-50 text-rose-600 border border-rose-200">
                                  Hết hạn giờ
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  🟢 Còn hiệu lực ({remaining}/{qty} lượt)
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

                <PaginationControls
                  currentPage={qrPage}
                  totalItems={tokens.length}
                  pageSize={qrPageSize}
                  pageSizeOptions={[10, 20, 50]}
                  onPageChange={setQrPage}
                  onPageSizeChange={(sz) => {
                    setQrPageSize(sz);
                    setQrPage(1);
                  }}
                  itemName="mã QR"
                />
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
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-700">Phân loại / Danh mục</label>
                    <span className="text-[10px] text-slate-400">Chọn hoặc nhập</span>
                  </div>
                  <input
                    type="text"
                    list="add-dish-categories-list"
                    required
                    placeholder="VD: Cơm trưa, Bún / Phở, Món Chay, Canh..."
                    value={newDish.category}
                    onChange={(e) => setNewDish({ ...newDish, category: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                  <datalist id="add-dish-categories-list">
                    {menuCategories
                      .filter((c) => c !== 'all')
                      .map((c) => (
                        <option key={c} value={c} />
                      ))}
                  </datalist>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {menuCategories
                      .filter((c) => c !== 'all')
                      .slice(0, 6)
                      .map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewDish({ ...newDish, category: c })}
                          className={`text-[10px] px-2 py-0.5 rounded-md border transition cursor-pointer ${
                            newDish.category === c
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                  </div>
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
                  category={newDish.category}
                  menu={menu}
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

      {/* ================= MODAL: BULK MENU UPLOAD FROM EXCEL/CSV ================= */}
      <BulkMenuUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        currentUser={currentUser}
        onSuccess={(count) => {
          setMsg({
            type: 'ok',
            text: `Đã nạp thành công ${count} món ăn vào Thực đơn Căn tin trên Supabase!`,
          });
          onRefresh();
        }}
      />

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
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-700">Phân loại / Danh mục</label>
                    <span className="text-[10px] text-slate-400">Chọn hoặc nhập</span>
                  </div>
                  <input
                    type="text"
                    list="edit-dish-categories-list"
                    required
                    placeholder="VD: Cơm trưa, Bún / Phở, Món Chay, Canh..."
                    value={editDishForm.category}
                    onChange={(e) => setEditDishForm({ ...editDishForm, category: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                  />
                  <datalist id="edit-dish-categories-list">
                    {menuCategories
                      .filter((c) => c !== 'all')
                      .map((c) => (
                        <option key={c} value={c} />
                      ))}
                  </datalist>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {menuCategories
                      .filter((c) => c !== 'all')
                      .slice(0, 6)
                      .map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditDishForm({ ...editDishForm, category: c })}
                          className={`text-[10px] px-2 py-0.5 rounded-md border transition cursor-pointer ${
                            editDishForm.category === c
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                  </div>
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
                  category={editDishForm.category}
                  menu={menu}
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
                  Số lượt đặt cho phép (Suất ăn)
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
                    {[1, 2, 3, 5, 10].map((q) => (
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
                        {q} lượt
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 pos-modal-overlay">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <div>
                  <span className="font-bold text-sm block">Hóa đơn nhiệt POS</span>
                  <span className="text-[10px] text-slate-400">
                    Khổ {receiptPaperSize === 'k58' ? 'K58 (58mm)' : 'K80 (80mm)'} · Monospace
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Paper size toggle */}
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setReceiptPaperSize('k80')}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                      receiptPaperSize === 'k80'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    K80
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiptPaperSize('k58')}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                      receiptPaperSize === 'k58'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    K58
                  </button>
                </div>

                <button
                  onClick={() => setPrintReceiptOrder(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-slate-100/70 overflow-y-auto flex-1">
              <PosReceiptTicket
                order={printReceiptOrder}
                menu={menu}
                paperSize={receiptPaperSize}
                isPrintMode={false}
                isSingle={true}
              />
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
                <span>In Phiếu Nhiệt POS (1 Trang)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: BATCH POS RECEIPTS PRINT ================= */}
      {batchPrintOrders && batchPrintOrders.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 pos-modal-overlay">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">
                    In Hàng Loạt Hóa Đơn POS ({displayedBatchOrders.length}/{batchPrintOrders.length} đơn)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Khổ {receiptPaperSize === 'k58' ? 'K58 (58mm)' : 'K80 (80mm)'} · Monospace · 1 Phiếu / 1 Trang
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Paper size toggle */}
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setReceiptPaperSize('k80')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      receiptPaperSize === 'k80'
                        ? 'bg-indigo-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    K80 (80mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiptPaperSize('k58')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      receiptPaperSize === 'k58'
                        ? 'bg-indigo-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    K58 (58mm)
                  </button>
                </div>

                <button
                  onClick={() => {
                    setBatchPrintOrders(null);
                    setBatchTestCount(null);
                  }}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chọn số lượng xuất in nhanh (2 đơn, 10 đơn, tất cả) */}
            {batchPrintOrders.length > 2 && (
              <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 font-medium text-[11px]">
                  Số lượng xuất in:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBatchTestCount(2)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                      batchTestCount === 2
                        ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    2 đơn đầu
                  </button>
                  {batchPrintOrders.length >= 10 && (
                    <button
                      type="button"
                      onClick={() => setBatchTestCount(10)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                        batchTestCount === 10
                          ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                          : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                      }`}
                    >
                      10 đơn đầu
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBatchTestCount(null)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                      batchTestCount === null
                        ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    Tất cả ({batchPrintOrders.length} đơn)
                  </button>
                </div>
              </div>
            )}

            {/* Preview scroll container */}
            <div className="p-4 sm:p-6 bg-slate-100/80 overflow-y-auto flex-1 space-y-6">
              {displayedBatchOrders.map((ord, idx) => (
                <PosReceiptTicket
                  key={ord.id}
                  order={ord}
                  menu={menu}
                  paperSize={receiptPaperSize}
                  index={idx}
                  totalCount={displayedBatchOrders.length}
                  isPrintMode={false}
                  isLast={idx === displayedBatchOrders.length - 1}
                />
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <span>Xuất PDF/In: </span>
                <strong className="text-indigo-700 font-bold font-mono">
                  {displayedBatchOrders.length} trang
                </strong>
                <span className="text-slate-400"> (mỗi trang 1 phiếu)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBatchPrintOrders(null);
                    setBatchTestCount(null);
                  }}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded-xl hover:bg-slate-100 cursor-pointer min-h-[44px]"
                >
                  Đóng
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer min-h-[44px]"
                >
                  <Printer className="w-4 h-4" />
                  <span>In Tất Cả {displayedBatchOrders.length} Phiếu POS</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= DEDICATED PRINT PORTAL CONTAINER ================= */}
      {/* Mounted directly to document.body, outside #root to completely bypass modal overflow & position constraints */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="pos-print-root" className={`pos-print-root pos-${receiptPaperSize}`}>
            <style>{`
              @media print {
                @page {
                  size: ${receiptPaperSize === 'k58' ? '58mm auto' : '80mm auto'} !important;
                  margin: 0 !important;
                }
              }
            `}</style>
            {printReceiptOrder && (
              <PosReceiptTicket
                order={printReceiptOrder}
                menu={menu}
                paperSize={receiptPaperSize}
                isPrintMode={true}
                isSingle={true}
                isLast={true}
              />
            )}
            {!printReceiptOrder &&
              displayedBatchOrders &&
              displayedBatchOrders.map((ord, idx) => (
                <PosReceiptTicket
                  key={ord.id}
                  order={ord}
                  menu={menu}
                  paperSize={receiptPaperSize}
                  index={idx}
                  totalCount={displayedBatchOrders.length}
                  isPrintMode={true}
                  isLast={idx === displayedBatchOrders.length - 1}
                />
              ))}
          </div>,
          document.body
        )}
    </div>
  );
}
