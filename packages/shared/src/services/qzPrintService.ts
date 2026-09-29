// @ts-ignore
import qz from 'qz-tray';
import { Order, MenuItem, PrinterConfig, BillType } from '../types';
import { getOrderTickets, OrderTicket, markBillPrinted } from './canteenApi';
import { formatVnd } from '../utils/date';

export interface PrintBillResult {
  printerName: string;
  ticketType: 'total' | 'food' | 'drink';
  billType: BillType;
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

export interface AvailablePrintersResult {
  printers: string[];
  error?: string;
}

// Cấu hình chữ ký bảo mật QZ Tray (bỏ qua xác thực cho kết nối máy POS nội bộ)
let securityConfigured = false;
function ensureQzSecurity() {
  if (securityConfigured) return;
  try {
    if (qz && qz.security) {
      qz.security.setCertificatePromise((resolve: (cert?: any) => void) => resolve());
      // qz-tray 2.x/2.3.x yêu cầu setSignaturePromise nhận (dataToSign) và trả về một hàm resolver: (resolve, reject) => resolve()
      qz.security.setSignaturePromise((_dataToSign: any) => (resolve: (sig?: any) => void, _reject?: (err?: any) => void) => resolve());
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
      error: errorMsg,
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
 * Lấy danh sách tất cả máy in mà hệ điều hành nhận diện được thông qua QZ Tray.
 * Trả về cả danh sách máy in và thông báo lỗi thực tế (nếu có).
 */
export async function listAvailablePrinters(): Promise<AvailablePrintersResult> {
  try {
    const conn = await connectQz();
    if (!conn.success) {
      return {
        printers: [],
        error: conn.error || 'Không tìm thấy QZ Tray đang chạy trên máy này.',
      };
    }

    const list = await qz.printers.find();
    if (Array.isArray(list)) {
      const printers = list.filter((p) => typeof p === 'string' && p.trim().length > 0);
      return { printers };
    }
    return { printers: [] };
  } catch (err: any) {
    const errMsg = err?.message || String(err) || 'Lỗi khi tìm kiếm máy in qua QZ Tray.';
    console.warn('[qzPrintService] listAvailablePrinters error:', err);
    return {
      printers: [],
      error: errMsg,
    };
  }
}

// ============================================================
// VIETNAMESE FONT & TONE SANITIZER FOR RAW ESC/POS TEXT
// ============================================================

/**
 * Loại bỏ dấu tiếng Việt có chủ đích khi tạo lệnh ESC/POS text thô.
 * Lý do: Hầu hết máy in nhiệt (XP-80, POS-80...) chỉ hỗ trợ bảng mã đơn byte (Code Page 437/850/1252),
 * không giải mã được UTF-8 tiếng Việt đa byte, dẫn đến in ra ký tự lạ, ô vuông, dấu vỡ nét.
 * Để đảm bảo bill in luôn đọc được rõ ràng và không bị rác ký tự, hàm này chủ động chuẩn hóa sang tiếng Việt không dấu.
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/–|—/g, '-');
}

// ============================================================
// CANVAS THERMAL RECEIPT RENDERER (ẢNH NHIỆT SẮC NÉT TIẾNG VIỆT)
// ============================================================

/**
 * Render phiếu in ra ảnh PNG đen trắng độ tương phản cao trên HTML5 Canvas.
 * - Giữ nguyên 100% tiếng Việt có dấu sắc nét (sử dụng font hệ thống / Be Vietnam Pro).
 * - Hỗ trợ chuẩn xác khổ giấy K80 (576 dots / 72mm) và K58 (384 dots / 48mm) ở 203 DPI.
 * - Xuất ra Base64 Data URL (data:image/png;base64,...) để in dạng Raw Image hoặc Pixel Image qua QZ Tray.
 */
export function renderTicketToCanvasImage(
  ticket: OrderTicket,
  paperSize: 'k80' | 'k58' = 'k80',
  walletBalanceAfter?: number
): string {
  if (typeof document === 'undefined') {
    throw new Error('Canvas rendering requires a browser/DOM environment.');
  }

  const isK58 = paperSize === 'k58';
  // Chuẩn số điểm in nhiệt ở độ phân giải 203 DPI: K80 = 576 dots, K58 = 384 dots
  const width = isK58 ? 384 : 576;
  const padX = isK58 ? 14 : 22;
  const contentWidth = width - padX * 2;
  const s = isK58 ? 0.75 : 1;

  // Font chữ hỗ trợ tiếng Việt đầy đủ và đẹp nhất
  const fontSans = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
  const fontMono = '"JetBrains Mono", "SF Pro Text", Consolas, Menlo, monospace';

  // Dùng canvas tạm để đo chiều cao văn bản
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = width;
  measureCanvas.height = 4000;
  const mCtx = measureCanvas.getContext('2d')!;

  function wrap(text: string, maxWidth: number, font: string): string[] {
    mCtx.font = font;
    const words = (text || '').split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (mCtx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length > 0 ? lines : [''];
  }

  type DrawCmd = (c: CanvasRenderingContext2D) => void;
  const drawList: DrawCmd[] = [];
  let y = 16 * s;

  function addDashedLine() {
    y += 10 * s;
    const lineY = y;
    drawList.push((c) => {
      c.save();
      c.beginPath();
      c.setLineDash([6 * s, 4 * s]);
      c.moveTo(padX, lineY);
      c.lineTo(width - padX, lineY);
      c.strokeStyle = '#000000';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
    });
    y += 12 * s;
  }

  function addSolidLine(lineWidth = 1) {
    y += 8 * s;
    const lineY = y;
    drawList.push((c) => {
      c.beginPath();
      c.setLineDash([]);
      c.moveTo(padX, lineY);
      c.lineTo(width - padX, lineY);
      c.strokeStyle = '#000000';
      c.lineWidth = lineWidth;
      c.stroke();
    });
    y += 10 * s;
  }

  function addDoubleLine() {
    y += 8 * s;
    const lineY = y;
    drawList.push((c) => {
      c.beginPath();
      c.setLineDash([]);
      c.moveTo(padX, lineY - 1.5);
      c.lineTo(width - padX, lineY - 1.5);
      c.moveTo(padX, lineY + 1.5);
      c.lineTo(width - padX, lineY + 1.5);
      c.strokeStyle = '#000000';
      c.lineWidth = 1.2;
      c.stroke();
    });
    y += 10 * s;
  }

  // 1. TIÊU ĐỀ ĐẦU PHIẾU
  const brandTitle = 'CƠM NGON SIBA';
  const brandY = y + 24 * s;
  drawList.push((c) => {
    c.font = `bold ${Math.round(26 * s)}px ${fontSans}`;
    c.textAlign = 'center';
    c.fillStyle = '#000000';
    c.fillText(brandTitle, width / 2, brandY);
  });
  y += 30 * s;

  const ticketType = ticket.ticketType;
  if (ticketType === 'food') {
    const subtitleText = 'PHIẾU BẾP – MÓN CƠM';
    const subY = y + 18 * s;
    drawList.push((c) => {
      c.font = `bold ${Math.round(18 * s)}px ${fontSans}`;
      c.textAlign = 'center';
      c.fillStyle = '#000000';
      c.fillText(subtitleText, width / 2, subY);
    });
    y += 26 * s;
  } else if (ticketType === 'drink') {
    const subtitleText = 'PHIẾU BẾP – MÓN NƯỚC';
    const subY = y + 18 * s;
    drawList.push((c) => {
      c.font = `bold ${Math.round(18 * s)}px ${fontSans}`;
      c.textAlign = 'center';
      c.fillStyle = '#000000';
      c.fillText(subtitleText, width / 2, subY);
    });
    y += 26 * s;
  } else {
    const subtitleText = 'ĂN SẠCH – SỐNG KHỎE · PHIẾU BẾP & XUẤT SUẤT ĂN';
    const subY = y + 14 * s;
    drawList.push((c) => {
      c.font = `bold ${Math.round(13 * s)}px ${fontSans}`;
      c.textAlign = 'center';
      c.fillStyle = '#000000';
      c.fillText(subtitleText, width / 2, subY);
    });
    y += 20 * s;
  }

  addDashedLine();

  // 2. THÔNG TIN ĐƠN HÀNG
  const infoFont = `${Math.round(16 * s)}px ${fontSans}`;
  const infoBoldFont = `bold ${Math.round(16 * s)}px ${fontSans}`;
  const infoMonoBold = `bold ${Math.round(16 * s)}px ${fontMono}`;
  const order = ticket.order;
  const now = new Date();

  function addInfoRow(label: string, value: string, isMono = false, isBold = false) {
    const rowY = y + 16 * s;
    const vFont = isMono ? infoMonoBold : isBold ? infoBoldFont : infoFont;
    drawList.push((c) => {
      c.font = infoFont;
      c.textAlign = 'left';
      c.fillStyle = '#000000';
      c.fillText(label, padX, rowY);

      c.font = vFont;
      c.textAlign = 'right';
      c.fillText(value, width - padX, rowY);
    });
    y += 22 * s;
  }

  addInfoRow('Mã đơn hàng:', order.orderCode || order.id, true, true);
  addInfoRow(
    'Giờ in:',
    `${now.toLocaleTimeString('vi-VN')} · ${now.toLocaleDateString('vi-VN')}`,
    false,
    false
  );
  addInfoRow('Khách hàng:', order.userName || 'Cán bộ', false, true);
  if (order.userPhone) {
    addInfoRow('Số điện thoại:', order.userPhone, true, false);
  }
  const deliveryStr =
    order.deliveryMethod === 'room_delivery'
      ? `Giao phòng (${order.roomNumber || 'P.Phòng'})`
      : 'Ăn tại Căn tin';
  addInfoRow('Hình thức:', deliveryStr, false, true);
  addInfoRow(
    'Giờ nhận:',
    `${order.pickupTime || '--:--'} · ${order.targetDate || 'Hôm nay'}`,
    false,
    true
  );

  addDashedLine();

  // 3. NỘI DUNG MÓN ĂN
  if (ticketType === 'total') {
    // === BILL TỔNG (Có cột SL, Đơn giá, T.Tiền) ===
    const colHeaderFont = `bold ${Math.round(15 * s)}px ${fontSans}`;
    const headerY = y + 15 * s;
    drawList.push((c) => {
      c.font = colHeaderFont;
      c.fillStyle = '#000000';
      c.textAlign = 'left';
      c.fillText('TÊN MÓN', padX, headerY);

      c.textAlign = 'center';
      c.fillText('SL', width - padX - 160 * s, headerY);

      c.textAlign = 'right';
      c.fillText('ĐƠN GIÁ', width - padX - 85 * s, headerY);

      c.textAlign = 'right';
      c.fillText('T.TIỀN', width - padX, headerY);
    });
    y += 22 * s;
    addSolidLine(1);

    const itemNameFont = `bold ${Math.round(16 * s)}px ${fontSans}`;
    const numFont = `${Math.round(15 * s)}px ${fontMono}`;
    const numBoldFont = `bold ${Math.round(15 * s)}px ${fontMono}`;
    const colNameMaxW = width - padX * 2 - 200 * s;

    for (const it of ticket.items) {
      const name = it.name || 'Suất ăn Căn tin';
      const qtyStr = `${it.quantity}x`;
      const priceStr = `${(it.price || 0).toLocaleString('vi-VN')}đ`;
      const subtotalStr = `${((it.price || 0) * (it.quantity || 1)).toLocaleString('vi-VN')}đ`;

      const lines = wrap(name, colNameMaxW, itemNameFont);
      const itemY = y + 16 * s;
      const firstLine = lines[0] || '';

      drawList.push((c) => {
        c.font = itemNameFont;
        c.textAlign = 'left';
        c.fillStyle = '#000000';
        c.fillText(firstLine, padX, itemY);

        c.font = numBoldFont;
        c.textAlign = 'center';
        c.fillText(qtyStr, width - padX - 160 * s, itemY);

        c.font = numFont;
        c.textAlign = 'right';
        c.fillText(priceStr, width - padX - 85 * s, itemY);

        c.font = numBoldFont;
        c.textAlign = 'right';
        c.fillText(subtotalStr, width - padX, itemY);
      });
      y += 21 * s;

      // Các dòng tên món tiếp theo nếu tên dài
      for (let i = 1; i < lines.length; i++) {
        const extraLine = lines[i];
        const extraY = y + 14 * s;
        drawList.push((c) => {
          c.font = itemNameFont;
          c.textAlign = 'left';
          c.fillStyle = '#000000';
          c.fillText(extraLine, padX + 8 * s, extraY);
        });
        y += 19 * s;
      }
      y += 4 * s;
    }

    addDoubleLine();

    // TỔNG CỘNG
    const totalAmount = ticket.totalAmount || order.totalAmount || 0;
    const totalStr = `${totalAmount.toLocaleString('vi-VN')} đ`;
    const totalY = y + 22 * s;
    drawList.push((c) => {
      c.fillStyle = '#000000';
      c.font = `bold ${Math.round(17 * s)}px ${fontSans}`;
      c.textAlign = 'left';
      c.fillText('TỔNG CỘNG:', padX, totalY);

      c.font = `bold ${Math.round(24 * s)}px ${fontMono}`;
      c.textAlign = 'right';
      c.fillText(totalStr, width - padX, totalY);
    });
    y += 32 * s;

    // SỐ DƯ VÍ HIỆN TẠI
    if (typeof walletBalanceAfter === 'number') {
      const balStr = `${walletBalanceAfter.toLocaleString('vi-VN')}đ`;
      const balY = y + 16 * s;
      drawList.push((c) => {
        c.font = infoBoldFont;
        c.textAlign = 'left';
        c.fillStyle = '#000000';
        c.fillText('Số dư ví hiện tại:', padX, balY);

        c.font = infoMonoBold;
        c.textAlign = 'right';
        c.fillText(balStr, width - padX, balY);
      });
      y += 24 * s;
    }

    // TỔNG SỐ LƯỢNG MÓN
    const qtyY = y + 16 * s;
    drawList.push((c) => {
      c.font = infoFont;
      c.textAlign = 'left';
      c.fillStyle = '#000000';
      c.fillText('Tổng số món:', padX, qtyY);

      c.font = infoBoldFont;
      c.textAlign = 'right';
      c.fillText(`${ticket.totalQuantity} suất`, width - padX, qtyY);
    });
    y += 24 * s;
  } else {
    // === BILL MÓN CƠM / BẾP NƯỚC ===
    const kHeaderY = y + 17 * s;
    drawList.push((c) => {
      c.font = `bold ${Math.round(17 * s)}px ${fontSans}`;
      c.textAlign = 'left';
      c.fillStyle = '#000000';
      c.fillText('DANH SÁCH MÓN XUẤT BẾP:', padX, kHeaderY);
    });
    y += 25 * s;
    addSolidLine(1);

    const kitchenItemFont = `bold ${Math.round(20 * s)}px ${fontSans}`;
    const comboNoteFont = `italic ${Math.round(14 * s)}px ${fontSans}`;

    for (const it of ticket.items) {
      const itemTitle = `[ ${it.quantity} ]  ${(it.name || '').toUpperCase()}`;
      const lines = wrap(itemTitle, contentWidth, kitchenItemFont);

      for (const line of lines) {
        const lineY = y + 20 * s;
        drawList.push((c) => {
          c.font = kitchenItemFont;
          c.textAlign = 'left';
          c.fillStyle = '#000000';
          c.fillText(line, padX, lineY);
        });
        y += 26 * s;
      }

      if (it.isFromCombo) {
        const comboY = y + 14 * s;
        drawList.push((c) => {
          c.font = comboNoteFont;
          c.textAlign = 'left';
          c.fillStyle = '#000000';
          c.fillText('(Từ phần ăn Combo)', padX + 20 * s, comboY);
        });
        y += 20 * s;
      }
      y += 4 * s;
    }

    addDashedLine();

    // TỔNG SỐ LƯỢNG MÓN
    const totalDishesY = y + 18 * s;
    const unitStr = ticketType === 'food' ? 'suất' : 'ly/phần';
    drawList.push((c) => {
      c.font = infoBoldFont;
      c.textAlign = 'left';
      c.fillStyle = '#000000';
      c.fillText('TỔNG SỐ LƯỢNG MÓN:', padX, totalDishesY);

      c.font = `bold ${Math.round(18 * s)}px ${fontMono}`;
      c.textAlign = 'right';
      c.fillText(`${ticket.totalQuantity} ${unitStr}`, width - padX, totalDishesY);
    });
    y += 26 * s;
  }

  // 4. GHI CHÚ (NẾU CÓ)
  const orderNote = order.note || order.notes;
  if (orderNote && orderNote.trim()) {
    addDashedLine();
    const noteY = y + 16 * s;
    drawList.push((c) => {
      c.font = `bold ${Math.round(16 * s)}px ${fontSans}`;
      c.textAlign = 'left';
      c.fillStyle = '#000000';
      c.fillText('GHI CHÚ:', padX, noteY);
    });
    y += 22 * s;

    const noteLines = wrap(orderNote.trim(), contentWidth - 10 * s, `${Math.round(15 * s)}px ${fontSans}`);
    for (const line of noteLines) {
      const lineY = y + 15 * s;
      drawList.push((c) => {
        c.font = `${Math.round(15 * s)}px ${fontSans}`;
        c.textAlign = 'left';
        c.fillStyle = '#000000';
        c.fillText(line, padX + 8 * s, lineY);
      });
      y += 20 * s;
    }
  }

  // 5. CHÂN TRANG & THỜI GIAN IN
  addDashedLine();
  const footMainY = y + 16 * s;
  drawList.push((c) => {
    c.font = `bold ${Math.round(15 * s)}px ${fontSans}`;
    c.textAlign = 'center';
    c.fillStyle = '#000000';
    c.fillText('Chúc quý Thầy / Cô ngon miệng!', width / 2, footMainY);
  });
  y += 24 * s;

  const footSubY = y + 14 * s;
  const timeStr = `In lúc: ${now.toLocaleTimeString('vi-VN')} · ${now.toLocaleDateString('vi-VN')}`;
  drawList.push((c) => {
    c.font = `${Math.round(13 * s)}px ${fontSans}`;
    c.textAlign = 'center';
    c.fillStyle = '#000000';
    c.fillText(timeStr, width / 2, footSubY);
  });
  y += 22 * s;

  // Khoảng trắng trống cuối phiếu cho dao cắt giấy máy in nhiệt
  y += 50 * s;

  // Tạo canvas chuẩn với chiều cao thực tế chính xác
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = Math.ceil(y);
  const finalCtx = finalCanvas.getContext('2d')!;

  // Nền trắng tinh khiết
  finalCtx.fillStyle = '#ffffff';
  finalCtx.fillRect(0, 0, width, finalCanvas.height);

  // Thực thi vẽ toàn bộ nội dung
  for (const cmd of drawList) {
    cmd(finalCtx);
  }

  return finalCanvas.toDataURL('image/png');
}

/**
 * Render phiếu in thử nghiệm (Test Print) ra ảnh Canvas PNG với tiếng Việt sắc nét.
 */
export function renderTestTicketToCanvasImage(
  printerName: string,
  printerRole: string = 'Kiểm tra máy in',
  paperSize: 'k80' | 'k58' = 'k80'
): string {
  if (typeof document === 'undefined') {
    throw new Error('Canvas rendering requires a browser environment.');
  }

  const isK58 = paperSize === 'k58';
  const width = isK58 ? 384 : 576;
  const padX = isK58 ? 14 : 22;
  const s = isK58 ? 0.75 : 1;

  const fontSans = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
  const fontMono = '"JetBrains Mono", Consolas, Menlo, monospace';

  type DrawCmd = (c: CanvasRenderingContext2D) => void;
  const drawList: DrawCmd[] = [];
  let y = 16 * s;

  function addDashedLine() {
    y += 10 * s;
    const lineY = y;
    drawList.push((c) => {
      c.save();
      c.beginPath();
      c.setLineDash([6 * s, 4 * s]);
      c.moveTo(padX, lineY);
      c.lineTo(width - padX, lineY);
      c.strokeStyle = '#000000';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
    });
    y += 12 * s;
  }

  // Header
  const titleY = y + 24 * s;
  drawList.push((c) => {
    c.font = `bold ${Math.round(26 * s)}px ${fontSans}`;
    c.textAlign = 'center';
    c.fillStyle = '#000000';
    c.fillText('CƠM NGON SIBA', width / 2, titleY);
  });
  y += 30 * s;

  const subTitleY = y + 18 * s;
  drawList.push((c) => {
    c.font = `bold ${Math.round(18 * s)}px ${fontSans}`;
    c.textAlign = 'center';
    c.fillStyle = '#000000';
    c.fillText('PHIẾU IN THỬ NGHIỆM (TEST)', width / 2, subTitleY);
  });
  y += 24 * s;

  addDashedLine();

  const now = new Date();
  const timeStr = `${now.toLocaleTimeString('vi-VN')} · ${now.toLocaleDateString('vi-VN')}`;

  function addRow(label: string, val: string) {
    const rowY = y + 16 * s;
    drawList.push((c) => {
      c.font = `${Math.round(16 * s)}px ${fontSans}`;
      c.textAlign = 'left';
      c.fillStyle = '#000000';
      c.fillText(label, padX, rowY);

      c.font = `bold ${Math.round(16 * s)}px ${fontMono}`;
      c.textAlign = 'right';
      c.fillText(val, width - padX, rowY);
    });
    y += 22 * s;
  }

  addRow('Máy in:', printerName);
  addRow('Vai trò:', printerRole);
  addRow('Thời gian:', timeStr);
  addRow('Giao thức:', 'In ảnh POS nhiệt (QZ Tray)');

  addDashedLine();

  const successY = y + 18 * s;
  drawList.push((c) => {
    c.font = `bold ${Math.round(18 * s)}px ${fontSans}`;
    c.textAlign = 'center';
    c.fillStyle = '#000000';
    c.fillText('KẾT NỐI VÀ IN ẤN HOÀN TOÀN THÀNH CÔNG!', width / 2, successY);
  });
  y += 26 * s;

  const subSuccessY = y + 14 * s;
  drawList.push((c) => {
    c.font = `${Math.round(14 * s)}px ${fontSans}`;
    c.textAlign = 'center';
    c.fillStyle = '#000000';
    c.fillText('Tiếng Việt sắc nét 100% · Không lỗi font', width / 2, subSuccessY);
  });
  y += 22 * s;

  addDashedLine();
  y += 50 * s;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = Math.ceil(y);
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.fillStyle = '#ffffff';
  finalCtx.fillRect(0, 0, width, finalCanvas.height);

  for (const cmd of drawList) {
    cmd(finalCtx);
  }

  return finalCanvas.toDataURL('image/png');
}

// ============================================================
// ESC/POS COMMAND BUILDER (FALLBACK CHO LỆNH TEXT THÔ)
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
 * Tạo một chuỗi lệnh ESC/POS chuẩn cho máy in nhiệt.
 * - Đã chủ động loại bỏ dấu tiếng Việt (removeVietnameseTones) để tránh ký tự rác khi gửi UTF-8 vào máy in chỉ có CodePage 1 byte.
 */
export function buildEscPosCommands(
  ticket: OrderTicket,
  paperColumns: number = 40,
  walletBalanceAfter?: number
): string {
  const lineSeparator = '-'.repeat(paperColumns) + '\n';
  const doubleSeparator = '='.repeat(paperColumns) + '\n';
  const order = ticket.order;

  let buffer = '';

  // Khởi tạo máy in
  buffer += CMD.INIT;

  // 1. TIÊU ĐỀ ĐẦU PHIẾU
  buffer += CMD.ALIGN_CENTER;
  buffer += CMD.BOLD_ON + CMD.TEXT_LARGE;
  buffer += `${removeVietnameseTones(ticket.title || 'COM NGON SIBA')}\n`;
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += 'AN SACH - SONG KHOE\n';
  buffer += lineSeparator;

  // PHỤ ĐỀ PHIẾU
  buffer += CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT;
  buffer += `${removeVietnameseTones(ticket.subtitle || 'PHIEU XUAT SUAT AN')}\n`;
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += lineSeparator;

  // 2. THÔNG TIN ĐƠN HÀNG
  buffer += CMD.ALIGN_LEFT;
  buffer += CMD.BOLD_ON;
  buffer += `Ma don hang:  ${order.orderCode || order.id}\n`;
  buffer += CMD.BOLD_OFF;
  buffer += `Khach hang:   ${removeVietnameseTones(order.userName || 'Can bo')}\n`;
  if (order.userPhone) {
    buffer += `So dien thoai:${order.userPhone}\n`;
  }
  buffer += `Thoi gian nhan:${order.pickupTime || '--:--'} · ${order.targetDate || 'Hom nay'}\n`;
  buffer += `Hinh thuc:    ${
    order.deliveryMethod === 'room_delivery'
      ? removeVietnameseTones(`Giao tan phong (${order.roomNumber || 'Chua ghi phong'})`)
      : 'An tai Can tin'
  }\n`;

  buffer += lineSeparator;

  // 3. NỘI DUNG MÓN ĂN
  if (ticket.ticketType === 'total') {
    // === BILL TỔNG (Có số lượng, đơn giá và thành tiền) ===
    buffer += CMD.BOLD_ON;
    buffer += 'TEN MON                       SL    T.TIEN\n';
    buffer += CMD.BOLD_OFF;
    buffer += lineSeparator;

    for (const it of ticket.items) {
      const name = removeVietnameseTones(it.name || 'Suat an Can tin');
      const qtyStr = `${it.quantity}x`;
      const itemSubtotal = (it.price || 0) * (it.quantity || 1);
      const subtotalStr = `${itemSubtotal.toLocaleString('vi-VN')}d`;

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
    const totalStr = `${(ticket.totalAmount || order.totalAmount || 0).toLocaleString('vi-VN')} d`;
    buffer += `TONG CONG: ${totalStr}\n`;
    buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;

    if (typeof walletBalanceAfter === 'number') {
      buffer += CMD.ALIGN_LEFT;
      buffer += `So du vi hien tai: ${walletBalanceAfter.toLocaleString('vi-VN')}d\n`;
    }

    buffer += CMD.ALIGN_LEFT;
    buffer += `Tong so mon:  ${ticket.totalQuantity} suat\n`;
  } else {
    // === BILL MÓN CƠM / BILL MÓN NƯỚC ===
    buffer += CMD.BOLD_ON;
    buffer += 'DANH SACH MON XUAT BEP:\n';
    buffer += CMD.BOLD_OFF;
    buffer += lineSeparator;

    for (const it of ticket.items) {
      buffer += CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT;
      buffer += `[ ${it.quantity} ]  ${removeVietnameseTones(it.name || '').toUpperCase()}\n`;
      buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;

      if (it.isFromCombo) {
        buffer += `      (Tu phan an Combo)\n`;
      }
    }

    buffer += lineSeparator;
    buffer += CMD.BOLD_ON;
    buffer += `TONG SO LUONG MON: ${ticket.totalQuantity}\n`;
    buffer += CMD.BOLD_OFF;
  }

  // 4. GHI CHÚ (NẾU CÓ)
  const orderNote = order.note || order.notes;
  if (orderNote && orderNote.trim()) {
    buffer += lineSeparator;
    buffer += CMD.BOLD_ON;
    buffer += `GHI CHU: ${removeVietnameseTones(orderNote.trim())}\n`;
    buffer += CMD.BOLD_OFF;
  }

  // 5. CHÂN TRANG & THỜI GIAN IN
  buffer += lineSeparator;
  buffer += CMD.ALIGN_CENTER;
  const now = new Date();
  const printTimeStr = `${now.toLocaleTimeString('vi-VN')} · ${now.toLocaleDateString('vi-VN')}`;
  buffer += `In luc: ${printTimeStr}\n`;
  buffer += 'CHUC QUY KHACH NGON MIENG!\n';
  buffer += CMD.ALIGN_LEFT;

  // Đẩy giấy 4 dòng và cắt giấy
  buffer += '\n\n\n\n';
  buffer += CMD.FEED_AND_CUT;

  return buffer;
}

/**
 * Gửi lệnh in 1 phiếu trực tiếp tới máy in qua QZ Tray:
 * Ưu tiên 1: In dạng ẢNH ESC/POS Raw (hoặc Pixel Image) để hiển thị trọn vẹn 100% tiếng Việt có dấu và bố cục chuẩn POS.
 * Fallback: In lệnh ESC/POS text command (đã loại bỏ dấu có chủ đích để không bị rác ký tự).
 */
export async function printTicketAsImageToPrinter(
  printerName: string,
  ticket: OrderTicket,
  paperSize: 'k80' | 'k58' = 'k80',
  walletBalanceAfter?: number
): Promise<PrintBillResult> {
  const ticketTitle = ticket.subtitle || ticket.title || 'Phiếu in POS';

  if (!printerName || !printerName.trim()) {
    throw new Error(`Chưa chỉ định tên máy in cho "${ticketTitle}".`);
  }

  const conn = await connectQz();
  if (!conn.success) {
    throw new Error(conn.error || 'Chưa thể kết nối tới QZ Tray.');
  }

  const cleanPrinter = printerName.trim();
  const billType: BillType =
    ticket.ticketType === 'total' ? 'tong' : ticket.ticketType === 'food' ? 'com' : 'nuoc';

  // 1. Thử tạo ảnh Canvas PNG với font tiếng Việt sắc nét
  let dataUrl = '';
  try {
    dataUrl = renderTicketToCanvasImage(ticket, paperSize, walletBalanceAfter);
  } catch (renderErr) {
    console.warn('[qzPrintService] Không thể render ảnh phiếu trên Canvas, chuyển sang ESC/POS text:', renderErr);
  }

  if (dataUrl) {
    // 2. Thử gửi lệnh in dạng ẢNH ESC/POS Raw qua QZ Tray (tương thích máy in nhiệt POS nhiệt)
    try {
      const rawConfig = qz.configs.create(cleanPrinter, { encoding: 'UTF-8' });
      const rawPrintData = [
        {
          type: 'raw',
          format: 'image',
          flavor: 'base64',
          data: dataUrl,
          options: {
            language: 'ESCPOS',
            dotDensity: 'double',
          },
        },
      ];
      await qz.print(rawConfig, rawPrintData);
      return {
        printerName: cleanPrinter,
        ticketType: ticket.ticketType,
        billType,
        ticketTitle,
        success: true,
      };
    } catch (rawErr: any) {
      console.warn(
        `[qzPrintService] In RAW ESC/POS Image thất bại trên "${cleanPrinter}", thử chế độ Pixel Image:`,
        rawErr?.message || rawErr
      );

      // 3. Fallback sang Pixel Image (cho máy in cài driver Windows đồ họa / Generic)
      try {
        const pixelConfig = qz.configs.create(cleanPrinter, {
          scaleContent: false,
          rasterize: true,
        });
        const pixelPrintData = [
          {
            type: 'pixel',
            format: 'image',
            flavor: 'base64',
            data: dataUrl,
          },
        ];
        await qz.print(pixelConfig, pixelPrintData);
        return {
          printerName: cleanPrinter,
          ticketType: ticket.ticketType,
          billType,
          ticketTitle,
          success: true,
        };
      } catch (pixelErr: any) {
        console.warn(
          `[qzPrintService] In Pixel Image cũng thất bại trên "${cleanPrinter}", chuyển sang lệnh text ESC/POS xử lý dấu:`,
          pixelErr?.message || pixelErr
        );
      }
    }
  }

  // 4. Fallback cuối cùng: In lệnh ESC/POS text command (đã chuẩn hóa không dấu có chủ đích)
  const escPosData = buildEscPosCommands(
    ticket,
    paperSize === 'k58' ? 32 : 40,
    walletBalanceAfter
  );
  const config = qz.configs.create(cleanPrinter, {
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
    printerName: cleanPrinter,
    ticketType: ticket.ticketType,
    billType,
    ticketTitle,
    success: true,
  };
}

/**
 * Gửi lệnh in 1 phiếu trực tiếp tới một máy in cụ thể qua QZ Tray
 */
export async function printBillToPrinter(
  printerName: string,
  ticket: OrderTicket,
  walletBalanceAfter?: number,
  paperSize: 'k80' | 'k58' = 'k80'
): Promise<PrintBillResult> {
  return printTicketAsImageToPrinter(printerName, ticket, paperSize, walletBalanceAfter);
}

/**
 * In phiếu thử nghiệm (Test Print) cho từng máy in riêng biệt
 */
export async function printTestTicket(
  printerName: string,
  printerRole: string = 'Kiểm tra máy in',
  paperSize: 'k80' | 'k58' = 'k80'
): Promise<PrintBillResult> {
  if (!printerName || !printerName.trim()) {
    throw new Error('Vui lòng chọn hoặc nhập tên máy in cần in thử.');
  }

  const conn = await connectQz();
  if (!conn.success) {
    throw new Error(conn.error || 'Chưa thể kết nối tới QZ Tray.');
  }

  const cleanPrinter = printerName.trim();

  // 1. Thử in dạng ảnh Canvas PNG sắc nét tiếng Việt
  let dataUrl = '';
  try {
    dataUrl = renderTestTicketToCanvasImage(cleanPrinter, printerRole, paperSize);
  } catch (e) {
    console.warn('[printTestTicket] Canvas test render error:', e);
  }

  if (dataUrl) {
    try {
      const rawConfig = qz.configs.create(cleanPrinter, { encoding: 'UTF-8' });
      await qz.print(rawConfig, [
        {
          type: 'raw',
          format: 'image',
          flavor: 'base64',
          data: dataUrl,
          options: {
            language: 'ESCPOS',
            dotDensity: 'double',
          },
        },
      ]);
      return {
        printerName: cleanPrinter,
        ticketType: 'total',
        billType: 'tong',
        ticketTitle: `Phiếu in thử (${printerRole})`,
        success: true,
      };
    } catch (rawErr) {
      console.warn('[printTestTicket] Raw image failed, trying pixel image:', rawErr);
      try {
        const pixelConfig = qz.configs.create(cleanPrinter, {
          scaleContent: false,
          rasterize: true,
        });
        await qz.print(pixelConfig, [
          {
            type: 'pixel',
            format: 'image',
            flavor: 'base64',
            data: dataUrl,
          },
        ]);
        return {
          printerName: cleanPrinter,
          ticketType: 'total',
          billType: 'tong',
          ticketTitle: `Phiếu in thử (${printerRole})`,
          success: true,
        };
      } catch (pixelErr) {
        console.warn('[printTestTicket] Pixel image failed, falling back to text:', pixelErr);
      }
    }
  }

  // Fallback text
  const cleanRole = removeVietnameseTones(printerRole);
  const now = new Date();
  const timeStr = `${now.toLocaleTimeString('vi-VN')} ${now.toLocaleDateString('vi-VN')}`;

  let buffer = '';
  buffer += CMD.INIT;
  buffer += CMD.ALIGN_CENTER;
  buffer += CMD.BOLD_ON + CMD.TEXT_LARGE;
  buffer += 'COM NGON SIBA\n';
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += '----------------------------------------\n';
  buffer += CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT;
  buffer += 'PHIEU IN THU NGHIEM (TEST)\n';
  buffer += CMD.TEXT_NORMAL + CMD.BOLD_OFF;
  buffer += '----------------------------------------\n';
  buffer += CMD.ALIGN_LEFT;
  buffer += `May in:    ${cleanPrinter}\n`;
  buffer += `Vai tro:   ${cleanRole}\n`;
  buffer += `Thoi gian: ${timeStr}\n`;
  buffer += `Giao thuc: ESC/POS Raw qua QZ Tray\n`;
  buffer += '----------------------------------------\n';
  buffer += CMD.ALIGN_CENTER;
  buffer += CMD.BOLD_ON;
  buffer += 'KET NOI VA IN AN HOAN TOAN THANH CONG!\n';
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
    billType: 'tong',
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
  printerConfig: PrinterConfig,
  walletBalanceAfter?: number,
  paperSize: 'k80' | 'k58' = 'k80'
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
    const billType: BillType =
      ticket.ticketType === 'total' ? 'tong' : ticket.ticketType === 'food' ? 'com' : 'nuoc';

    if (!printerName || !printerName.trim()) {
      return {
        printerName: '(Chưa cấu hình)',
        ticketType: ticket.ticketType,
        billType,
        ticketTitle,
        success: false,
        error: `Chưa cấu hình tên máy in cho [${roleName}]`,
      };
    }

    try {
      const res = await printBillToPrinter(
        printerName.trim(),
        ticket,
        ticket.ticketType === 'total' ? walletBalanceAfter : undefined,
        paperSize
      );
      if (res.success && order.id) {
        try {
          await markBillPrinted(order.id, billType);
        } catch (err) {
          console.warn('[qzPrintService] Auto markBillPrinted notice:', err);
        }
      }
      return res;
    } catch (err: any) {
      console.warn(`[qzPrintService] Lỗi in tại ${roleName} ("${printerName}"):`, err);
      return {
        printerName: printerName.trim(),
        ticketType: ticket.ticketType,
        billType,
        ticketTitle,
        success: false,
        error: err?.message || 'Lỗi gửi lệnh in ESC/POS tới máy in.',
      };
    }
  });

  const settledResults = await Promise.allSettled(settledPromises);

  const results: PrintBillResult[] = settledResults.map((r, idx) => {
    const t = tasks[idx];
    const billType: BillType =
      t.ticket.ticketType === 'total' ? 'tong' : t.ticket.ticketType === 'food' ? 'com' : 'nuoc';

    if (r.status === 'fulfilled') {
      return r.value;
    }
    return {
      printerName: t.printerName || '(Không xác định)',
      ticketType: t.ticket.ticketType,
      billType,
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

