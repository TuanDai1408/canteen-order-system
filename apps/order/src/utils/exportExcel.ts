import * as XLSX from 'xlsx';
import type { Order, UserProfile, MenuItem } from '@canteen/shared';
import { formatVnd, getOrderDisplayItems } from '@canteen/shared';

/**
 * Xuất danh sách đơn hàng ra file Excel (.xlsx) chuẩn tiếng Việt có dấu
 */
export function exportOrdersToExcel(orders: Order[], filenamePrefix = 'Danh_sach_don_hang_Com_ngon_Siba'): void {
  if (!orders || orders.length === 0) {
    alert('Không có dữ liệu đơn hàng để xuất Excel.');
    return;
  }

  const rows = orders.map((o, idx) => {
    const items = getOrderDisplayItems(o);
    const itemsSummary = items
      .map((it) => `${it.quantity}x ${it.name} (${formatVnd(it.price)})`)
      .join(', ');
    const totalDishes = items.reduce((sum, it) => sum + (it.quantity || 1), 0);

    const statusMap: Record<string, string> = {
      confirmed: 'Chờ nấu (Đã xác nhận)',
      preparing: 'Đang nấu / Chuẩn bị',
      completed: 'Đã hoàn tất',
      cancelled: 'Đã hủy',
    };

    const deliveryMap: Record<string, string> = {
      dine_in: 'Ăn tại Căn tin',
      room_delivery: 'Giao tận phòng',
    };

    return {
      'STT': idx + 1,
      'Mã đơn hàng': o.orderCode || o.id,
      'Thời gian đặt': o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '',
      'Ngày nhận suất ăn': o.targetDate || '',
      'Giờ nhận': o.pickupTime || '11:30',
      'Họ và tên Cán bộ': o.userName || 'Cán bộ',
      'Số điện thoại': o.userPhone || '',
      'Phòng ban / Đơn vị': o.userDepartment || '',
      'Hình thức nhận': deliveryMap[o.deliveryMethod] || o.deliveryMethod || 'Tại Căn tin',
      'Phòng nhận hàng': o.roomNumber || (o.deliveryMethod === 'dine_in' ? 'Tại Căn tin' : ''),
      'Chi tiết món ăn': itemsSummary,
      'Tổng số suất': totalDishes,
      'Tổng tiền (VNĐ)': o.totalAmount,
      'Trạng thái đơn': statusMap[o.status] || o.status,
      'Thanh toán': 'Đã thanh toán qua Ví Căn tin',
      'Đơn ngoại lệ': o.isExceptionOrder || o.exceptionTokenUsed ? 'Có (Mã QR ngoại lệ)' : 'Không',
      'Mã QR sử dụng': o.exceptionTokenUsed || '',
      'Ghi chú': o.note || o.notes || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Thiết lập độ rộng cột trực quan
  worksheet['!cols'] = [
    { wch: 6 },  // STT
    { wch: 20 }, // Mã đơn
    { wch: 20 }, // Thời gian đặt
    { wch: 16 }, // Ngày nhận
    { wch: 12 }, // Giờ nhận
    { wch: 25 }, // Tên cán bộ
    { wch: 16 }, // SĐT
    { wch: 22 }, // Phòng ban
    { wch: 18 }, // Hình thức
    { wch: 18 }, // Phòng nhận
    { wch: 45 }, // Chi tiết món
    { wch: 14 }, // Tổng suất
    { wch: 18 }, // Tổng tiền
    { wch: 22 }, // Trạng thái
    { wch: 25 }, // Thanh toán
    { wch: 22 }, // Ngoại lệ
    { wch: 18 }, // Mã QR
    { wch: 30 }, // Ghi chú
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách đơn hàng');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `${filenamePrefix}_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

/**
 * Xuất danh sách Cán bộ & Ví ra file Excel (.xlsx) chuẩn tiếng Việt
 */
export function exportUsersToExcel(users: UserProfile[], filenamePrefix = 'Danh_sach_Can_bo_va_Vi_Canteen'): void {
  if (!users || users.length === 0) {
    alert('Không có dữ liệu cán bộ để xuất Excel.');
    return;
  }

  const roleMap: Record<string, string> = {
    admin: 'Quản trị viên Căn tin',
    data_entry: 'Nhân viên Nhập liệu',
    executive: 'Ban Giám hiệu / Quản lý',
    teacher: 'Giáo viên / Cán bộ nhân viên',
  };

  const rows = users.map((u, idx) => {
    return {
      'STT': idx + 1,
      'Họ và tên': u.name,
      'Email': u.email || '',
      'Số điện thoại': u.phoneNumber || '',
      'Phòng ban / Đơn vị': u.department || 'Nhà trường',
      'Phòng làm việc mặc định': u.defaultRoom || '',
      'Vai trò hệ thống': roleMap[u.role] || u.role,
      'Chức danh': u.roleTitle || '',
      'Số dư ví hiện tại (VNĐ)': Number(u.walletBalance || 0),
      'Hạn mức ví tháng (VNĐ)': Number(u.monthlyAllowance || 0),
      'Trạng thái tài khoản': u.isActive === false ? 'Chờ duyệt & nạp ví' : 'Đang hoạt động',
      'Ngày tạo tài khoản': u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Thiết lập độ rộng cột trực quan
  worksheet['!cols'] = [
    { wch: 6 },  // STT
    { wch: 28 }, // Họ và tên
    { wch: 30 }, // Email
    { wch: 16 }, // SĐT
    { wch: 25 }, // Phòng ban
    { wch: 20 }, // Phòng mặc định
    { wch: 25 }, // Vai trò
    { wch: 22 }, // Chức danh
    { wch: 24 }, // Số dư ví
    { wch: 24 }, // Hạn mức tháng
    { wch: 22 }, // Trạng thái
    { wch: 18 }, // Ngày tạo
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách Cán bộ & Ví');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `${filenamePrefix}_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

/**
 * Xuất danh sách thực đơn ra file Excel (.xlsx) chuẩn cấu trúc mẫu import của hệ thống.
 * Cho phép lấy thực đơn từ site này (ví dụ Hùng Vương) để nhập (import) trực tiếp vào site khác (ví dụ G-Group).
 */
export function exportMenuToExcel(
  menuItems: MenuItem[],
  siteName = 'Cơ sở',
  siteCode = 'hung_vuong'
): void {
  if (!menuItems || menuItems.length === 0) {
    alert('Không có món ăn nào trong thực đơn để xuất Excel.');
    return;
  }

  const rows = menuItems.map((item) => ({
    'Tên món ăn (*)': item.name || '',
    'Danh mục': item.category || 'Cơm trưa',
    'Đơn giá (VNĐ)': Number(item.price || 0),
    'Số lượng chuẩn bị': Number(item.preparedStock ?? item.currentStock ?? 50),
    'Mô tả': item.description || '',
    'Link ảnh (tùy chọn)': item.imageUrl || '',
    'Ngày phục vụ (YYYY-MM-DD)': item.forDate || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Thiết lập độ rộng cột trực quan
  worksheet['!cols'] = [
    { wch: 32 }, // Tên món ăn (*)
    { wch: 18 }, // Danh mục
    { wch: 16 }, // Đơn giá (VNĐ)
    { wch: 18 }, // Số lượng chuẩn bị
    { wch: 45 }, // Mô tả
    { wch: 38 }, // Link ảnh (tùy chọn)
    { wch: 24 }, // Ngày phục vụ (YYYY-MM-DD)
  ];

  const workbook = XLSX.utils.book_new();
  const safeSheetName = `Thuc_Don_${(siteCode || 'Canteen').toUpperCase()}`.substring(0, 31);
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `Thuc_Don_${siteCode || 'Canteen'}_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

/**
 * Xuất Báo cáo Đối soát Kế toán hàng ngày & theo kỳ ra file Excel (.xlsx) đa sheet chuẩn nghiệp vụ
 * Sheet 1: Đối soát chi tiết từng đơn & từng món (Món ăn, đơn giá, số lượng, thành tiền, tổng bill)
 * Sheet 2: Bảng tổng hợp bill theo từng khách hàng
 * Sheet 3: Doanh thu & sản lượng theo ngày
 * Sheet 4: Thống kê sản lượng & doanh thu theo món ăn
 */
export function exportAccountingReconciliationToExcel(
  orders: Order[],
  menu: MenuItem[] = [],
  filterDate?: string,
  siteName = 'Canteen'
): void {
  if (!orders || orders.length === 0) {
    alert('Không có dữ liệu đơn hàng để xuất Báo cáo Đối soát Kế toán.');
    return;
  }

  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const targetOrders = validOrders.length > 0 ? validOrders : orders;

  const statusMap: Record<string, string> = {
    confirmed: 'Đã xác nhận (Chờ nấu)',
    preparing: 'Đang nấu / Chuẩn bị',
    ready: 'Đã sẵn sàng',
    completed: 'Đã hoàn tất',
    cancelled: 'Đã hủy',
  };

  const deliveryMap: Record<string, string> = {
    dine_in: 'Ăn tại Căn tin',
    room_delivery: 'Giao tận phòng',
  };

  const paymentMethodMap: Record<string, string> = {
    wallet: 'Ví Căn tin',
    bank_transfer: 'Chuyển khoản VietQR',
    cash: 'Tiền mặt',
  };

  const paymentStatusMap: Record<string, string> = {
    paid: 'Đã thanh toán',
    pending: 'Chờ thanh toán',
    rejected: 'Bị từ chối',
  };

  // 1. SHEET 1: Chi tiết từng món của từng đơn hàng
  const detailRows: any[] = [];
  let itemStt = 1;

  for (const o of targetOrders) {
    const items = getOrderDisplayItems(o, menu);
    const dateStr = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');
    const isGuest = o.isGuest || !o.userId || o.userId.startsWith('guest_') || (o.userName && o.userName.includes('Khách'));
    const customerType = isGuest ? 'Khách lẻ / Vãng lai' : 'Cán bộ / Giáo viên';
    const customerName = o.userName || o.guestName || 'Khách hàng';
    const customerPhone = o.userPhone || o.guestPhone || '';
    const customerDept = o.userDepartment || (isGuest ? 'Khách tự do' : 'Nhà trường');

    if (items && items.length > 0) {
      items.forEach((it, idx) => {
        const itemTotal = (it.price || 0) * (it.quantity || 1);
        detailRows.push({
          'STT': itemStt++,
          'Mã đơn': o.orderCode || o.id,
          'Ngày nhận': dateStr,
          'Giờ nhận': o.pickupTime || '11:30',
          'Thời gian đặt': o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '',
          'Tên Khách hàng': customerName,
          'Số điện thoại': customerPhone,
          'Phòng ban / Đơn vị': customerDept,
          'Phân loại khách': customerType,
          'Tên món ăn': it.name || 'Suất ăn Căn tin',
          'Danh mục': it.category || 'Món chính',
          'Đơn giá (VNĐ)': it.price || 35000,
          'Số lượng': it.quantity || 1,
          'Thành tiền món (VNĐ)': itemTotal,
          'Tổng bill đơn (VNĐ)': o.totalAmount,
          'Hình thức nhận': deliveryMap[o.deliveryMethod] || o.deliveryMethod || 'Tại Căn tin',
          'Phòng nhận': o.roomNumber || (o.deliveryMethod === 'dine_in' ? 'Tại Căn tin' : ''),
          'Phương thức thanh toán': paymentMethodMap[o.paymentMethod || 'wallet'] || o.paymentMethod || 'Ví Căn tin',
          'Trạng thái thanh toán': paymentStatusMap[o.paymentStatus || 'paid'] || o.paymentStatus || 'Đã thanh toán',
          'Trạng thái đơn': statusMap[o.status] || o.status,
          'Ghi chú đơn': o.note || o.notes || '',
        });
      });
    } else {
      detailRows.push({
        'STT': itemStt++,
        'Mã đơn': o.orderCode || o.id,
        'Ngày nhận': dateStr,
        'Giờ nhận': o.pickupTime || '11:30',
        'Thời gian đặt': o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '',
        'Tên Khách hàng': customerName,
        'Số điện thoại': customerPhone,
        'Phòng ban / Đơn vị': customerDept,
        'Phân loại khách': customerType,
        'Tên món ăn': 'Suất ăn Căn tin',
        'Danh mục': 'Món chính',
        'Đơn giá (VNĐ)': o.totalAmount || 35000,
        'Số lượng': 1,
        'Thành tiền món (VNĐ)': o.totalAmount || 35000,
        'Tổng bill đơn (VNĐ)': o.totalAmount,
        'Hình thức nhận': deliveryMap[o.deliveryMethod] || o.deliveryMethod || 'Tại Căn tin',
        'Phòng nhận': o.roomNumber || '',
        'Phương thức thanh toán': paymentMethodMap[o.paymentMethod || 'wallet'] || o.paymentMethod || 'Ví Căn tin',
        'Trạng thái thanh toán': paymentStatusMap[o.paymentStatus || 'paid'] || o.paymentStatus || 'Đã thanh toán',
        'Trạng thái đơn': statusMap[o.status] || o.status,
        'Ghi chú đơn': o.note || o.notes || '',
      });
    }
  }

  // 2. SHEET 2: Tổng hợp theo từng Khách hàng
  const customerMap = new Map<string, {
    customerKey: string;
    customerName: string;
    customerPhone: string;
    customerDept: string;
    customerType: string;
    orderCount: number;
    totalPortions: number;
    itemsSummary: Map<string, { name: string; qty: number; price: number }>;
    totalBill: number;
    paymentMethods: Set<string>;
    dates: Set<string>;
  }>();

  for (const o of targetOrders) {
    const isGuest = o.isGuest || !o.userId || o.userId.startsWith('guest_') || (o.userName && o.userName.includes('Khách'));
    const customerType = isGuest ? 'Khách lẻ / Vãng lai' : 'Cán bộ / Giáo viên';
    const customerName = o.userName || o.guestName || 'Khách hàng';
    const customerPhone = o.userPhone || o.guestPhone || '';
    const customerDept = o.userDepartment || (isGuest ? 'Khách tự do' : 'Nhà trường');
    const customerKey = `${customerName}_${customerPhone || customerDept}`;
    const dateStr = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : '');

    const current = customerMap.get(customerKey) || {
      customerKey,
      customerName,
      customerPhone,
      customerDept,
      customerType,
      orderCount: 0,
      totalPortions: 0,
      itemsSummary: new Map(),
      totalBill: 0,
      paymentMethods: new Set(),
      dates: new Set(),
    };

    current.orderCount += 1;
    current.totalBill += o.totalAmount || 0;
    if (o.paymentMethod) current.paymentMethods.add(paymentMethodMap[o.paymentMethod] || o.paymentMethod);
    if (dateStr) current.dates.add(dateStr);

    const items = getOrderDisplayItems(o, menu);
    if (items && items.length > 0) {
      for (const it of items) {
        current.totalPortions += it.quantity || 1;
        const existingItem = current.itemsSummary.get(it.name) || { name: it.name, qty: 0, price: it.price || 0 };
        existingItem.qty += it.quantity || 1;
        current.itemsSummary.set(it.name, existingItem);
      }
    } else {
      current.totalPortions += 1;
      const existingItem = current.itemsSummary.get('Suất ăn Căn tin') || { name: 'Suất ăn Căn tin', qty: 0, price: o.totalAmount || 35000 };
      existingItem.qty += 1;
      current.itemsSummary.set('Suất ăn Căn tin', existingItem);
    }

    customerMap.set(customerKey, current);
  }

  const customerRows = Array.from(customerMap.values())
    .sort((a, b) => b.totalBill - a.totalBill)
    .map((c, idx) => {
      const itemsListText = Array.from(c.itemsSummary.values())
        .map((it) => `${it.qty}x ${it.name} (${formatVnd(it.price)})`)
        .join('; ');

      return {
        'STT': idx + 1,
        'Họ và tên Khách hàng': c.customerName,
        'Số điện thoại': c.customerPhone,
        'Phòng ban / Đơn vị': c.customerDept,
        'Đối tượng': c.customerType,
        'Số đơn đặt': c.orderCount,
        'Tổng số suất/món': c.totalPortions,
        'Chi tiết các món đã đặt': itemsListText,
        'Tổng bill tích lũy (VNĐ)': c.totalBill,
        'Phương thức thanh toán': Array.from(c.paymentMethods).join(', ') || 'Ví Căn tin',
        'Ngày phát sinh': Array.from(c.dates).sort().join(', '),
      };
    });

  // 3. SHEET 3: Doanh thu & Sản lượng theo ngày
  const dailyMap = new Map<string, {
    date: string;
    orderCount: number;
    totalPortions: number;
    totalRevenue: number;
    walletRevenue: number;
    cashBankRevenue: number;
    dineInPortions: number;
    roomPortions: number;
  }>();

  for (const o of targetOrders) {
    const dateStr = o.targetDate || (o.createdAt ? o.createdAt.split('T')[0] : 'Chưa xác định');
    const curr = dailyMap.get(dateStr) || {
      date: dateStr,
      orderCount: 0,
      totalPortions: 0,
      totalRevenue: 0,
      walletRevenue: 0,
      cashBankRevenue: 0,
      dineInPortions: 0,
      roomPortions: 0,
    };

    curr.orderCount += 1;
    curr.totalRevenue += o.totalAmount || 0;
    if (o.paymentMethod === 'cash' || o.paymentMethod === 'bank_transfer') {
      curr.cashBankRevenue += o.totalAmount || 0;
    } else {
      curr.walletRevenue += o.totalAmount || 0;
    }

    const items = getOrderDisplayItems(o, menu);
    const orderQty = items && items.length > 0 ? items.reduce((s, it) => s + (it.quantity || 1), 0) : 1;
    curr.totalPortions += orderQty;

    if (o.deliveryMethod === 'room_delivery') {
      curr.roomPortions += orderQty;
    } else {
      curr.dineInPortions += orderQty;
    }

    dailyMap.set(dateStr, curr);
  }

  const dailyRows = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d, idx) => ({
      'STT': idx + 1,
      'Ngày': d.date,
      'Tổng số đơn': d.orderCount,
      'Tổng suất bán': d.totalPortions,
      'Tổng doanh thu (VNĐ)': d.totalRevenue,
      'Doanh thu Ví Căn tin (VNĐ)': d.walletRevenue,
      'Doanh thu CK/Tiền mặt (VNĐ)': d.cashBankRevenue,
      'Giá trị đơn TB - AOV (VNĐ)': d.orderCount > 0 ? Math.round(d.totalRevenue / d.orderCount) : 0,
      'Ăn tại chỗ (suất)': d.dineInPortions,
      'Giao phòng (suất)': d.roomPortions,
    }));

  // 4. SHEET 4: Sản lượng & Doanh thu theo từng Món ăn
  const dishSalesMap = new Map<string, {
    name: string;
    category: string;
    price: number;
    totalQty: number;
    totalRevenue: number;
  }>();

  for (const o of targetOrders) {
    const items = getOrderDisplayItems(o, menu);
    if (items && items.length > 0) {
      for (const it of items) {
        const dishName = it.name || 'Suất ăn Căn tin';
        const curr = dishSalesMap.get(dishName) || {
          name: dishName,
          category: it.category || 'Món chính',
          price: it.price || 35000,
          totalQty: 0,
          totalRevenue: 0,
        };
        curr.totalQty += it.quantity || 1;
        curr.totalRevenue += (it.price || 35000) * (it.quantity || 1);
        dishSalesMap.set(dishName, curr);
      }
    }
  }

  const totalAllDishQty = Array.from(dishSalesMap.values()).reduce((s, it) => s + it.totalQty, 0);
  const dishRows = Array.from(dishSalesMap.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .map((d, idx) => ({
      'STT': idx + 1,
      'Tên món ăn': d.name,
      'Danh mục': d.category,
      'Đơn giá (VNĐ)': d.price,
      'Số lượng đã bán (suất)': d.totalQty,
      'Tổng thành tiền (VNĐ)': d.totalRevenue,
      'Tỷ trọng sản lượng (%)': totalAllDishQty > 0 ? `${((d.totalQty / totalAllDishQty) * 100).toFixed(1)}%` : '0%',
    }));

  // Build Workbook
  const workbook = XLSX.utils.book_new();

  // Sheet 1
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  wsDetail['!cols'] = [
    { wch: 6 },  // STT
    { wch: 18 }, // Mã đơn
    { wch: 14 }, // Ngày nhận
    { wch: 10 }, // Giờ nhận
    { wch: 20 }, // Thời gian đặt
    { wch: 24 }, // Tên Khách hàng
    { wch: 15 }, // SĐT
    { wch: 22 }, // Phòng ban
    { wch: 20 }, // Phân loại khách
    { wch: 30 }, // Tên món ăn
    { wch: 16 }, // Danh mục
    { wch: 15 }, // Đơn giá
    { wch: 10 }, // Số lượng
    { wch: 18 }, // Thành tiền món
    { wch: 18 }, // Tổng bill đơn
    { wch: 16 }, // Hình thức nhận
    { wch: 16 }, // Phòng nhận
    { wch: 22 }, // Phương thức TT
    { wch: 18 }, // Trạng thái TT
    { wch: 20 }, // Trạng thái đơn
    { wch: 28 }, // Ghi chú đơn
  ];
  XLSX.utils.book_append_sheet(workbook, wsDetail, '1. Chi tiết Món & Đơn');

  // Sheet 2
  const wsCustomer = XLSX.utils.json_to_sheet(customerRows);
  wsCustomer['!cols'] = [
    { wch: 6 },  // STT
    { wch: 26 }, // Tên Khách hàng
    { wch: 16 }, // SĐT
    { wch: 24 }, // Phòng ban
    { wch: 20 }, // Đối tượng
    { wch: 12 }, // Số đơn đặt
    { wch: 16 }, // Tổng số suất
    { wch: 45 }, // Chi tiết món
    { wch: 24 }, // Tổng bill
    { wch: 24 }, // PT Thanh toán
    { wch: 20 }, // Ngày phát sinh
  ];
  XLSX.utils.book_append_sheet(workbook, wsCustomer, '2. Tổng hợp Khách hàng');

  // Sheet 3
  const wsDaily = XLSX.utils.json_to_sheet(dailyRows);
  wsDaily['!cols'] = [
    { wch: 6 },  // STT
    { wch: 14 }, // Ngày
    { wch: 14 }, // Tổng số đơn
    { wch: 16 }, // Tổng suất bán
    { wch: 22 }, // Tổng doanh thu
    { wch: 22 }, // Doanh thu Ví
    { wch: 24 }, // Doanh thu Tiền mặt/CK
    { wch: 22 }, // AOV
    { wch: 16 }, // Ăn tại chỗ
    { wch: 16 }, // Giao phòng
  ];
  XLSX.utils.book_append_sheet(workbook, wsDaily, '3. Doanh thu theo Ngày');

  // Sheet 4
  const wsDishes = XLSX.utils.json_to_sheet(dishRows);
  wsDishes['!cols'] = [
    { wch: 6 },  // STT
    { wch: 30 }, // Tên món
    { wch: 18 }, // Danh mục
    { wch: 15 }, // Đơn giá
    { wch: 20 }, // Số lượng đã bán
    { wch: 22 }, // Tổng thành tiền
    { wch: 20 }, // Tỷ trọng sản lượng
  ];
  XLSX.utils.book_append_sheet(workbook, wsDishes, '4. Sản lượng từng Món');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const dateTag = filterDate && filterDate !== 'all' ? `_${filterDate}` : '';
  const fileName = `Bao_Cao_Doi_Soat_Ke_Toan_${siteName}${dateTag}_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}


