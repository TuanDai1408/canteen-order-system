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

