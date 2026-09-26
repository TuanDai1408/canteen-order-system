// @ts-ignore
import qz from 'qz-tray';
import { Order, MenuItem, PrinterConfig } from '../types';
import { getOrderTickets, OrderTicket } from './canteenApi';

export interface PrintBillResult {
  printerName: string;
  ticketType: 'total' | 'food' | 'drink';
  ticketTitle: string;
  success: boolean;
  error?: string;
}

export interface MultiPrinterPrintResult {
  success: boolean;
  results: PrintBillResult[];
  hasErrors: boolean;
  fallbackNeeded?: boolean;
  errorMessage?: string;
}

// Cấu hình chữ ký bảo mật QZ Tray (bỏ qua xác thực cho kết nối máy POS nội bộ)
let securityConfigured = false;
function ensureQzSecurity() {
  if (securityConfigured) return;
  try {
    if (qz && qz.security) {
      qz.security.setCertificatePromise((resolve: (cert?: any) => void) => resolve());
      qz.security.setSignaturePromise((resolve: (sig?: any) => void) => resolve(''));
      securityConfigured = true;
    }
  } catch (err) {
    console.warn('[qzPrintService] Security setup warning:', err);
  }
}

/**
 * Kiểm tra xem WebSocket của QZ Tray có đang kết nối hay không
 */
export function isQzConnected(): boolean {
  try {
    return Boolean(qz?.websocket?.isActive && qz.websocket.isActive());
  } catch {
    return false;
  }
}

/**
 * Kết nối tới phần mềm QZ Tray đang chạy trên máy tính
 */
export async function connectQz(): Promise<{ success: boolean; error?: string }> {
  try {
    ensureQzSecurity();
    if (isQzConnected()) {
      return { success: true };
    }

    await qz.websocket.connect({ retries: 1, delay: 0.5 });
    return { success: true };
  } catch (err: any) {
    const errorMsg =
      err?.message ||
      'Không tìm thấy QZ Tray đang chạy trên máy này. Vui lòng mở ứng dụng QZ Tray trước khi thực hiện in.';
    console.warn('[qzPrintService] QZ Tray connection failed:', errorMsg);
    return {
      success: false,
      error: 'Không tìm thấy QZ Tray đang chạy trên máy này. Vui lòng kiểm tra ứng dụng QZ Tray đã được mở.',
    };
  }
}

/**
 * Ngắt kết nối QZ Tray (nếu cần dọn dẹp)
 */
export async function disconnectQz(): Promise<void> {
  try {
    if (isQzConnected()) {
      await qz.websocket.disconnect();
    }
  } catch (err) {
    console.warn('[qzPrintService] Disconnect notice:', err);
  }
}

/**
 * Lấy danh sách tất cả máy in mà hệ điều hành nhận diện được thông qua QZ Tray
 */
export async function listAvailablePrinters(): Promise<string[]> {
  try {
    const conn = await connectQz();
    if (!conn.success) {
      return [];
    }

    const list = await qz.printers.find();
    if (Array.isArray(list)) {
      return list.filter((p) => typeof p === 'string' && p.trim().length > 0);
    }
    return [];
  } catch (err) {
    console.warn('[qzPrintService] listAvailablePrinters error:', err);
    return [];
  }
}

// ============================================================
// ESC/POS COMMAND BUILDER
// ============================================================

const ESC = '\x1B';
const GS = '\x1D';

const CMD = {
  INIT: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  UNDERLINE_ON: `${ESC}-\x01`,
  UNDERLINE_OFF: `${ESC}-\x00`,
  TEXT_NORMAL: `${GS}!\x00`,
  TEXT_DOUBLE_HEIGHT: `${GS}!\x01`,
  TEXT_DOUBLE_WIDTH: `${GS}!\x10`,
  TEXT_LARGE: `${GS}!\x11`, // Double width + double height
  CUT_FULL: `${GS}V\x00`, // Full cut
  CUT_PARTIAL: `${GS}V\x01`, // Partial cut
  FEED_AND_CUT: `${GS}V\x41\x03`, // Feed 3 lines & cut
};

/**
 * Tạo một chuỗi lệnh ESC/POS chuẩn cho máy in nhiệt
 */
