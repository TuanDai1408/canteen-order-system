import { useState, useMemo, useEffect, useRef } from 'react';
import {
  formatVnd,
  placeOrder,
  cancelOrder,
  parseItemsFromNote,
  getOrderDisplayItems,
  getCachedQRTokens,
  getCachedOrders,
  type UserProfile,
  type MenuItem,
  type Order,
  type TimeGateStatus,
  type DeliveryMethod,
} from '@canteen/shared';
import { BrandLogo } from './BrandLogo';
import {
  UtensilsCrossed,
  ShoppingBag,
  Clock,
  Wallet,
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
  Search,
  Plus,
  Minus,
  Trash2,
  Copy,
  Check,
  QrCode,
  ArrowRight,
  X,
  ShieldAlert,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface Props {
  currentUser: UserProfile;
  menu: MenuItem[];
  orders: Order[];
  timeStatus: TimeGateStatus;
  error?: string | null;
  onRefresh: () => void;
  onLogout: () => void;
  onUserUpdate: (u: UserProfile) => void;
  onSwitchToPortal?: () => void;
}

export function OrderHome({
  currentUser,
  menu,
  orders,
  timeStatus,
  error: globalError,
  onRefresh,
  onLogout,
  onUserUpdate,
  onSwitchToPortal,
}: Props) {
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCategoryWrap, setIsCategoryWrap] = useState(false);
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollCategory = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = direction === 'left' ? -240 : 240;
      categoryScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('dine_in');
  const [roomNumber, setRoomNumber] = useState(currentUser.defaultRoom || '');
  const [pickupTime, setPickupTime] = useState('11:30');
  const [isCustomTimeMode, setIsCustomTimeMode] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [exceptionToken, setExceptionToken] = useState('');
  const [showExceptionField, setShowExceptionField] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Ticker cập nhật mỗi giây để đồng hồ đếm ngược 5 phút hủy món chạy chính xác
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // Categories list extracted from menu
  const categories = useMemo(() => {
    const set = new Set<string>();
    menu.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return ['all', ...Array.from(set)];
  }, [menu]);

  // Filtered menu
  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [menu, selectedCategory, searchQuery]);

  // Cart calculation
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = menu.find((m) => m.id === id);
        return { item: item!, qty };
      })
      .filter((i) => i.item !== undefined);
  }, [cart, menu]);

  const totalItemsCount = cartItems.reduce((acc, curr) => acc + curr.qty, 0);
  const [feedbackModal, setFeedbackModal] = useState<{
    title: string;
    message: string;
    type: 'error' | 'success' | 'warning';
  } | null>(null);

  const cartSubtotal = cartItems.reduce((s, { item, qty }) => s + item.price * qty, 0);
  const remainingWallet = currentUser.walletBalance - cartSubtotal;
  const isBalanceSufficient = remainingWallet >= 0;

  // Real-time verification of exception QR token & quota
  const tokenValidation = useMemo(() => {
    const raw = exceptionToken.trim().toUpperCase();
    if (!raw) return null;
    const allTokens = getCachedQRTokens();
    const found = allTokens.find((t) => t.token.toUpperCase() === raw);
    if (!found) {
      return {
        status: 'unknown' as const,
        text: 'Mã QR ngoại lệ (sẽ được đối chiếu và xác thực trên hệ thống khi đặt)',
      };
    }
    if (found.isDisabled) {
      return {
        status: 'invalid' as const,
        text: `Mã QR ngoại lệ "${raw}" đã bị Quản trị viên vô hiệu hóa. Không thể sử dụng để đặt món.`,
      };
    }
    const isExpired = new Date(found.expiresAt).getTime() < Date.now();
    const allowedQty = Number(found.quantity) || 1;
    const allOrders = getCachedOrders();
    const tokenOrders = allOrders.filter(
      (o) =>
        (o.exceptionTokenUsed && o.exceptionTokenUsed.toUpperCase() === raw) ||
        ((o as any).used_qr_token && String((o as any).used_qr_token).toUpperCase() === raw)
    );
    // Mỗi đơn hàng = 1 lượt đặt
    const usedOrdersCount = Math.max(tokenOrders.length, Number(found.usedCount || 0));

    if (found.isUsed || usedOrdersCount >= allowedQty) {
      return {
        status: 'invalid' as const,
        text: `Mã QR ngoại lệ "${raw}" đã hết số lượt đặt cho phép (đã dùng ${usedOrdersCount}/${allowedQty} lượt đặt).`,
      };
    }
    if (isExpired) {
      return {
        status: 'invalid' as const,
        text: `Mã QR ngoại lệ "${raw}" đã hết hạn lúc ${new Date(found.expiresAt).toLocaleTimeString('vi-VN')}.`,
      };
    }
    const remaining = Math.max(0, allowedQty - usedOrdersCount);
    return {
      status: 'valid' as const,
      remaining,
      allowed: allowedQty,
      text: `Mã hợp lệ: Cấp ${allowedQty} lượt đặt (Còn lại: ${remaining} lượt). Bạn có thể chọn đặt nhiều món/suất ăn tùy ý trong đơn hàng này.`,
    };
  }, [exceptionToken]);

  const addToCart = (id: string) => {
    const item = menu.find((m) => m.id === id);
    if (!item) return;
    const currentQty = cart[id] || 0;
    const remainingStock = Math.max(0, item.currentStock - currentQty);

    if (remainingStock <= 0) {
      setFeedbackModal({
        title: 'Hết suất khả dụng',
        message: `Món "${item.name}" chỉ còn ${item.currentStock} suất trong kho và bạn đã thêm toàn bộ vào khay chọn.`,
        type: 'warning',
      });
      return;
    }
    setCart((prev) => ({ ...prev, [id]: currentQty + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const current = prev[id] || 0;
      if (current <= 1) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: current - 1 };
    });
  };

  const clearCart = () => {
    setCart({});
    setIsCartOpen(false);
  };

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) {
      setFeedbackModal({
        title: 'Giỏ hàng đang trống',
        message: 'Vui lòng chọn ít nhất một món ăn trước khi xác nhận đặt đơn.',
        type: 'warning',
      });
      return;
    }

    if (deliveryMethod === 'room_delivery' && !roomNumber.trim()) {
      setFeedbackModal({
        title: 'Thiếu thông tin nhận hàng',
        message: 'Vui lòng điền số phòng nhận suất ăn (Ví dụ: P.302, Phòng GV Toán...) để Căn tin chuyển đến tận nơi.',
        type: 'warning',
      });
      return;
    }

    if (!timeStatus.isOpen && !exceptionToken.trim()) {
      setFeedbackModal({
        title: 'Cổng đặt món đã đóng',
        message: `${timeStatus.message}.\n\nNếu bạn có nhu cầu đặt suất ăn bổ sung ngoài giờ quy định, vui lòng nhập "Mã QR Ngoại Lệ" do Quản lý Căn tin cấp.`,
        type: 'warning',
      });
      setShowExceptionField(true);
      return;
    }

    if (tokenValidation && tokenValidation.status === 'invalid') {
      setFeedbackModal({
        title: 'Mã QR ngoại lệ không hợp lệ',
        message: tokenValidation.text,
        type: 'error',
      });
      return;
    }

    const isUserDisabled = Boolean(
      currentUser.isDisabled || (currentUser.isActive === false && Number(currentUser.walletBalance ?? 0) > 0)
    );
    if (isUserDisabled) {
      setFeedbackModal({
        title: 'Tài khoản đã bị vô hiệu hóa',
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Bạn không thể thực hiện đặt suất ăn. Vui lòng liên hệ Ban Quản lý Căn tin để được hỗ trợ mở lại.',
        type: 'error',
      });
      return;
    }

    if (currentUser.walletBalance < cartSubtotal) {
      setFeedbackModal({
        title: 'Số dư ví không đủ',
        message: `Tổng tiền đơn hàng là ${formatVnd(cartSubtotal)}, nhưng số dư ví của bạn hiện chỉ còn ${formatVnd(currentUser.walletBalance)}. Vui lòng liên hệ Quản lý Căn tin để được cấp thêm hạn mức ví.`,
        type: 'error',
      });
      return;
    }

    // Kết hợp giờ dùng bữa mong muốn và ghi chú dặn dò để admin và bill POS in đầy đủ
    const finalNote = [
      pickupTime ? `Giờ dùng bữa: ${pickupTime}` : '',
      orderNote.trim(),
    ].filter(Boolean).join(' | ');

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await placeOrder({
        items: cartItems.map(({ item, qty }) => ({
          menuItemId: item.id,
          quantity: qty,
          name: item.name,
          price: item.price,
          imageUrl: item.imageUrl,
        })),
        deliveryMethod,
        roomNumber: deliveryMethod === 'room_delivery' ? roomNumber.trim() : undefined,
        pickupTime,
        note: finalNote || undefined,
        isExceptionOrder: !timeStatus.isOpen && Boolean(exceptionToken.trim()),
        exceptionToken: exceptionToken.trim() || undefined,
      });

      if (!result.success) {
        setFeedbackModal({
          title: 'Đặt món không thành công',
          message: result.error || 'Hệ thống không thể xử lý đơn đặt món của bạn lúc này. Vui lòng thử lại.',
          type: 'error',
        });
      } else {
        if (result.new_balance !== undefined) {
          currentUser.walletBalance = result.new_balance;
          onUserUpdate?.({ ...currentUser, walletBalance: result.new_balance });
        }
        setFeedbackModal({
          title: 'Đặt món thành công! 🎉',
          message: `Mã đơn hàng: ${result.order_code}\nTổng thanh toán: ${formatVnd(result.total_amount || cartSubtotal)}\nThời gian nhận: ${pickupTime}${orderNote.trim() ? `\nGhi chú: ${orderNote.trim()}` : ''}`,
          type: 'success',
        });
        setCart({});
        setIsCartOpen(false);
        setOrderNote('');
        setExceptionToken('');
        setShowExceptionField(false);
        await onRefresh();
        setTab('orders');
      }
    } catch (e: any) {
      setFeedbackModal({
        title: 'Lỗi kết nối khi gửi đơn',
        message: e.message || 'Không thể kết nối đến máy chủ Căn tin. Vui lòng kiểm tra mạng và thử lại.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (targetOrder) {
      const orderCreatedTime = new Date(targetOrder.createdAt).getTime();
      const elapsed = Date.now() - orderCreatedTime;
      // Nếu quá 5 phút (cho phép 10 giây độ trễ mạng)
      if (elapsed > 5 * 60 * 1000 + 10000) {
        setFeedbackModal({
          title: 'Hết thời hạn hủy món',
          message:
            'Thời gian cho phép hủy món (5 phút sau khi đặt) đã hết. Suất ăn hiện đã được chuyển tới Bếp để chuẩn bị.',
          type: 'warning',
        });
        setCancellingOrderId(null);
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await cancelOrder(orderId, 'Hủy bởi người dùng');
      if (result.success) {
        if (result.new_balance !== undefined) {
          currentUser.walletBalance = result.new_balance;
          onUserUpdate?.({ ...currentUser, walletBalance: result.new_balance });
        }
        setFeedbackModal({
          title: 'Hủy đơn thành công',
          message: `Đơn hàng đã được hủy thành công! ${result.refund_amount ? `Đã hoàn trả ${formatVnd(result.refund_amount)} vào ví suất ăn.` : 'Tiền đã được hoàn lại ví.'}`,
          type: 'success',
        });
        await onRefresh();
      } else {
        setFeedbackModal({
          title: 'Không thể hủy đơn',
          message: result.error || 'Đơn hàng không thể hủy vào thời điểm này.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedbackModal({
        title: 'Lỗi khi hủy đơn',
        message: err.message || 'Lỗi kết nối khi gửi yêu cầu hủy đơn.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
      setCancellingOrderId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [orders]);

  const activeOrdersCount = sortedOrders.filter((o) => o.status !== 'cancelled').length;

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col font-sans text-slate-800 pb-28 sm:pb-24">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 text-slate-800 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 min-h-[64px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="py-0.5">
              <BrandLogo height={36} showText={true} />
            </div>
            <div className="hidden sm:block border-l border-slate-200 pl-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                {currentUser.name} · {currentUser.department || 'Cán bộ'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              title="Làm mới thực đơn và ví tiền"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
            </button>

            {onSwitchToPortal && ['admin', 'data_entry', 'executive'].includes(currentUser.role) && (
              <button
                onClick={onSwitchToPortal}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                title="Chuyển sang Quản trị & Bếp Căn tin"
              >
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                <span className="hidden md:inline">Portal Quản trị</span>
              </button>
            )}

            <button
              onClick={onLogout}
              className="p-2 text-slate-500 hover:text-red-600 rounded-xl hover:bg-red-50 transition cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-5 flex-1">
        {/* User Hero & Balance Card */}
        <div className="bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden mb-6">
          <div className="absolute right-0 bottom-0 translate-x-8 translate-y-8 w-64 h-64 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-5 items-center">
            {/* Left: User Welcome */}
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-400 uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Hồ sơ Cán bộ · Đặt suất trưa</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Xin chào, {currentUser.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
                <span>{currentUser.roleTitle || 'Giáo viên'}</span>
                <span>•</span>
                <span>{currentUser.department}</span>
                {currentUser.defaultRoom && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md text-xs">
                      <MapPin className="w-3 h-3 text-teal-300" />
                      Phòng: {currentUser.defaultRoom}
                    </span>
                  </>
                )}
              </p>

              {/* Timegate Status Banner */}
              <div className="mt-3.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      timeStatus.isOpen ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      timeStatus.isOpen ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                </span>
                <span className={timeStatus.isOpen ? 'text-emerald-300 font-medium' : 'text-rose-300 font-medium'}>
                  {timeStatus.isOpen ? 'Đang mở nhận đơn ngày mai' : 'Đã đóng cổng nhận đơn thường'}
                </span>
                <span className="text-slate-400 hidden sm:inline">· Hạn chót: {timeStatus.closesAt || '16:00'} hôm nay</span>
              </div>
            </div>

            {/* Right: Wallet Balance Display */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-teal-400" />
                  Số dư ví suất ăn
                </span>
                <button
                  onClick={onRefresh}
                  className="text-[11px] text-teal-300 hover:text-teal-200 underline cursor-pointer"
                >
                  Làm mới
                </button>
              </div>
              <div className="mt-2 text-2xl font-extrabold text-white tracking-tight">
                {formatVnd(currentUser.walletBalance)}
              </div>
              <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-[11px] text-slate-400">
                <span>Hạn mức tháng:</span>
                <span className="text-slate-200 font-medium">{formatVnd(currentUser.monthlyAllowance)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Notifications */}
        {globalError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
            <span>{globalError}</span>
          </div>
        )}

        {message && (
          <div
            className={`mb-4 p-4 rounded-2xl text-sm border flex items-center justify-between gap-3 shadow-sm ${
              message.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {message.type === 'ok' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            <button
              onClick={() => setMessage(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-5">
          <button
            onClick={() => setTab('menu')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer ${
              tab === 'menu'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Thực đơn ngày mai</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                tab === 'menu' ? 'bg-teal-800 text-teal-100' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {menu.length}
            </span>
          </button>

          <button
            onClick={() => {
              setTab('orders');
              handleManualRefresh();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer ${
              tab === 'orders'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Lịch sử đặt món</span>
            {activeOrdersCount > 0 && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  tab === 'orders' ? 'bg-teal-800 text-teal-100' : 'bg-teal-100 text-teal-800 font-bold'
                }`}
              >
                {activeOrdersCount}
              </span>
            )}
          </button>
        </div>

        {/* ================= TAB 1: MENU ================= */}
        {tab === 'menu' && (
          <div className="space-y-5">
            {/* Search & Category Filter Toolbar */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                {/* Category Pills Container */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5 relative">
                  {/* Left Scroll Arrow for PC */}
                  {!isCategoryWrap && (
                    <button
                      type="button"
                      onClick={() => scrollCategory('left')}
                      className="hidden sm:flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0 items-center justify-center border border-slate-200 shadow-2xs"
                      title="Cuộn danh mục sang trái"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}

                  {/* Scrollable / Wrappable Category List */}
                  <div
                    ref={categoryScrollRef}
                    onWheel={(e) => {
                      if (!isCategoryWrap && e.deltaY !== 0 && !e.shiftKey) {
                        e.currentTarget.scrollLeft += e.deltaY;
                      }
                    }}
                    className={`flex-1 min-w-0 flex items-center gap-1.5 transition-all ${
                      isCategoryWrap
                        ? 'flex-wrap py-1'
                        : 'overflow-x-auto py-1 scroll-smooth'
                    }`}
                    style={{
                      scrollbarWidth: 'thin',
                    }}
                  >
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
                          selectedCategory === cat
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                        }`}
                      >
                        {cat === 'all' ? 'Tất cả món' : cat}
                      </button>
                    ))}
                  </div>

                  {/* Right Scroll Arrow for PC */}
                  {!isCategoryWrap && (
                    <button
                      type="button"
                      onClick={() => scrollCategory('right')}
                      className="hidden sm:flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0 items-center justify-center border border-slate-200 shadow-2xs"
                      title="Cuộn danh mục sang phải"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {/* Toggle Wrap on PC if categories are plentiful */}
                  {categories.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setIsCategoryWrap((prev) => !prev)}
                      className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition cursor-pointer shrink-0 ml-1 shadow-2xs"
                      title={isCategoryWrap ? 'Chuyển sang dạng cuộn 1 dòng' : 'Mở rộng tất cả danh mục'}
                    >
                      {isCategoryWrap ? 'Thu gọn' : `Tất cả (${categories.length})`}
                    </button>
                  )}
                </div>

                {/* Search input */}
                <div className="relative w-full sm:w-64 sm:shrink-0">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm món ăn, cơm, bún..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Menu List */}
            {filteredMenu.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <UtensilsCrossed className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-700">
                  {menu.length === 0 ? 'Chưa có món ăn trong thực đơn Căn tin' : 'Không tìm thấy món ăn phù hợp'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {menu.length === 0
                    ? 'Dữ liệu thực đơn được kết nối trực tiếp từ Supabase Cloud. Quản trị viên vui lòng thêm món tại Portal Quản Lý để mở bán.'
                    : 'Vui lòng thử chọn danh mục khác hoặc xóa bộ lọc tìm kiếm.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
                {filteredMenu.map((item) => {
                  const qtyInCart = cart[item.id] || 0;
                  const effectiveStock = Math.max(0, item.currentStock - qtyInCart);
                  const isSoldOut = effectiveStock <= 0;
                  const isLowStock = effectiveStock > 0 && effectiveStock <= 5;

                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between ${
                        item.currentStock <= 0 ? 'opacity-70 bg-slate-50/80' : ''
                      }`}
                    >
                      <div>
                        {/* Food Image */}
                        <div className="w-full h-28 sm:h-36 bg-slate-100 relative overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-100">
                              <UtensilsCrossed className="w-8 h-8" />
                            </div>
                          )}
                          {item.category && (
                            <span className="absolute top-1.5 left-1.5 text-[9px] sm:text-[10px] font-semibold bg-slate-900/80 text-white px-1.5 sm:px-2 py-0.5 rounded-md backdrop-blur-xs">
                              {item.category}
                            </span>
                          )}
                          <div className="absolute bottom-1.5 right-1.5">
                            {isSoldOut ? (
                              <span className="text-[9px] sm:text-[10px] font-bold text-red-600 bg-white/95 px-1.5 py-0.5 rounded shadow-xs">
                                {item.currentStock <= 0 ? 'Hết suất' : 'Hết khả dụng'}
                              </span>
                            ) : isLowStock ? (
                              <span className="text-[9px] sm:text-[10px] font-bold text-amber-700 bg-white/95 px-1.5 py-0.5 rounded shadow-xs">
                                Còn {effectiveStock} {qtyInCart > 0 ? `(chọn ${qtyInCart})` : ''}
                              </span>
                            ) : (
                              <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-700 bg-white/95 px-1.5 py-0.5 rounded shadow-xs">
                                Còn {effectiveStock} {qtyInCart > 0 ? `(chọn ${qtyInCart})` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Food Info */}
                        <div className="p-2.5 sm:p-3.5">
                          <h3 className="font-bold text-slate-800 text-xs sm:text-sm leading-snug line-clamp-2 min-h-[32px] sm:min-h-[38px]">
                            {item.name}
                          </h3>
                          <p className="text-[10px] sm:text-xs text-slate-500 mt-1 line-clamp-1 sm:line-clamp-2 leading-relaxed">
                            {item.description || 'Suất ăn dinh dưỡng tiêu chuẩn chuẩn bị bởi Căn tin.'}
                          </p>

                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs sm:text-sm md:text-base font-extrabold text-teal-700 font-mono">
                              {formatVnd(item.price)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Action */}
                      <div className="px-2.5 sm:px-3.5 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-1">
                        <span className="text-[10px] sm:text-xs text-slate-500 truncate">
                          {qtyInCart > 0 ? (
                            <span className="text-teal-700 font-semibold font-mono">
                              x{qtyInCart}
                            </span>
                          ) : (
                            <span className="text-slate-400">Chọn</span>
                          )}
                        </span>

                        <div className="flex items-center gap-1 sm:gap-1.5">
                          {qtyInCart > 0 && (
                            <>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-xs transition cursor-pointer active:scale-95"
                                aria-label="Giảm số lượng"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-5 text-center font-bold text-slate-800 text-xs font-mono">
                                {qtyInCart}
                              </span>
                            </>
                          )}
                          <button
                            onClick={() => addToCart(item.id)}
                            disabled={isSoldOut || effectiveStock <= 0}
                            className={`h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg sm:rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shadow-xs ${
                              isSoldOut || effectiveStock <= 0
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-teal-700 hover:bg-teal-800 text-white shadow-teal-700/20 active:scale-95'
                            }`}
                            aria-label="Thêm vào khay"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="text-[10px] sm:text-xs">{qtyInCart === 0 ? 'Thêm' : ''}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: MY ORDERS ================= */}
        {tab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Lịch sử đặt suất ăn</h3>
                <p className="text-[11px] text-slate-500">Được đồng bộ trực tiếp từ Căn tin Supabase</p>
              </div>
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Đang đồng bộ...' : 'Làm mới'}</span>
              </button>
            </div>
            {sortedOrders.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-700">Bạn chưa có đơn đặt suất ăn nào</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Hãy quay lại tab "Thực đơn ngày mai" để chọn món ngon cho bữa trưa của bạn.
                </p>
                <button
                  onClick={() => setTab('menu')}
                  className="mt-4 px-5 py-2.5 bg-teal-600 text-white text-xs font-semibold rounded-xl hover:bg-teal-700 transition cursor-pointer"
                >
                  Xem thực đơn ngay
                </button>
              </div>
            ) : (
              sortedOrders.map((o) => {
                const isCancelled = o.status === 'cancelled';
                const isCompleted = o.status === 'completed';
                const isPreparing = o.status === 'preparing';
                const isConfirmed = o.status === 'confirmed';
                const orderItems = getOrderDisplayItems(o, menu);

                return (
                  <div
                    key={o.id}
                    className={`bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4 transition ${
                      isCancelled ? 'opacity-60 bg-slate-50/80' : ''
                    }`}
                  >
                    {/* Order Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-800">
                            {o.orderCode}
                          </span>
                          <button
                            onClick={() => copyToClipboard(o.orderCode)}
                            className="text-slate-400 hover:text-slate-600 p-1"
                            title="Sao chép mã đơn"
                          >
                            {copiedCode === o.orderCode ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Đặt lúc: {new Date(o.createdAt).toLocaleString('vi-VN')} · Nhận suất:{' '}
                          <strong className="text-slate-700">{o.pickupTime}</strong>
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                          isCancelled
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : isCompleted
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isPreparing
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-teal-50 text-teal-700 border border-teal-200'
                        }`}
                      >
                        {isCancelled && <XCircle className="w-3.5 h-3.5" />}
                        {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {isPreparing && <Clock className="w-3.5 h-3.5 animate-spin" />}
                        {isConfirmed && <Check className="w-3.5 h-3.5" />}
                        <span>
                          {isCancelled
                            ? 'Đã hủy'
                            : isCompleted
                              ? 'Đã hoàn thành'
                              : isPreparing
                                ? 'Bếp đang nấu'
                                : 'Đã xác nhận'}
                        </span>
                      </span>
                    </div>

                    {/* Delivery Mode Info */}
                    <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between text-xs text-slate-600 border border-slate-100">
                      <div className="flex items-center gap-2">
                        {o.deliveryMethod === 'room_delivery' ? (
                          <>
                            <Building2 className="w-4 h-4 text-teal-600" />
                            <span>
                              Giao tận phòng: <strong>{o.roomNumber || 'Theo phòng khoa'}</strong>
                            </span>
                          </>
                        ) : (
                          <>
                            <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
                            <span>Nhận và dùng bữa tại Canteen</span>
                          </>
                        )}
                      </div>
                      <span className="text-slate-400">Giờ ăn: {o.pickupTime}</span>
                    </div>

                    {/* Order Items */}
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      {orderItems && orderItems.length > 0 ? (
                        orderItems.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-slate-700">
                            <span>
                              <strong className="text-slate-900">{it.quantity}×</strong> {it.name || 'Suất ăn Căn tin'}
                            </span>
                            <span className="font-medium">{formatVnd((it.price || 0) * (it.quantity || 1))}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between text-xs text-slate-700">
                          <span>
                            <strong className="text-slate-900">1×</strong> Suất ăn Căn tin
                          </span>
                          <span className="font-medium">{formatVnd(o.totalAmount)}</span>
                        </div>
                      )}
                    </div>

                    {/* Order Total & Cancel Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
                      <div>
                        <span className="text-xs text-slate-500">Tổng thanh toán: </span>
                        <span className="text-sm font-bold text-teal-700">
                          {formatVnd(o.totalAmount)}
                        </span>
                      </div>

                      {isConfirmed && (() => {
                        const orderCreatedTime = new Date(o.createdAt).getTime();
                        const elapsedMs = nowMs - orderCreatedTime;
                        const CANCEL_LIMIT_MS = 5 * 60 * 1000; // 5 phút
                        const remainingMs = Math.max(0, CANCEL_LIMIT_MS - elapsedMs);
                        const canCancel = remainingMs > 0;
                        const remainingSec = Math.floor(remainingMs / 1000);
                        const mins = Math.floor(remainingSec / 60);
                        const secs = remainingSec % 60;
                        const countdownStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                        if (canCancel) {
                          return (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-xl shadow-2xs">
                                <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                                <span>Hủy trong <strong className="font-mono text-amber-900">{countdownStr}</strong></span>
                              </div>

                              <button
                                onClick={() => setCancellingOrderId(o.id)}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl border border-red-200 transition cursor-pointer shrink-0"
                              >
                                Hủy đơn & hoàn tiền
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 bg-slate-100/90 border border-slate-200/60 px-2.5 py-1 rounded-xl">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Hết hạn hủy (quá 5 phút)</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar (Sticky when cart has items) */}
      {tab === 'menu' && totalItemsCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl p-4 transition-all">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center relative shadow-md shadow-teal-600/30 group-hover:bg-teal-700 transition">
                <ShoppingBag className="w-6 h-6" />
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                  {totalItemsCount}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Giỏ hàng của bạn</p>
                <p className="text-base font-extrabold text-slate-900 tracking-tight">
                  {formatVnd(cartSubtotal)}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-teal-600/25 flex items-center gap-2 transition cursor-pointer"
            >
              <span>Xem đơn & Đặt món</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Checkout Drawer / Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in slide-in-from-bottom duration-200"
            role="dialog"
          >
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-teal-600" />
                <h2 className="font-bold text-slate-800 text-base">Xác nhận suất ăn ngày mai</h2>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Selected Items List */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <span>Món đã chọn</span>
                  <button
                    onClick={clearCart}
                    className="text-red-500 hover:text-red-700 cursor-pointer capitalize font-normal flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa tất cả</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl p-3 bg-slate-50/50">
                  {cartItems.map(({ item, qty }) => (
                    <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-teal-700 font-medium">
                          {formatVnd(item.price)} × {qty} = {formatVnd(item.price * qty)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold hover:bg-slate-100 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-4 text-center font-bold text-xs text-slate-800">{qty}</span>
                        <button
                          onClick={() => addToCart(item.id)}
                          disabled={qty >= item.currentStock}
                          className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center text-xs font-bold hover:bg-teal-700 disabled:opacity-40 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Method Choice */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Hình thức nhận suất ăn
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('dine_in')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      deliveryMethod === 'dine_in'
                        ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <UtensilsCrossed
                      className={`w-5 h-5 mb-1.5 ${
                        deliveryMethod === 'dine_in' ? 'text-teal-600' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-800">Ăn tại Canteen</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Nhận khay tại quầy</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('room_delivery')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      deliveryMethod === 'room_delivery'
                        ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <Building2
                      className={`w-5 h-5 mb-1.5 ${
                        deliveryMethod === 'room_delivery' ? 'text-teal-600' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-800">Giao tận phòng</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Canteen chuyển đến</p>
                    </div>
                  </button>
                </div>

                {deliveryMethod === 'room_delivery' && (
                  <div className="mt-2 pt-1 animate-in fade-in">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Số phòng học / Tổ bộ môn
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                        placeholder="Ví dụ: P.302 - Tổ Ngoại ngữ"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Pickup Time Choice */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Giờ dùng bữa mong muốn
                  </label>
                  <span className="text-xs font-bold text-teal-700 font-mono bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-200">
                    {pickupTime || '11:30'}
                  </span>
                </div>

                {/* Preset Options from 9h30 to 13h */}
                <div className="grid grid-cols-4 gap-1.5">
                  {['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'].map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => {
                        setPickupTime(time);
                        setIsCustomTimeMode(false);
                      }}
                      className={`py-2 rounded-xl text-xs font-semibold transition cursor-pointer font-mono ${
                        pickupTime === time && !isCustomTimeMode
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>

                {/* Custom Time Input */}
                <div className="pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCustomTimeMode(!isCustomTimeMode)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                        isCustomTimeMode
                          ? 'bg-teal-50 border-teal-300 text-teal-800 font-bold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{isCustomTimeMode ? 'Đang tự nhập giờ:' : 'Tự nhập giờ mong muốn'}</span>
                    </button>
                    {isCustomTimeMode && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          min="09:00"
                          max="14:00"
                          value={pickupTime}
                          onChange={(e) => setPickupTime(e.target.value)}
                          className="px-2.5 py-1.5 bg-white border border-teal-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        <input
                          type="text"
                          placeholder="Hoặc gõ VD: 11h20..."
                          value={pickupTime}
                          onChange={(e) => setPickupTime(e.target.value)}
                          className="w-28 px-2.5 py-1.5 bg-white border border-teal-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dish Note for Kitchen & POS Bill */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Ghi chú về món ăn / Dặn dò bếp (In ra bill POS)
                </label>
                <div className="relative">
                  <textarea
                    rows={2}
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Ghi chú cho bếp (VD: ít cơm, không hành ớt, canh nóng, lấy lúc 11h20...)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white resize-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Thông tin giờ dùng bữa và ghi chú sẽ được chuyển tới Bếp ăn và in ở phần <strong>"Ghi chú"</strong> trên phiếu POS.
                </p>
              </div>

              {/* Wallet Deduction Preview */}
              <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Số dư ví hiện tại:</span>
                  <span className="font-semibold">{formatVnd(currentUser.walletBalance)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Tổng tiền suất ăn:</span>
                  <span className="font-semibold text-teal-400">− {formatVnd(cartSubtotal)}</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold">
                  <span>Số dư dự kiến sau đặt:</span>
                  <span className={isBalanceSufficient ? 'text-emerald-400' : 'text-red-400'}>
                    {formatVnd(remainingWallet)}
                  </span>
                </div>
                {!isBalanceSufficient && (
                  <p className="text-[11px] text-red-300 bg-red-500/20 p-2 rounded-lg mt-1 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Số dư ví không đủ. Vui lòng liên hệ Quản lý Căn tin để nạp thêm.</span>
                  </p>
                )}
              </div>

              {/* Exception Token field (if closed) */}
              {(!timeStatus.isOpen || showExceptionField) && (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                    <QrCode className="w-4 h-4 text-amber-600" />
                    <span>Mã Ngoại lệ Đặt khẩn cấp (Emergency Token)</span>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Cổng đặt suất ăn tiêu chuẩn đã đóng lúc {timeStatus.closesAt || '17:00'}. Để đặt bổ sung, vui lòng nhập mã QR ngoại lệ do Quản trị viên cấp.
                  </p>
                  <input
                    type="text"
                    value={exceptionToken}
                    onChange={(e) => setExceptionToken(e.target.value)}
                    placeholder="Nhập mã token (VD: QR-...)"
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />

                  {tokenValidation && (
                    <div
                      className={`text-[11px] px-2.5 py-2 rounded-xl border leading-relaxed ${
                        tokenValidation.status === 'valid'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : tokenValidation.status === 'invalid'
                          ? 'bg-rose-50 text-rose-800 border-rose-200 font-bold'
                          : 'bg-amber-100/70 text-amber-900 border-amber-300'
                      }`}
                    >
                      {tokenValidation.text}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="w-1/3 py-3 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Tiếp tục chọn
              </button>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={
                  submitting ||
                  (!timeStatus.isOpen && !exceptionToken.trim()) ||
                  tokenValidation?.status === 'invalid' ||
                  Boolean(
                    tokenValidation?.status === 'valid' &&
                      tokenValidation.remaining !== undefined &&
                      tokenValidation.remaining <= 0
                  )
                }
                className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Đang xác nhận đơn...</span>
                  </>
                ) : (
                  <>
                    <span>Xác nhận đặt suất ({formatVnd(cartSubtotal)})</span>
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation Modal */}
      {cancellingOrderId && (() => {
        const targetOrder = orders.find((o) => o.id === cancellingOrderId);
        const orderCreatedTime = targetOrder ? new Date(targetOrder.createdAt).getTime() : 0;
        const elapsedMs = nowMs - orderCreatedTime;
        const remainingMs = Math.max(0, 5 * 60 * 1000 - elapsedMs);
        const remainingSec = Math.floor(remainingMs / 1000);
        const mins = Math.floor(remainingSec / 60);
        const secs = remainingSec % 60;
        const countdownStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-slate-800 text-base">Xác nhận hủy đơn hàng</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Bạn có chắc chắn muốn hủy đơn hàng này? Số tiền đã thanh toán sẽ được hoàn trả lại ngay vào ví suất ăn của bạn.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Thời gian còn lại để hủy: <strong className="font-mono text-amber-900">{countdownStr}</strong></span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setCancellingOrderId(null)}
                  className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Không, giữ đơn
                </button>
                <button
                  onClick={() => handleCancelOrder(cancellingOrderId)}
                  disabled={submitting || remainingMs <= 0}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Đang hoàn tiền ví...</span>
                    </>
                  ) : (
                    'Xác nhận hủy'
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL: FEEDBACK / POPUP THÔNG BÁO ================= */}
      {feedbackModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner">
              {feedbackModal.type === 'error' && (
                <div className="w-14 h-14 rounded-2xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center">
                  <XCircle className="w-8 h-8" />
                </div>
              )}
              {feedbackModal.type === 'warning' && (
                <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8" />
                </div>
              )}
              {feedbackModal.type === 'success' && (
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
              )}
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-slate-900">
                {feedbackModal.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line font-medium">
                {feedbackModal.message}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setFeedbackModal(null)}
                className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-sm transition cursor-pointer active:scale-95 ${
                  feedbackModal.type === 'error'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : feedbackModal.type === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
