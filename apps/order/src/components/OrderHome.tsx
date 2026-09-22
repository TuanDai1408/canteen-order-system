import { useState } from 'react';
import {
  placeOrder,
  cancelOrder,
  formatVnd,
  type UserProfile,
  type MenuItem,
  type Order,
  type TimeGateStatus,
  type DeliveryMethod,
} from '@canteen/shared';

interface Props {
  currentUser: UserProfile;
  menu: MenuItem[];
  orders: Order[];
  timeStatus: TimeGateStatus;
  error: string | null;
  onRefresh: () => void;
  onLogout: () => void;
  onUserUpdate: (u: UserProfile) => void;
}

export function OrderHome({
  currentUser,
  menu,
  orders,
  timeStatus,
  error,
  onRefresh,
  onLogout,
}: Props) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('dine_in');
  const [roomNumber, setRoomNumber] = useState(currentUser.defaultRoom || '');
  const [pickupTime, setPickupTime] = useState('11:30');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');

  const addToCart = (id: string) => {
    setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  };
  const removeFromCart = (id: string) => {
    setCart((c) => {
      const next = { ...c };
      if (next[id] <= 1) delete next[id];
      else next[id] -= 1;
      return next;
    });
  };

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => {
      const item = menu.find((m) => m.id === id);
      return item ? { item, qty } : null;
    })
    .filter(Boolean) as { item: MenuItem; qty: number }[];

  const total = cartItems.reduce((s, { item, qty }) => s + item.price * qty, 0);

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;
    if (deliveryMethod === 'room_delivery' && !roomNumber.trim()) {
      setMessage({ type: 'err', text: 'Vui lòng nhập số phòng khi chọn giao phòng' });
      return;
    }
    if (!timeStatus.isOpen) {
      setMessage({ type: 'err', text: timeStatus.message });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await placeOrder({
        items: cartItems.map(({ item, qty }) => ({
          menuItemId: item.id,
          quantity: qty,
        })),
        deliveryMethod,
        roomNumber: deliveryMethod === 'room_delivery' ? roomNumber : undefined,
        pickupTime,
      });

      if (!result.success) {
        setMessage({ type: 'err', text: result.error || 'Đặt món thất bại' });
      } else {
        setMessage({
          type: 'ok',
          text: `Đặt thành công! Mã đơn: ${result.order_code} — Tổng ${formatVnd(result.total_amount || total)}`,
        });
        setCart({});
        onRefresh();
      }
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message || 'Lỗi kết nối' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm('Bạn chắc chắn muốn hủy đơn này?')) return;
    const result = await cancelOrder(orderId, 'Hủy bởi người dùng');
    if (result.success) {
      setMessage({ type: 'ok', text: 'Đã hủy đơn thành công' });
      onRefresh();
    } else {
      setMessage({ type: 'err', text: result.error || 'Không thể hủy đơn' });
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-teal-700 text-white px-4 py-3 shadow">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-xs text-teal-100">Xin chào</p>
            <p className="font-semibold truncate max-w-[200px]">{currentUser.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-teal-100">Số dư ví</p>
            <p className="font-bold">{formatVnd(currentUser.walletBalance)}</p>
          </div>
        </div>
        <div className="max-w-lg mx-auto mt-2 flex gap-2 text-xs">
          <span
            className={`px-2 py-0.5 rounded-full ${
              timeStatus.isOpen ? 'bg-emerald-400/30 text-emerald-100' : 'bg-red-400/30 text-red-100'
            }`}
          >
            {timeStatus.isOpen ? '🟢 Đang mở đặt món' : '🔴 Đã đóng cửa'}
          </span>
          <button onClick={onLogout} className="ml-auto underline opacity-80 hover:opacity-100">
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-lg mx-auto px-4 mt-4 flex gap-2">
        <button
          onClick={() => setTab('menu')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${
            tab === 'menu' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border'
          }`}
        >
          Thực đơn
        </button>
        <button
          onClick={() => setTab('orders')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${
            tab === 'orders' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border'
          }`}
        >
          Đơn của tôi ({orders.filter((o) => o.status !== 'cancelled').length})
        </button>
      </div>

      {error && (
        <div className="max-w-lg mx-auto px-4 mt-3 text-sm text-red-600 bg-red-50 rounded-xl p-3">
          {error}
        </div>
      )}
      {message && (
        <div
          className={`max-w-lg mx-auto px-4 mt-3 text-sm rounded-xl p-3 ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 mt-4 space-y-3">
        {tab === 'menu' && (
          <>
            {menu.length === 0 && (
              <p className="text-center text-slate-500 py-12">Chưa có thực đơn cho ngày mai.</p>
            )}
            {menu.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex"
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-24 h-24 object-cover flex-shrink-0"
                  />
                )}
                <div className="p-3 flex-1 flex flex-col">
                  <div className="flex justify-between gap-2">
                    <h3 className="font-semibold text-slate-800 text-sm leading-snug">{item.name}</h3>
                    <span className="text-teal-700 font-bold text-sm whitespace-nowrap">
                      {formatVnd(item.price)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.description}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span
                      className={`text-xs ${
                        item.currentStock > 5
                          ? 'text-emerald-600'
                          : item.currentStock > 0
                            ? 'text-amber-600'
                            : 'text-red-500'
                      }`}
                    >
                      Còn {item.currentStock} suất
                    </span>
                    <div className="flex items-center gap-2">
                      {(cart[item.id] || 0) > 0 && (
                        <>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-medium">{cart[item.id]}</span>
                        </>
                      )}
                      <button
                        onClick={() => addToCart(item.id)}
                        disabled={item.currentStock <= (cart[item.id] || 0)}
                        className="w-7 h-7 rounded-full bg-teal-600 text-white font-bold disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'orders' && (
          <>
            {orders.length === 0 && (
              <p className="text-center text-slate-500 py-12">Bạn chưa có đơn nào.</p>
            )}
            {orders.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-800">{o.orderCode}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(o.createdAt).toLocaleString('vi-VN')} · {o.pickupTime}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      o.status === 'cancelled'
                        ? 'bg-red-50 text-red-600'
                        : o.status === 'completed'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {o.status}
                  </span>
                </div>
                <ul className="mt-2 text-sm text-slate-600 space-y-0.5">
                  {o.items.map((i, idx) => (
                    <li key={idx}>
                      {i.quantity}× {i.name}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between items-center">
                  <span className="font-semibold text-teal-700">{formatVnd(o.totalAmount)}</span>
                  {o.status === 'confirmed' && (
                    <button
                      onClick={() => handleCancel(o.id)}
                      className="text-xs text-red-600 underline"
                    >
                      Hủy đơn
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </main>

      {/* Cart bar */}
      {tab === 'menu' && cartItems.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-lg p-4">
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={deliveryMethod === 'dine_in'}
                  onChange={() => setDeliveryMethod('dine_in')}
                />
                Ăn tại chỗ
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={deliveryMethod === 'room_delivery'}
                  onChange={() => setDeliveryMethod('room_delivery')}
                />
                Giao phòng
              </label>
              {deliveryMethod === 'room_delivery' && (
                <input
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="Số phòng"
                  className="flex-1 px-2 py-1 border rounded-lg text-sm"
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <select
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="px-3 py-2 border rounded-xl text-sm"
              >
                {['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={handlePlaceOrder}
                disabled={submitting || !timeStatus.isOpen}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-semibold rounded-xl"
              >
                {submitting ? 'Đang gửi...' : `Đặt món · ${formatVnd(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