export function buildEscPosCommands(ticket: OrderTicket, paperColumns: number = 40): string {
  const lineSeparator = '-'.repeat(paperColumns) + '\n';
  const doubleSeparator = '='.repeat(paperColumns) + '\n';
  const order = ticket.order;

  let buffer = '';

  // Khởi tạo máy in
  buffer += CMD.INIT;

  // 1. TIÊU ĐỀ ĐẦU PHIẾU
  buffer += CMD.ALIGN_CENTER;
  buffer += CMD.BOLD_ON + CMD.TEXT_LARGE;
  buffer += `${ticket.title || 'CƠM NGON SIBA'}\n`;
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += 'ĂN SẠCH – SỐNG KHỎE\n';
  buffer += lineSeparator;

  // PHỤ ĐỀ PHIẾU (Ví dụ: PHIẾU BẾP – MÓN CƠM)
  buffer += CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT;
  buffer += `${ticket.subtitle || 'PHIẾU XUẤT SUẤT ĂN'}\n`;
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += lineSeparator;

  // 2. THÔNG TIN ĐƠN HÀNG
  buffer += CMD.ALIGN_LEFT;
  buffer += CMD.BOLD_ON;
  buffer += `Mã đơn hàng:  ${order.orderCode || order.id}\n`;
  buffer += CMD.BOLD_OFF;
  buffer += `Khách hàng:   ${order.userName || 'Cán bộ'}\n`;
  if (order.userDepartment) {
    buffer += `Đơn vị/Khoa:  ${order.userDepartment}\n`;
  }
  if (order.userPhone) {
    buffer += `Số điện thoại:${order.userPhone}\n`;
  }
  buffer += `Thời gian nhận:${order.pickupTime || '--:--'} · ${order.targetDate || 'Hôm nay'}\n`;
  buffer += `Hình thức:    ${
    order.deliveryMethod === 'room_delivery'
      ? `Giao tận phòng (${order.roomNumber || 'Chưa ghi phòng'})`
      : 'Ăn tại Căn tin'
  }\n`;

  buffer += lineSeparator;

  // 3. NỘI DUNG MÓN ĂN
  if (ticket.ticketType === 'total') {
    // === BILL TỔNG (Có số lượng, đơn giá và thành tiền) ===
    buffer += CMD.BOLD_ON;
    buffer += 'TÊN MÓN                       SL    T.TIỀN\n';
    buffer += CMD.BOLD_OFF;
    buffer += lineSeparator;

    for (const it of ticket.items) {
      const name = it.name;
      const qtyStr = `${it.quantity}x`;
      const itemSubtotal = (it.price || 0) * (it.quantity || 1);
      const subtotalStr = `${itemSubtotal.toLocaleString('vi-VN')}đ`;

      buffer += CMD.BOLD_ON;
      buffer += `${name}\n`;
      buffer += CMD.BOLD_OFF;

      // Căn lề số lượng và thành tiền
      const spaceCount = Math.max(2, paperColumns - qtyStr.length - subtotalStr.length - 4);
      buffer += `    ${qtyStr}${' '.repeat(spaceCount)}${subtotalStr}\n`;
    }

    buffer += doubleSeparator;

    // TỔNG TIỀN VÀ THANH TOÁN
    buffer += CMD.ALIGN_RIGHT;
    buffer += CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT;
    const totalStr = `${(ticket.totalAmount || order.totalAmount || 0).toLocaleString('vi-VN')} đ`;
    buffer += `TỔNG CỘNG: ${totalStr}\n`;
    buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;

    buffer += CMD.ALIGN_LEFT;
    buffer += `Phương thức:  Thanh toán Ví Căn tin\n`;
    buffer += `Tổng số món:  ${ticket.totalQuantity} suất\n`;
  } else {
    // === BILL MÓN CƠM / BILL MÓN NƯỚC (Chỉ in tên món + số lượng, không có giá tiền) ===
    buffer += CMD.BOLD_ON;
    buffer += 'DANH SÁCH MÓN XUẤT BẾP:\n';
    buffer += CMD.BOLD_OFF;
    buffer += lineSeparator;

    for (const it of ticket.items) {
      buffer += CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT;
      buffer += `[ ${it.quantity} ]  ${it.name.toUpperCase()}\n`;
      buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;

      if (it.isFromCombo) {
        buffer += `      (Từ phần ăn Combo)\n`;
      }
    }

    buffer += lineSeparator;
    buffer += CMD.BOLD_ON;
    buffer += `TỔNG SỐ LƯỢNG MÓN: ${ticket.totalQuantity}\n`;
    buffer += CMD.BOLD_OFF;
  }

  // 4. GHI CHÚ (NẾU CÓ)
  const orderNote = order.note || order.notes;
  if (orderNote && orderNote.trim()) {
    buffer += lineSeparator;
    buffer += CMD.BOLD_ON;
    buffer += `GHI CHÚ: ${orderNote.trim()}\n`;
    buffer += CMD.BOLD_OFF;
  }

  // 5. CHÂN TRANG & THỜI GIAN IN
  buffer += lineSeparator;
  buffer += CMD.ALIGN_CENTER;
  const now = new Date();
  const printTimeStr = `${now.toLocaleTimeString('vi-VN')} · ${now.toLocaleDateString('vi-VN')}`;
  buffer += `In lúc: ${printTimeStr}\n`;
  buffer += 'CHÚC QUÝ KHÁCH NGON MIỆNG!\n';
  buffer += CMD.ALIGN_LEFT;

  // Đẩy giấy 4 dòng và cắt giấy
  buffer += '\n\n\n\n';
  buffer += CMD.FEED_AND_CUT;

  return buffer;
}

