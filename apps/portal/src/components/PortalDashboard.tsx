import { useState } from 'react';
import {
  formatVnd,
  createMenuItem,
  updateMenuItem,
  createQRToken,
  updateOrderStatus,
  getTomorrowStr,
  type UserProfile,
  type MenuItem,
  type Order,
  type AuditLog,
  type QRExceptionToken,
  type TimeGateStatus,
} from '@canteen/shared';

interface Props {
  currentUser: UserProfile;
  menu: MenuItem[];
  orders: Order[];
  users: UserProfile[];
  logs: AuditLog[];
  tokens: QRExceptionToken[];
  timeStatus: TimeGateStatus;
  onRefresh: () => void;
  onLogout: () => void;
}

type Tab = 'overview' | 'menu' | 'orders' | 'users' | 'qr' | 'logs';

export function PortalDashboard({
  currentUser,
  menu,
  orders,
  users,
  logs,
  tokens,
  timeStatus,
  onRefresh,
  onLogout,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [msg, setMsg] = useState<string | null>(null);

  const todayOrders = orders.filter((o) => o.status !== 'cancelled');
  const revenue = todayOrders.reduce((s, o) => s + o.totalAmount, 0);
  const teachers = users.filter((u) => u.role === 'teacher');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'menu', label: 'Thực đơn' },
    { id: 'orders', label: 'Đơn hàng' },
    { id: 'users', label: 'Thành viên' },
    { id: 'qr', label: 'QR Ngoại lệ' },
    { id: 'logs', label: 'Nhật ký' },
  ];

  const handleCreateQR = async () => {
    try {
      const token = await createQRToken(currentUser, 'Mã ngoại lệ từ Portal');
      setMsg(`Đã tạo QR: ${token.token} (hết hạn ${new Date(token.expiresAt).toLocaleTimeString('vi-VN')})`);
      onRefresh();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const handleToggleStock = async (item: MenuItem, delta: number) => {
    try {
      await updateMenuItem(
        item.id,
        { currentStock: Math.max(0, item.currentStock + delta) },
        currentUser
      );
      onRefresh();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏢</span>
          <div>
            <p className="font-semibold">Portal Canteen</p>
            <p className="text-xs text-slate-400">{currentUser.name} · {currentUser.roleTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className={timeStatus.isOpen ? 'text-emerald-400' : 'text-red-400'}>
            {timeStatus.isOpen ? '🟢 Đang mở đặt món' : '🔴 Đã đóng'}
          </span>
          <button onClick={onRefresh} className="text-slate-300 hover:text-white">
            Làm mới
          </button>
          <button onClick={onLogout} className="text-slate-300 hover:text-white">
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-52 bg-white border-r border-slate-200 py-4 flex-shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-5 py-2.5 text-sm font-medium ${
                tab === t.id
                  ? 'bg-slate-100 text-slate-900 border-r-2 border-slate-900'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">
          {msg && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              {msg}
              <button className="ml-3 underline" onClick={() => setMsg(null)}>
                Đóng
              </button>
            </div>
          )}

          {tab === 'overview' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-slate-800">Tổng quan ngày mai</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Đơn hàng" value={String(todayOrders.length)} />
                <StatCard label="Doanh thu dự kiến" value={formatVnd(revenue)} />
                <StatCard label="Giáo viên" value={String(teachers.length)} />
                <StatCard label="Món đang bán" value={String(menu.filter((m) => m.isActive).length)} />
              </div>

              <div className="bg-white rounded-2xl border p-5">
                <h2 className="font-semibold mb-3">Đơn gần nhất</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Mã</th>
                      <th className="pb-2">Người đặt</th>
                      <th className="pb-2">Tổng</th>
                      <th className="pb-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 8).map((o) => (
                      <tr key={o.id} className="border-b border-slate-50">
                        <td className="py-2 font-medium">{o.orderCode}</td>
                        <td>{o.userName}</td>
                        <td>{formatVnd(o.totalAmount)}</td>
                        <td>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{o.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'menu' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Thực đơn · {getTomorrowStr()}</h1>
              </div>
              <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Món</th>
                      <th className="text-left px-4 py-3">Danh mục</th>
                      <th className="text-right px-4 py-3">Giá</th>
                      <th className="text-center px-4 py-3">Tồn kho</th>
                      <th className="text-center px-4 py-3">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menu.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-slate-500">{item.category}</td>
                        <td className="px-4 py-3 text-right">{formatVnd(item.price)}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={
                              item.currentStock === 0
                                ? 'text-red-600 font-semibold'
                                : item.currentStock < 10
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                            }
                          >
                            {item.currentStock}
                          </span>
                          <span className="text-slate-400"> / {item.preparedStock}</span>
                        </td>
                        <td className="px-4 py-3 text-center space-x-1">
                          <button
                            onClick={() => handleToggleStock(item, -1)}
                            className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200"
                          >
                            −
                          </button>
                          <button
                            onClick={() => handleToggleStock(item, 1)}
                            className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200"
                          >
                            +
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {menu.length === 0 && (
                  <p className="p-8 text-center text-slate-500">Chưa có món nào cho ngày mai.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Đơn hàng</h1>
              <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Mã đơn</th>
                      <th className="text-left px-4 py-3">Người đặt</th>
                      <th className="text-left px-4 py-3">Phòng / Hình thức</th>
                      <th className="text-right px-4 py-3">Tổng</th>
                      <th className="text-left px-4 py-3">Giờ nhận</th>
                      <th className="text-left px-4 py-3">Trạng thái</th>
                      <th className="text-center px-4 py-3">Cập nhật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium">{o.orderCode}</td>
                        <td className="px-4 py-3">
                          <div>{o.userName}</div>
                          <div className="text-xs text-slate-400">{o.userDepartment}</div>
                        </td>
                        <td className="px-4 py-3">
                          {o.deliveryMethod === 'room_delivery' ? o.roomNumber || 'Giao phòng' : 'Ăn tại chỗ'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatVnd(o.totalAmount)}</td>
                        <td className="px-4 py-3">{o.pickupTime}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{o.status}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {o.status === 'confirmed' && (
                            <button
                              onClick={async () => {
                                await updateOrderStatus(o.id, 'preparing', currentUser);
                                onRefresh();
                              }}
                              className="text-xs text-teal-700 underline"
                            >
                              Chuẩn bị
                            </button>
                          )}
                          {o.status === 'preparing' && (
                            <button
                              onClick={async () => {
                                await updateOrderStatus(o.id, 'completed', currentUser);
                                onRefresh();
                              }}
                              className="text-xs text-emerald-700 underline"
                            >
                              Hoàn thành
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'users' && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Thành viên & Ví</h1>
              <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Họ tên</th>
                      <th className="text-left px-4 py-3">Vai trò</th>
                      <th className="text-left px-4 py-3">Phòng ban</th>
                      <th className="text-right px-4 py-3">Số dư ví</th>
                      <th className="text-right px-4 py-3">Hạn mức tháng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium">{u.name}</td>
                        <td className="px-4 py-3">{u.roleTitle || u.role}</td>
                        <td className="px-4 py-3 text-slate-500">{u.department}</td>
                        <td className="px-4 py-3 text-right font-semibold text-teal-700">
                          {formatVnd(u.walletBalance)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {formatVnd(u.monthlyAllowance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'qr' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">QR Ngoại lệ</h1>
                <button
                  onClick={handleCreateQR}
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium"
                >
                  + Tạo mã QR mới
                </button>
              </div>
              <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Token</th>
                      <th className="text-left px-4 py-3">Tạo bởi</th>
                      <th className="text-left px-4 py-3">Hết hạn</th>
                      <th className="text-left px-4 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t) => (
                      <tr key={t.token} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-mono text-xs">{t.token}</td>
                        <td className="px-4 py-3">{t.createdByName}</td>
                        <td className="px-4 py-3">{new Date(t.expiresAt).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3">
                          {t.isUsed ? (
                            <span className="text-slate-400">Đã dùng</span>
                          ) : new Date(t.expiresAt) < new Date() ? (
                            <span className="text-red-500">Hết hạn</span>
                          ) : (
                            <span className="text-emerald-600 font-medium">Còn hiệu lực</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Nhật ký hệ thống</h1>
              <div className="bg-white rounded-2xl border divide-y">
                {logs.map((l) => (
                  <div key={l.id} className="px-4 py-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-800">{l.action}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(l.timestamp).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{l.details}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {l.actorName} ({l.actorRole})
                    </p>
                  </div>
                ))}
                {logs.length === 0 && (
                  <p className="p-8 text-center text-slate-500">Chưa có nhật ký.</p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
  );
}
