/** Trả về ngày mai theo định dạng YYYY-MM-DD (timezone local) */
export function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Trả về hôm nay YYYY-MM-DD */
export function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format tiền VNĐ */
export function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ';
}