/**
 * Gửi lệnh in 1 phiếu trực tiếp tới một máy in cụ thể qua QZ Tray (ESC/POS raw)
 */
export async function printBillToPrinter(
  printerName: string,
  ticket: OrderTicket
): Promise<PrintBillResult> {
  const ticketTitle = ticket.subtitle || ticket.title || 'Phiếu in POS';

  if (!printerName || !printerName.trim()) {
    throw new Error(`Chưa chỉ định tên máy in cho "${ticketTitle}".`);
  }

  const conn = await connectQz();
  if (!conn.success) {
    throw new Error(conn.error || 'Chưa thể kết nối tới QZ Tray.');
  }

  const escPosData = buildEscPosCommands(ticket);
  const config = qz.configs.create(printerName.trim(), {
    encoding: 'UTF-8',
  });

  const printData = [
    {
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: escPosData,
      options: { encoding: 'UTF-8' },
    },
  ];

  await qz.print(config, printData);

  return {
    printerName: printerName.trim(),
    ticketType: ticket.ticketType,
    ticketTitle,
    success: true,
  };
}

/**
 * In phiếu thử nghiệm (Test Print) cho từng máy in riêng biệt
 */
export async function printTestTicket(
  printerName: string,
  printerRole: string = 'Kiểm tra máy in'
): Promise<PrintBillResult> {
  if (!printerName || !printerName.trim()) {
    throw new Error('Vui lòng chọn hoặc nhập tên máy in cần in thử.');
  }

  const conn = await connectQz();
  if (!conn.success) {
    throw new Error(conn.error || 'Chưa thể kết nối tới QZ Tray.');
  }

  const cleanPrinter = printerName.trim();
  const now = new Date();
  const timeStr = `${now.toLocaleTimeString('vi-VN')} ${now.toLocaleDateString('vi-VN')}`;

  let buffer = '';
  buffer += CMD.INIT;
  buffer += CMD.ALIGN_CENTER;
  buffer += CMD.BOLD_ON + CMD.TEXT_LARGE;
  buffer += 'CƠM NGON SIBA\n';
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += '----------------------------------------\n';
  buffer += CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT;
  buffer += 'PHIẾU IN THỬ NGHIỆM (TEST)\n';
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += '----------------------------------------\n';
  buffer += CMD.ALIGN_LEFT;
  buffer += `Máy in:    ${cleanPrinter}\n`;
  buffer += `Vai trò:   ${printerRole}\n`;
  buffer += `Thời gian: ${timeStr}\n`;
  buffer += `Giao thức: ESC/POS Raw qua QZ Tray\n`;
  buffer += '----------------------------------------\n';
  buffer += CMD.ALIGN_CENTER;
  buffer += CMD.BOLD_ON;
  buffer += 'KẾT NỐI VÀ IN ẤN HOÀN TOÀN THÀNH CÔNG!\n';
  buffer += CMD.BOLD_OFF;
  buffer += '----------------------------------------\n';
  buffer += '\n\n\n\n';
  buffer += CMD.FEED_AND_CUT;

  const config = qz.configs.create(cleanPrinter, { encoding: 'UTF-8' });
  const printData = [
    {
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: buffer,
      options: { encoding: 'UTF-8' },
    },
  ];

  await qz.print(config, printData);

  return {
    printerName: cleanPrinter,
    ticketType: 'total',
    ticketTitle: `Phiếu in thử (${printerRole})`,
    success: true,
  };
}

