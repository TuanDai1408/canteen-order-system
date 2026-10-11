import { useState, useMemo } from 'react';
import {
  formatVnd,
  getOrderDisplayItems,
  getTodayStr,
  getTomorrowStr,
  type Order,
  type MenuItem,
  type UserProfile,
  type SiteCode,
} from '@canteen/shared';
import {
  TrendingUp,
  Receipt,
  Users,
  UtensilsCrossed,
  FileSpreadsheet,
  Calendar,
  Search,
  Filter,
  DollarSign,
  ShoppingBag,
  Sparkles,
  ChevronDown,
  ChevronUp,
  PieChart,
  BarChart3,
  CreditCard,
  Wallet,
  Truck,
  Store,
  Layers,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Percent,
} from 'lucide-react';
import { exportAccountingReconciliationToExcel } from '../utils/exportExcel';

interface Props {
  orders: Order[];
  menu: MenuItem[];
  users: UserProfile[];
  siteName: string;
  selectedSiteCode: SiteCode;
}

type PeriodOption = 'today' | '7days' | '14days' | '30days' | 'all' | 'custom';
type ChartViewMode = 'combo' | 'revenue' | 'volume';
type ReconViewMode = 'items' | 'customers';

export function AdminAnalyticsAndReconciliation({
  orders,
  menu,
  users,
  siteName,
  selectedSiteCode,
}: Props) {
  // Bộ lọc thời gian tổng quát
  const [period, setPeriod] = useState<PeriodOption>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Chế độ hiển thị biểu đồ
  const [chartMode, setChartMode] = useState<ChartViewMode>('combo');
  const [hoveredDayData, setHoveredDayData] = useState<{
    date: string;
    revenue: number;
    orderCount: number;
    portions: number;
    aov: number;
    x: number;
    y: number;
  } | null>(null);

  // Bộ lọc và điều khiển phân hệ đối soát Kế toán
  const todayStr = useMemo(() => getTodayStr(), []);
  const tomorrowStr = useMemo(() => getTomorrowStr(), []);
  const [reconDateFilter, setReconDateFilter] = useState<string>(todayStr);
  const [reconViewMode, setReconViewMode] = useState<ReconViewMode>('items');
  const [reconSearch, setReconSearch] = useState('');
  const [reconPaymentFilter, setReconPaymentFilter] = useState<'all' | 'wallet' | 'bank_transfer' | 'cash'>('all');
  const [reconCustomerType, setReconCustomerType] = useState<'all' | 'staff' | 'guest'>('all');
  const [expandedCustomerKey, setExpandedCustomerKey] = useState<string | null>(null);

  // User lookup map for fast retrieval
  const userMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) {
      map.set(u.id, u);
      if (u.phoneNumber) map.set(u.phoneNumber, u);
    }
    return map;
  }, [users]);

  // Lọc danh sách đơn hàng theo Kỳ phân tích (Period)
  const periodFilteredOrders = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return orders.filter((o) => {
      // Bỏ qua đơn hủy trong phân tích doanh thu hợp lệ
      if (o.status === 'cancelled') return false;

      const orderDateStr = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
      if (!orderDateStr) return false;

      if (period === 'all') return true;
      if (period === 'today') return orderDateStr === todayStr;

      if (period === 'custom') {
        if (customStartDate && orderDateStr < customStartDate) return false;
        if (customEndDate && orderDateStr > customEndDate) return false;
        return true;
      }

      const daysDiff = Math.floor(
        (today.getTime() - new Date(orderDateStr).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (period === '7days') return daysDiff <= 6 && daysDiff >= -1;
      if (period === '14days') return daysDiff <= 13 && daysDiff >= -1;
      if (period === '30days') return daysDiff <= 29 && daysDiff >= -1;

      return true;
    });
  }, [orders, period, todayStr, customStartDate, customEndDate]);

  // Executive KPI Metrics Calculation
  const kpiData = useMemo(() => {
    const totalOrders = periodFilteredOrders.length;
    let totalRevenue = 0;
    let walletRevenue = 0;
    let cashBankRevenue = 0;
    let totalPortions = 0;
    let dineInCount = 0;
    let roomDeliveryCount = 0;
    let completedOrders = 0;
    let maxOrderAmount = 0;
    const uniqueCustomers = new Set<string>();

    for (const o of periodFilteredOrders) {
      const amount = o.totalAmount || 0;
      totalRevenue += amount;
      if (amount > maxOrderAmount) maxOrderAmount = amount;

      if (o.paymentMethod === 'cash' || o.paymentMethod === 'bank_transfer') {
        cashBankRevenue += amount;
      } else {
        walletRevenue += amount;
      }

      if (o.status === 'completed') completedOrders++;

      const items = getOrderDisplayItems(o, menu);
      const portions = items && items.length > 0 ? items.reduce((s, it) => s + (it.quantity || 1), 0) : 1;
      totalPortions += portions;

      if (o.deliveryMethod === 'room_delivery') {
        roomDeliveryCount++;
      } else {
        dineInCount++;
      }

      const custKey = o.userId || o.userPhone || o.userName || 'unknown';
      uniqueCustomers.add(custKey);
    }

    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const arpu = uniqueCustomers.size > 0 ? Math.round(totalRevenue / uniqueCustomers.size) : 0;
    const avgPortionsPerOrder = totalOrders > 0 ? (totalPortions / totalOrders).toFixed(1) : '0';
    const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

    return {
      totalRevenue,
      walletRevenue,
      cashBankRevenue,
      totalOrders,
      completedOrders,
      completionRate,
      totalPortions,
      dineInCount,
      roomDeliveryCount,
      aov,
      arpu,
      maxOrderAmount,
      uniqueCustomersCount: uniqueCustomers.size,
      avgPortionsPerOrder,
    };
  }, [periodFilteredOrders, menu]);

  // Thống kê Doanh thu & Sản lượng theo từng Ngày (Timeline)
  const dailyTimelineData = useMemo(() => {
    const map = new Map<string, {
      date: string;
      revenue: number;
      orderCount: number;
      portions: number;
      walletRevenue: number;
      cashBankRevenue: number;
    }>();

    for (const o of periodFilteredOrders) {
      const d = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : 'N/A');
      const curr = map.get(d) || {
        date: d,
        revenue: 0,
        orderCount: 0,
        portions: 0,
        walletRevenue: 0,
        cashBankRevenue: 0,
      };

      curr.revenue += o.totalAmount || 0;
      curr.orderCount += 1;
      if (o.paymentMethod === 'cash' || o.paymentMethod === 'bank_transfer') {
        curr.cashBankRevenue += o.totalAmount || 0;
      } else {
        curr.walletRevenue += o.totalAmount || 0;
      }

      const items = getOrderDisplayItems(o, menu);
      curr.portions += items && items.length > 0 ? items.reduce((s, it) => s + (it.quantity || 1), 0) : 1;

      map.set(d, curr);
    }

    // Sắp xếp theo ngày tăng dần
    const list = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    return list;
  }, [periodFilteredOrders, menu]);

  // Tìm ngày có doanh thu cao nhất & sản lượng cao nhất
  const peakDays = useMemo(() => {
    let peakRevenueDay = dailyTimelineData[0];
    let peakVolumeDay = dailyTimelineData[0];

    for (const d of dailyTimelineData) {
      if (!peakRevenueDay || d.revenue > peakRevenueDay.revenue) peakRevenueDay = d;
      if (!peakVolumeDay || d.portions > peakVolumeDay.portions) peakVolumeDay = d;
    }

    return { peakRevenueDay, peakVolumeDay };
  }, [dailyTimelineData]);

  // Thống kê Phân bổ theo Danh mục Món ăn
  const categoryStats = useMemo(() => {
    const map = new Map<string, { category: string; portions: number; revenue: number }>();
    let totalCatRevenue = 0;
    let totalCatPortions = 0;

    for (const o of periodFilteredOrders) {
      const items = getOrderDisplayItems(o, menu);
      if (items && items.length > 0) {
        for (const it of items) {
          const cat = it.category || 'Cơm trưa & Món chính';
          const rev = (it.price || 35000) * (it.quantity || 1);
          const qty = it.quantity || 1;

          const curr = map.get(cat) || { category: cat, portions: 0, revenue: 0 };
          curr.portions += qty;
          curr.revenue += rev;
          map.set(cat, curr);

          totalCatRevenue += rev;
          totalCatPortions += qty;
        }
      }
    }

    return Array.from(map.values())
      .map((c) => ({
        ...c,
        revenuePct: totalCatRevenue > 0 ? Math.round((c.revenue / totalCatRevenue) * 100) : 0,
        portionsPct: totalCatPortions > 0 ? Math.round((c.portions / totalCatPortions) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [periodFilteredOrders, menu]);

  // Top Món Ăn Bán Chạy Nhất (Best Sellers)
  const topSellingDishes = useMemo(() => {
    const map = new Map<string, {
      name: string;
      category: string;
      price: number;
      portions: number;
      revenue: number;
      imageUrl?: string;
    }>();

    for (const o of periodFilteredOrders) {
      const items = getOrderDisplayItems(o, menu);
      if (items && items.length > 0) {
        for (const it of items) {
          const name = it.name || 'Suất ăn Căn tin';
          const curr = map.get(name) || {
            name,
            category: it.category || 'Món chính',
            price: it.price || 35000,
            portions: 0,
            revenue: 0,
            imageUrl: it.imageUrl,
          };
          curr.portions += it.quantity || 1;
          curr.revenue += (it.price || 35000) * (it.quantity || 1);
          map.set(name, curr);
        }
      }
    }

    const list = Array.from(map.values()).sort((a, b) => b.portions - a.portions);
    const maxPortions = list.length > 0 ? list[0].portions : 1;

    return list.slice(0, 8).map((d) => ({
      ...d,
      relativeWidth: Math.max(12, Math.round((d.portions / maxPortions) * 100)),
    }));
  }, [periodFilteredOrders, menu]);

  // =========================================================================
  // PHÂN HỆ ĐỐI SOÁT HÀNG NGÀY CHO TEAM KẾ TOÁN (RECONCILIATION ENGINE)
  // =========================================================================

  // Lấy danh sách ngày có đơn để làm quick chips chọn ngày
  const availableOrderDates = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      const d = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
      if (d) set.add(d);
    }
    const arr = Array.from(set).sort().reverse();
    return arr;
  }, [orders]);

  // Đơn hàng trong ngày đối soát được chọn
  const reconDateOrders = useMemo(() => {
    return orders.filter((o) => {
      if (reconDateFilter === 'all') return o.status !== 'cancelled';
      const d = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
      return d === reconDateFilter && o.status !== 'cancelled';
    });
  }, [orders, reconDateFilter]);

  // Lọc chi tiết theo tìm kiếm, phương thức thanh toán, loại khách hàng
  const filteredReconOrders = useMemo(() => {
    return reconDateOrders.filter((o) => {
      // Lọc phương thức thanh toán
      if (reconPaymentFilter !== 'all') {
        if (reconPaymentFilter === 'wallet' && o.paymentMethod && o.paymentMethod !== 'wallet') return false;
        if (reconPaymentFilter === 'bank_transfer' && o.paymentMethod !== 'bank_transfer') return false;
        if (reconPaymentFilter === 'cash' && o.paymentMethod !== 'cash') return false;
      }

      // Lọc loại khách
      const isGuest = o.isGuest || !o.userId || o.userId.startsWith('guest_') || (o.userName && o.userName.includes('Khách'));
      if (reconCustomerType === 'staff' && isGuest) return false;
      if (reconCustomerType === 'guest' && !isGuest) return false;

      // Tìm kiếm từ khóa
      if (reconSearch.trim()) {
        const q = reconSearch.toLowerCase().trim();
        const code = (o.orderCode || o.id || '').toLowerCase();
        const name = (o.userName || o.guestName || '').toLowerCase();
        const phone = (o.userPhone || o.guestPhone || '').toLowerCase();
        const dept = (o.userDepartment || '').toLowerCase();
        const note = (o.note || o.notes || '').toLowerCase();

        const items = getOrderDisplayItems(o, menu);
        const matchItem = items.some((it) => it.name.toLowerCase().includes(q));

        return code.includes(q) || name.includes(q) || phone.includes(q) || dept.includes(q) || note.includes(q) || matchItem;
      }

      return true;
    });
  }, [reconDateOrders, reconPaymentFilter, reconCustomerType, reconSearch, menu]);

  // Thống kê nhanh Dải Đối Soát (Reconciliation Strip Summary)
  const reconSummary = useMemo(() => {
    const totalOrdersCount = filteredReconOrders.length;
    let totalRevenue = 0;
    let totalPortions = 0;
    let walletTotal = 0;
    let cashBankTotal = 0;
    let paidTotal = 0;
    let pendingTotal = 0;
    let staffOrders = 0;
    let guestOrders = 0;

    for (const o of filteredReconOrders) {
      const amt = o.totalAmount || 0;
      totalRevenue += amt;

      if (o.paymentMethod === 'cash' || o.paymentMethod === 'bank_transfer') {
        cashBankTotal += amt;
      } else {
        walletTotal += amt;
      }

      if (o.paymentStatus === 'pending') {
        pendingTotal += amt;
      } else {
        paidTotal += amt;
      }

      const isGuest = o.isGuest || !o.userId || o.userId.startsWith('guest_') || (o.userName && o.userName.includes('Khách'));
      if (isGuest) guestOrders++;
      else staffOrders++;

      const items = getOrderDisplayItems(o, menu);
      totalPortions += items && items.length > 0 ? items.reduce((s, it) => s + (it.quantity || 1), 0) : 1;
    }

    return {
      totalOrdersCount,
      totalRevenue,
      totalPortions,
      walletTotal,
      cashBankTotal,
      paidTotal,
      pendingTotal,
      staffOrders,
      guestOrders,
      aov: totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0,
    };
  }, [filteredReconOrders, menu]);

  // Dữ liệu gom nhóm theo từng Khách hàng cho Chế độ 2
  const reconGroupedByCustomer = useMemo(() => {
    const map = new Map<string, {
      customerKey: string;
      customerName: string;
      customerPhone: string;
      customerDept: string;
      isGuest: boolean;
      orders: Order[];
      totalBill: number;
      totalPortions: number;
      itemsList: Map<string, { name: string; qty: number; price: number; category: string }>;
      paymentMethods: Set<string>;
      paymentStatus: 'paid' | 'pending' | 'mixed';
    }>();

    for (const o of filteredReconOrders) {
      const isGuest = Boolean(o.isGuest || !o.userId || o.userId.startsWith('guest_') || (o.userName && o.userName.includes('Khách')));
      const customerName = o.userName || o.guestName || 'Khách hàng';
      const customerPhone = o.userPhone || o.guestPhone || '';
      const customerDept = o.userDepartment || (isGuest ? 'Khách tự do' : 'Cán bộ');
      const customerKey = `${customerName}_${customerPhone || customerDept}`;

      const curr = map.get(customerKey) || {
        customerKey,
        customerName,
        customerPhone,
        customerDept,
        isGuest,
        orders: [] as Order[],
        totalBill: 0,
        totalPortions: 0,
        itemsList: new Map<string, { name: string; qty: number; price: number; category: string }>(),
        paymentMethods: new Set<string>(),
        paymentStatus: 'paid' as 'paid' | 'pending' | 'mixed',
      };

      curr.orders.push(o);
      curr.totalBill += o.totalAmount || 0;
      if (o.paymentMethod) curr.paymentMethods.add(o.paymentMethod);
      if (o.paymentStatus === 'pending') curr.paymentStatus = 'pending';

      const items = getOrderDisplayItems(o, menu);
      if (items && items.length > 0) {
        for (const it of items) {
          curr.totalPortions += it.quantity || 1;
          const exist = curr.itemsList.get(it.name) || {
            name: it.name,
            qty: 0,
            price: it.price || 35000,
            category: it.category || 'Món chính',
          };
          exist.qty += it.quantity || 1;
          curr.itemsList.set(it.name, exist);
        }
      } else {
        curr.totalPortions += 1;
        const exist = curr.itemsList.get('Suất ăn Căn tin') || {
          name: 'Suất ăn Căn tin',
          qty: 0,
          price: o.totalAmount || 35000,
          category: 'Món chính',
        };
        exist.qty += 1;
        curr.itemsList.set('Suất ăn Căn tin', exist);
      }

      map.set(customerKey, curr);
    }

    return Array.from(map.values()).sort((a, b) => b.totalBill - a.totalBill);
  }, [filteredReconOrders, menu]);

  // Hàm kích hoạt Xuất Excel đối soát cho kế toán
  const handleExportAccountingExcel = () => {
    exportAccountingReconciliationToExcel(
      filteredReconOrders,
      menu,
      reconDateFilter,
      siteName
    );
  };

  return (
    <div className="space-y-6">
      {/* ================= 1. HEADER & PERIOD FILTER ================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
                <BarChart3 className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Trung tâm Phân tích Doanh thu & Báo cáo Đối soát Kế toán
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Chuyên sâu số liệu kinh doanh, sản lượng bán ra theo ngày & Bảng đối soát chi tiết từng đơn, từng món, từng khách hàng
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportAccountingExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition min-h-[38px]"
              title="Xuất trọn bộ File Excel đa sheet chuẩn kế toán (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Báo cáo Kế toán (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Dải chọn khoảng thời gian phân tích */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === 'today'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setPeriod('7days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === '7days'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 ngày gần nhất
            </button>
            <button
              onClick={() => setPeriod('14days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === '14days'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              14 ngày
            </button>
            <button
              onClick={() => setPeriod('30days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === '30days'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 ngày
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả thời gian
            </button>
            <button
              onClick={() => setPeriod('custom')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === 'custom'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tùy chọn ngày
            </button>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-slate-400">đến</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* ================= 2. EXECUTIVE KPI CARDS ================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {/* Doanh thu hợp lệ */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span className="font-semibold">Doanh thu kinh doanh</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight">
            {formatVnd(kpiData.totalRevenue)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Ví Căn tin:</span>
              <span className="font-bold text-slate-700">{formatVnd(kpiData.walletRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span>CK / Tiền mặt:</span>
              <span className="font-bold text-slate-700">{formatVnd(kpiData.cashBankRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Tổng số đơn hàng */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span className="font-semibold">Tổng số đơn hàng</span>
            <Receipt className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {kpiData.totalOrders}{' '}
            <span className="text-xs font-semibold text-slate-500 font-normal">đơn</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Đã hoàn tất:</span>
              <span className="font-bold text-emerald-600">{kpiData.completedOrders} đơn</span>
            </div>
            <div className="flex justify-between">
              <span>Tỷ lệ hoàn thành:</span>
              <span className="font-bold text-indigo-600">{kpiData.completionRate}%</span>
            </div>
          </div>
        </div>

        {/* Tổng suất ăn bán ra */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span className="font-semibold">Sản lượng bán ra</span>
            <UtensilsCrossed className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {kpiData.totalPortions}{' '}
            <span className="text-xs font-semibold text-slate-500 font-normal">suất</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
            <div className="flex justify-between">
              <span>🍽️ Tại Căn tin:</span>
              <span className="font-bold text-slate-700">{kpiData.dineInCount} đơn</span>
            </div>
            <div className="flex justify-between">
              <span>🚚 Giao phòng:</span>
              <span className="font-bold text-slate-700">{kpiData.roomDeliveryCount} đơn</span>
            </div>
          </div>
        </div>

        {/* Giá trị đơn TB (AOV) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span className="font-semibold">Giá trị đơn TB (AOV)</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {formatVnd(kpiData.aov)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Món TB / đơn:</span>
              <span className="font-bold text-slate-700">{kpiData.avgPortionsPerOrder} món</span>
            </div>
            <div className="flex justify-between">
              <span>Đơn lớn nhất:</span>
              <span className="font-bold text-slate-700">{formatVnd(kpiData.maxOrderAmount)}</span>
            </div>
          </div>
        </div>

        {/* Khách hàng tham gia */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs col-span-2 md:col-span-1 xl:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span className="font-semibold">Khách hàng đặt món</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {kpiData.uniqueCustomersCount}{' '}
            <span className="text-xs font-semibold text-slate-500 font-normal">người</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Chi tiêu TB / khách:</span>
              <span className="font-bold text-purple-700">{formatVnd(kpiData.arpu)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tần suất đặt:</span>
              <span className="font-bold text-slate-700">
                {kpiData.uniqueCustomersCount > 0
                  ? (kpiData.totalOrders / kpiData.uniqueCustomersCount).toFixed(1) + ' đơn/người'
                  : '0'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= 3. CHARTS SECTION ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHART 1: XU HƯỚNG DOANH THU & SẢN LƯỢNG HẰNG NGÀY (2 CỘT RỘNG) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <span>Biểu đồ Doanh thu & Sản lượng Suất ăn hằng ngày</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Rà soát xu hướng biến động doanh thu và số lượng theo từng ngày phục vụ
                </p>
              </div>

              {/* Bộ chuyển chế độ hiển thị biểu đồ */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  onClick={() => setChartMode('combo')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    chartMode === 'combo' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Kết hợp (Cả 2)
                </button>
                <button
                  onClick={() => setChartMode('revenue')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    chartMode === 'revenue' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Doanh thu (VNĐ)
                </button>
                <button
                  onClick={() => setChartMode('volume')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    chartMode === 'volume' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Sản lượng (Suất)
                </button>
              </div>
            </div>

            {/* Thông tin đỉnh điểm (Highlights) */}
            {peakDays.peakRevenueDay && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-700">Điểm sáng kinh doanh:</span>
                <span>
                  Đỉnh doanh thu ngày{' '}
                  <strong className="text-emerald-700">{peakDays.peakRevenueDay.date}</strong> (
                  {formatVnd(peakDays.peakRevenueDay.revenue)})
                </span>
                <span>·</span>
                <span>
                  Bán nhiều suất nhất ngày{' '}
                  <strong className="text-amber-700">{peakDays.peakVolumeDay.date}</strong> (
                  {peakDays.peakVolumeDay.portions} suất)
                </span>
                <span className="text-[11px] text-indigo-600 ml-auto font-medium cursor-pointer hover:underline" onClick={() => setReconDateFilter(peakDays.peakRevenueDay.date)}>
                  👉 Nhấp để đối soát ngày này
                </span>
              </div>
            )}

            {/* SVG Interactive Chart Component */}
            <div className="mt-4 w-full h-[260px] relative">
              {dailyTimelineData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <BarChart3 className="w-8 h-8 text-slate-300 mb-2" />
                  <span>Không có dữ liệu đơn hàng trong khoảng thời gian này</span>
                </div>
              ) : (
                (() => {
                  const maxRev = Math.max(...dailyTimelineData.map((d) => d.revenue), 100000);
                  const maxQty = Math.max(...dailyTimelineData.map((d) => d.portions), 10);
                  const chartHeight = 200;
                  const chartWidth = 720;
                  const padLeft = 40;
                  const padRight = 30;
                  const availableWidth = chartWidth - padLeft - padRight;
                  const colWidth = availableWidth / dailyTimelineData.length;
                  const barWidth = Math.min(colWidth * 0.45, 36);

                  // Tạo mảng điểm polyline cho Quantity
                  const linePoints = dailyTimelineData.map((d, idx) => {
                    const cx = padLeft + idx * colWidth + colWidth / 2;
                    const cy = chartHeight - (d.portions / maxQty) * (chartHeight - 40) - 20;
                    return `${cx},${cy}`;
                  }).join(' ');

                  return (
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight + 45}`}
                      className="w-full h-full overflow-visible select-none"
                    >
                      {/* Gridlines */}
                      <line x1={padLeft} y1={20} x2={chartWidth - padRight} y2={20} stroke="#f1f5f9" strokeDasharray="4 4" />
                      <line x1={padLeft} y1={chartHeight / 2} x2={chartWidth - padRight} y2={chartHeight / 2} stroke="#f1f5f9" strokeDasharray="4 4" />
                      <line x1={padLeft} y1={chartHeight} x2={chartWidth - padRight} y2={chartHeight} stroke="#cbd5e1" />

                      {/* Revenue Bars */}
                      {(chartMode === 'combo' || chartMode === 'revenue') &&
                        dailyTimelineData.map((d, idx) => {
                          const barH = (d.revenue / maxRev) * (chartHeight - 35);
                          const x = padLeft + idx * colWidth + colWidth / 2 - barWidth / 2;
                          const y = chartHeight - barH;
                          const isSelected = reconDateFilter === d.date;

                          return (
                            <g
                              key={`bar-${d.date}`}
                              className="cursor-pointer group"
                              onClick={() => setReconDateFilter(d.date)}
                            >
                              <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barH}
                                rx={4}
                                className={`transition-all duration-200 ${
                                  isSelected
                                    ? 'fill-indigo-600'
                                    : 'fill-emerald-500 hover:fill-emerald-600'
                                }`}
                              />
                            </g>
                          );
                        })}

                      {/* Line & Dots for Volume */}
                      {(chartMode === 'combo' || chartMode === 'volume') && (
                        <>
                          <polyline
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth={chartMode === 'volume' ? 3.5 : 2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={linePoints}
                          />
                          {dailyTimelineData.map((d, idx) => {
                            const cx = padLeft + idx * colWidth + colWidth / 2;
                            const cy = chartHeight - (d.portions / maxQty) * (chartHeight - 40) - 20;
                            const isSelected = reconDateFilter === d.date;

                            return (
                              <g
                                key={`dot-${d.date}`}
                                className="cursor-pointer"
                                onClick={() => setReconDateFilter(d.date)}
                              >
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isSelected ? 6 : 4}
                                  fill="#ffffff"
                                  stroke="#f59e0b"
                                  strokeWidth={isSelected ? 3 : 2}
                                  className="transition-all hover:scale-125"
                                />
                                {chartMode === 'volume' && (
                                  <text
                                    x={cx}
                                    y={cy - 9}
                                    textAnchor="middle"
                                    className="text-[10px] font-bold fill-amber-800"
                                  >
                                    {d.portions}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </>
                      )}

                      {/* X Axis Labels */}
                      {dailyTimelineData.map((d, idx) => {
                        const cx = padLeft + idx * colWidth + colWidth / 2;
                        const label = d.date.split('-').slice(1).reverse().join('/');
                        const isSelected = reconDateFilter === d.date;

                        return (
                          <g
                            key={`lbl-${d.date}`}
                            className="cursor-pointer"
                            onClick={() => setReconDateFilter(d.date)}
                          >
                            <text
                              x={cx}
                              y={chartHeight + 20}
                              textAnchor="middle"
                              className={`text-[10px] font-mono transition ${
                                isSelected
                                  ? 'font-extrabold fill-indigo-700 text-xs'
                                  : 'fill-slate-500 hover:fill-slate-900'
                              }`}
                            >
                              {label}
                            </text>
                            {isSelected && (
                              <circle cx={cx} cy={chartHeight + 30} r={2.5} fill="#4f46e5" />
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()
              )}
            </div>
          </div>

          {/* Chú giải biểu đồ & hướng dẫn */}
          <div className="mt-2 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
                <span>Doanh thu ngày (Cột VNĐ)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1 rounded-full bg-amber-500 inline-block" />
                <span>Sản lượng suất ăn (Đường Suất)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                <span>Ngày đang chọn đối soát</span>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 italic">
              💡 Bấm vào bất kỳ cột ngày nào để tự động xem bảng đối soát ngày đó
            </span>
          </div>
        </div>

        {/* CHART 2: CƠ CẤU DANH MỤC & TOP BEST SELLERS (1 CỘT BÊN PHẢI) */}
        <div className="space-y-6">
          {/* Phân bổ Danh mục Món ăn */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-purple-600" />
                <span>Cơ cấu theo Danh mục Món</span>
              </h3>
              <span className="text-xs text-slate-400">Tỷ trọng</span>
            </div>

            <div className="mt-3 space-y-3">
              {categoryStats.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Chưa có dữ liệu danh mục</p>
              ) : (
                categoryStats.map((cat, i) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-800">{cat.category}</span>
                      <span className="font-mono text-slate-500">
                        {cat.portions} suất ({cat.portionsPct}%) · <strong>{formatVnd(cat.revenue)}</strong>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          i === 0
                            ? 'bg-indigo-600'
                            : i === 1
                            ? 'bg-emerald-500'
                            : i === 2
                            ? 'bg-amber-500'
                            : 'bg-teal-500'
                        }`}
                        style={{ width: `${Math.max(5, cat.revenuePct)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Món Ăn Bán Chạy Nhất */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Top Món Bán Chạy Nhất</span>
              </h3>
              <span className="text-xs text-slate-400">Xếp hạng sản lượng</span>
            </div>

            <div className="mt-3 space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {topSellingDishes.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Chưa có món nào bán ra</p>
              ) : (
                topSellingDishes.map((dish, idx) => (
                  <div
                    key={dish.name}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                          idx === 0
                            ? 'bg-amber-400 text-amber-950 font-black'
                            : idx === 1
                            ? 'bg-slate-300 text-slate-800'
                            : idx === 2
                            ? 'bg-amber-200 text-amber-900'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <p className="font-bold text-slate-900 truncate">{dish.name}</p>
                        <p className="text-[10px] text-slate-400">{formatVnd(dish.price)} / suất</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <p className="font-black text-indigo-700">{dish.portions} suất</p>
                      <p className="text-[10px] text-slate-500">{formatVnd(dish.revenue)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. PHÂN HỆ ĐỐI SOÁT HÀNG NGÀY CHO TEAM KẾ TOÁN (ACCOUNTING RECONCILIATION) */}
      {/* ========================================================================= */}
      <div className="bg-white border-2 border-indigo-100 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
        {/* Tiêu đề Phân hệ Đối soát */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-emerald-100 text-emerald-800">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                Bảng Đối Soát Hàng Ngày Dành Cho Kế Toán & Thu Ngân
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tra cứu chính xác: Hôm nay bán bao nhiêu đơn, đơn gồm những món gì, giá từng món, số lượng & tổng bill theo ngày, theo từng khách hàng
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportAccountingExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
              title="Xuất bảng đối soát ra file Excel có định dạng chuyên nghiệp"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel Đối soát Ngày {reconDateFilter === 'all' ? 'Tất cả' : reconDateFilter}</span>
            </button>
          </div>
        </div>

        {/* BỘ LỌC NGÀY ĐỐI SOÁT (QUICK SELECTOR) */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Chọn Ngày đối soát:</span>
            </span>

            <button
              onClick={() => setReconDateFilter(todayStr)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                reconDateFilter === todayStr
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Hôm nay ({todayStr})
            </button>

            <button
              onClick={() => setReconDateFilter(tomorrowStr)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                reconDateFilter === tomorrowStr
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Ngày mai ({tomorrowStr})
            </button>

            {availableOrderDates
              .filter((d) => d !== todayStr && d !== tomorrowStr)
              .slice(0, 3)
              .map((d) => (
                <button
                  key={d}
                  onClick={() => setReconDateFilter(d)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer font-mono ${
                    reconDateFilter === d
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {d}
                </button>
              ))}

            <button
              onClick={() => setReconDateFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                reconDateFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Toàn bộ các ngày
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Hoặc ngày khác:</span>
            <input
              type="date"
              value={reconDateFilter === 'all' ? '' : reconDateFilter}
              onChange={(e) => {
                if (e.target.value) setReconDateFilter(e.target.value);
              }}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* DẢI TÓM TẮT KẾT QUẢ ĐỐI SOÁT TRONG NGÀY (DAILY SUMMARY STRIP) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-indigo-50/60 border border-indigo-200/70 p-3.5 rounded-xl">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-slate-500">Số lượng đơn hàng</p>
            <p className="text-lg sm:text-xl font-black text-indigo-900">
              {reconSummary.totalOrdersCount}{' '}
              <span className="text-xs font-normal text-slate-600">
                ({reconSummary.staffOrders} Cán bộ · {reconSummary.guestOrders} Khách lẻ)
              </span>
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-slate-500">Tổng số món / suất bán ra</p>
            <p className="text-lg sm:text-xl font-black text-amber-700">
              {reconSummary.totalPortions}{' '}
              <span className="text-xs font-normal text-slate-600">suất ăn & uống</span>
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-slate-500">Tổng bill theo ngày</p>
            <p className="text-lg sm:text-xl font-black text-emerald-700">
              {formatVnd(reconSummary.totalRevenue)}
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-slate-500">Trạng thái dòng tiền</p>
            <p className="text-xs font-bold text-slate-800">
              Đã thu: <span className="text-emerald-700">{formatVnd(reconSummary.paidTotal)}</span>
            </p>
            {reconSummary.pendingTotal > 0 && (
              <p className="text-[11px] font-bold text-rose-600">
                Chờ thu/đối soát: {formatVnd(reconSummary.pendingTotal)}
              </p>
            )}
          </div>
        </div>

        {/* BỘ LỌC CHI TIẾT & CHUYỂN ĐỔI CHẾ ĐỘ XEM */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-1">
          {/* Chuyển đổi 2 chế độ đối soát */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setReconViewMode('items')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                reconViewMode === 'items'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Chế độ 1: Chi tiết từng Đơn & Món ăn</span>
            </button>
            <button
              onClick={() => setReconViewMode('customers')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                reconViewMode === 'customers'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Chế độ 2: Tổng hợp theo Khách hàng</span>
            </button>
          </div>

          {/* Ô tìm kiếm & lọc phương thức */}
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên khách, SĐT, mã đơn, món ăn..."
                value={reconSearch}
                onChange={(e) => setReconSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={reconPaymentFilter}
              onChange={(e: any) => setReconPaymentFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="all">Tất cả thanh toán</option>
              <option value="wallet">Ví Căn tin</option>
              <option value="bank_transfer">Chuyển khoản VietQR</option>
              <option value="cash">Tiền mặt</option>
            </select>

            <select
              value={reconCustomerType}
              onChange={(e: any) => setReconCustomerType(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="all">Tất cả khách</option>
              <option value="staff">Chỉ Cán bộ / Giáo viên</option>
              <option value="guest">Chỉ Khách lẻ / Vãng lai</option>
            </select>
          </div>
        </div>

        {/* ================= CHẾ ĐỘ 1: CHI TIẾT TỪNG ĐƠN & TỪNG MÓN ĂN ================= */}
        {reconViewMode === 'items' && (
          <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-[15%]">Mã đơn & Thời gian</th>
                  <th className="py-2.5 px-3 w-[22%]">Khách hàng / Cán bộ</th>
                  <th className="py-2.5 px-3 w-[35%]">
                    Danh sách món ăn (Tên món · Giá từng món · Số lượng)
                  </th>
                  <th className="py-2.5 px-3 w-[14%] text-right">Tổng bill đơn</th>
                  <th className="py-2.5 px-3 w-[14%] text-center">Thanh toán & Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredReconOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Không tìm thấy đơn hàng nào phù hợp với bộ lọc đối soát
                    </td>
                  </tr>
                ) : (
                  filteredReconOrders.map((o) => {
                    const items = getOrderDisplayItems(o, menu);
                    const isGuest = o.isGuest || !o.userId || o.userId.startsWith('guest_') || (o.userName && o.userName.includes('Khách'));
                    const customerName = o.userName || o.guestName || 'Khách hàng';
                    const customerPhone = o.userPhone || o.guestPhone || '';
                    const customerDept = o.userDepartment || (isGuest ? 'Khách tự do' : 'Cán bộ');

                    return (
                      <tr key={o.id} className="hover:bg-slate-50/80 transition">
                        {/* Mã đơn & Thời gian */}
                        <td className="py-3 px-3 align-top space-y-1">
                          <p className="font-mono font-bold text-slate-900 text-xs">
                            #{o.orderCode || o.id.slice(0, 8)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Ngày nhận: <strong className="text-slate-700">{o.targetDate || 'Hôm nay'}</strong>
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Giờ nhận: {o.pickupTime || '11:30'} · {o.deliveryMethod === 'room_delivery' ? '🚚 Giao phòng' : '🍽️ Tại Căn tin'}
                          </p>
                          {o.roomNumber && (
                            <p className="text-[10px] font-bold text-indigo-700">
                              Phòng: {o.roomNumber}
                            </p>
                          )}
                        </td>

                        {/* Khách hàng / Cán bộ */}
                        <td className="py-3 px-3 align-top space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs">{customerName}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                              isGuest ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                            }`}>
                              {isGuest ? 'Khách lẻ' : 'Cán bộ'}
                            </span>
                          </div>
                          {customerPhone && (
                            <p className="text-[11px] font-mono text-slate-500">
                              📞 {customerPhone}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                            🏢 {customerDept}
                          </p>
                        </td>

                        {/* Danh sách từng món: Tên món, Đơn giá, Số lượng, Thành tiền */}
                        <td className="py-3 px-3 align-top">
                          <div className="space-y-1.5">
                            {items && items.length > 0 ? (
                              items.map((it, idx) => {
                                const itemTotal = (it.price || 35000) * (it.quantity || 1);
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-[11px]"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <span className="font-bold text-slate-900">{it.name}</span>
                                      <span className="text-slate-400 text-[10px] ml-1">
                                        ({formatVnd(it.price || 35000)} / suất)
                                      </span>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                        x{it.quantity || 1}
                                      </span>
                                      <span className="font-mono font-bold text-slate-800 ml-2">
                                        {formatVnd(itemTotal)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-[11px]">
                                <span className="font-bold text-slate-900">Suất ăn Căn tin</span>
                                <span className="font-mono font-bold text-slate-800">
                                  {formatVnd(o.totalAmount)}
                                </span>
                              </div>
                            )}
                            {(o.note || o.notes) && (
                              <p className="text-[10px] text-amber-700 bg-amber-50/60 px-2 py-0.5 rounded italic">
                                📝 {o.note || o.notes}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Tổng bill đơn */}
                        <td className="py-3 px-3 align-top text-right">
                          <p className="text-sm font-black text-emerald-700 tracking-tight">
                            {formatVnd(o.totalAmount)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {items.reduce((s, it) => s + (it.quantity || 1), 0)} món/suất
                          </p>
                        </td>

                        {/* Thanh toán & Trạng thái */}
                        <td className="py-3 px-3 align-top text-center space-y-1">
                          <div>
                            {o.paymentMethod === 'bank_transfer' ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                VietQR Chuyển khoản
                              </span>
                            ) : o.paymentMethod === 'cash' ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Tiền mặt
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                Ví Căn tin
                              </span>
                            )}
                          </div>

                          <div>
                            {o.paymentStatus === 'pending' ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                ⏳ Chờ xác nhận TT
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ✓ Đã thanh toán
                              </span>
                            )}
                          </div>

                          <p className="text-[10px] text-slate-400">
                            {o.status === 'completed'
                              ? 'Đã phục vụ'
                              : o.status === 'preparing'
                              ? 'Đang chuẩn bị'
                              : 'Đã xác nhận'}
                          </p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ================= CHẾ ĐỘ 2: TỔNG HỢP THEO KHÁCH HÀNG ================= */}
        {reconViewMode === 'customers' && (
          <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-[5%] text-center">STT</th>
                  <th className="py-2.5 px-3 w-[24%]">Thông tin Khách hàng / Cán bộ</th>
                  <th className="py-2.5 px-3 w-[10%] text-center">Số đơn</th>
                  <th className="py-2.5 px-3 w-[10%] text-center">Tổng suất</th>
                  <th className="py-2.5 px-3 w-[33%]">Chi tiết các món đã đặt & đơn giá</th>
                  <th className="py-2.5 px-3 w-[18%] text-right">Tổng bill khách hàng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {reconGroupedByCustomer.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Không có dữ liệu khách hàng nào cho tiêu chí đã chọn
                    </td>
                  </tr>
                ) : (
                  reconGroupedByCustomer.map((cust, idx) => {
                    const isExpanded = expandedCustomerKey === cust.customerKey;
                    const itemsArray = Array.from(cust.itemsList.values());

                    return (
                      <tr key={cust.customerKey} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3 align-top text-center text-slate-400 font-mono">
                          {idx + 1}
                        </td>

                        <td className="py-3 px-3 align-top space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs">
                              {cust.customerName}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                              cust.isGuest ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                            }`}>
                              {cust.isGuest ? 'Khách lẻ' : 'Cán bộ'}
                            </span>
                          </div>
                          {cust.customerPhone && (
                            <p className="text-[11px] font-mono text-slate-500">
                              📞 {cust.customerPhone}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500">
                            🏢 {cust.customerDept}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Phương thức: {Array.from(cust.paymentMethods).map((m) =>
                              m === 'bank_transfer' ? 'Chuyển khoản' : m === 'cash' ? 'Tiền mặt' : 'Ví Căn tin'
                            ).join(', ')}
                          </p>
                        </td>

                        <td className="py-3 px-3 align-top text-center">
                          <span className="font-extrabold text-slate-800 text-xs bg-slate-100 px-2 py-0.5 rounded">
                            {cust.orders.length} đơn
                          </span>
                        </td>

                        <td className="py-3 px-3 align-top text-center">
                          <span className="font-extrabold text-amber-700 text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            {cust.totalPortions} suất
                          </span>
                        </td>

                        {/* Chi tiết từng món khách đã đặt */}
                        <td className="py-3 px-3 align-top">
                          <div className="space-y-1">
                            {itemsArray.map((it, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between text-[11px] bg-slate-50/80 px-2 py-1 rounded"
                              >
                                <span className="font-semibold text-slate-800">
                                  {it.name} ({formatVnd(it.price)})
                                </span>
                                <span className="font-mono font-bold text-slate-700">
                                  x{it.qty} = {formatVnd(it.price * it.qty)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Nút xem chi tiết từng mã đơn của khách hàng này */}
                          <button
                            onClick={() =>
                              setExpandedCustomerKey(isExpanded ? null : cust.customerKey)
                            }
                            className="mt-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isExpanded ? 'Ẩn danh sách mã đơn' : `Xem ${cust.orders.length} mã đơn chi tiết`}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 p-2 bg-indigo-50/50 rounded-lg space-y-1 border border-indigo-100 text-[10px]">
                              {cust.orders.map((ord) => (
                                <div key={ord.id} className="flex justify-between items-center text-slate-600">
                                  <span>
                                    #{ord.orderCode || ord.id.slice(0, 8)} · {ord.pickupTime || '11:30'} · {ord.deliveryMethod === 'room_delivery' ? 'Giao phòng' : 'Tại căn tin'}
                                  </span>
                                  <span className="font-bold text-slate-900 font-mono">
                                    {formatVnd(ord.totalAmount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Tổng bill khách hàng */}
                        <td className="py-3 px-3 align-top text-right">
                          <p className="text-base font-black text-emerald-700 tracking-tight">
                            {formatVnd(cust.totalBill)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {cust.paymentStatus === 'pending' ? (
                              <span className="text-rose-600 font-bold">Chờ TT</span>
                            ) : (
                              <span className="text-emerald-600 font-bold">✓ Đã thanh toán</span>
                            )}
                          </p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