/**
 * HÀM TỔNG HỢP: In 1 đơn hàng ra đúng các máy in vật lý tương ứng:
 * - Bill Tổng -> printerConfig.tongPrinterName
 * - Bill Món Cơm -> printerConfig.comPrinterName (chỉ in nếu đơn có món cơm)
 * - Bill Món Nước -> printerConfig.nuocPrinterName (chỉ in nếu đơn có món nước)
 *
 * Xử lý lỗi từng máy in độc lập bằng Promise.allSettled:
 * Nếu 1 máy in bị lỗi (hết giấy, mất kết nối), 2 máy còn lại vẫn in bình thường.
 */
export async function printOrderToAllPrinters(
  order: Order,
  menu: MenuItem[] = [],
  printerConfig: PrinterConfig
): Promise<MultiPrinterPrintResult> {
  // 1. Kiểm tra kết nối QZ Tray
  const conn = await connectQz();
  if (!conn.success) {
    return {
      success: false,
      fallbackNeeded: true,
      errorMessage: conn.error || 'Không tìm thấy QZ Tray đang chạy trên máy này.',
      results: [],
      hasErrors: true,
    };
  }

  // 2. Tạo danh sách các phiếu in theo logic chuẩn của dự án (tự động tách combo, lọc bỏ bill rỗng)
  const tickets = getOrderTickets(order, menu);

  // 3. Ghép phiếu in với máy in tương ứng
  interface PrintTask {
    ticket: OrderTicket;
    printerName: string;
    roleName: string;
  }

  const tasks: PrintTask[] = [];

  for (const t of tickets) {
    if (t.ticketType === 'total') {
      tasks.push({
        ticket: t,
        printerName: printerConfig.tongPrinterName || '',
        roleName: 'Máy in Bill Tổng',
      });
    } else if (t.ticketType === 'food') {
      tasks.push({
        ticket: t,
        printerName: printerConfig.comPrinterName || '',
        roleName: 'Máy in Bếp Cơm',
      });
    } else if (t.ticketType === 'drink') {
      tasks.push({
        ticket: t,
        printerName: printerConfig.nuocPrinterName || '',
        roleName: 'Máy in Bếp Nước',
      });
    }
  }

  // 4. Thực thi in từng máy in độc lập bằng Promise.allSettled
  const settledPromises = tasks.map(async ({ ticket, printerName, roleName }): Promise<PrintBillResult> => {
    const ticketTitle = ticket.subtitle || ticket.title;

    if (!printerName || !printerName.trim()) {
      return {
        printerName: '(Chưa cấu hình)',
        ticketType: ticket.ticketType,
        ticketTitle,
        success: false,
        error: `Chưa cấu hình tên máy in cho [${roleName}]`,
      };
    }

    try {
      return await printBillToPrinter(printerName.trim(), ticket);
    } catch (err: any) {
      console.warn(`[qzPrintService] Lỗi in tại ${roleName} ("${printerName}"):`, err);
      return {
        printerName: printerName.trim(),
        ticketType: ticket.ticketType,
        ticketTitle,
        success: false,
        error: err?.message || 'Lỗi gửi lệnh in ESC/POS tới máy in.',
      };
    }
  });

  const settledResults = await Promise.allSettled(settledPromises);

  const results: PrintBillResult[] = settledResults.map((r, idx) => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    const t = tasks[idx];
    return {
      printerName: t.printerName || '(Không xác định)',
      ticketType: t.ticket.ticketType,
      ticketTitle: t.ticket.subtitle || t.ticket.title,
      success: false,
      error: r.reason?.message || String(r.reason),
    };
  });

  const hasErrors = results.some((r) => !r.success);
  const successCount = results.filter((r) => r.success).length;

  return {
    success: successCount > 0,
    hasErrors,
    results,
    fallbackNeeded: successCount === 0 && tasks.length > 0,
    errorMessage: hasErrors
      ? `Một số phiếu in gặp sự cố: ${results
          .filter((r) => !r.success)
          .map((r) => `${r.ticketTitle} (${r.error})`)
          .join('; ')}`
      : undefined,
  };
}
