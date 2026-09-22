import { supabase } from '../lib/supabase';
import type {
  UserProfile,
  MenuItem,
  Order,
  AuditLog,
  QRExceptionToken,
  DeliveryMethod,
  TimeGateStatus,
} from '../types';
import { detectCurrentDevice } from '../utils/deviceDetector';
import { getTomorrowStr } from '../utils/date';

// ============================================================
// AUTH
// ============================================================

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return mapUser(data);
}

// ============================================================
// USERS
// ============================================================

export async function getUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data || []).map(mapUser);
}

export async function updateUserWallet(
  userId: string,
  newBalance: number,
  note?: string
) {
  const { error } = await supabase
    .from('users')
    .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;

  await supabase.from('wallet_transactions').insert({
    user_id: userId,
    amount: 0, // sẽ tính diff nếu cần
    type: 'manual',
    note: note || 'Cập nhật thủ công',
    balance_after: newBalance,
  });
}

// ============================================================
// MENU
// ============================================================

export async function getMenu(forDate?: string): Promise<MenuItem[]> {
  const date = forDate || getTomorrowStr();
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('for_date', date)
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (error) throw error;
  return (data || []).map(mapMenuItem);
}

export async function getAllMenuItems(forDate?: string): Promise<MenuItem[]> {
  const date = forDate || getTomorrowStr();
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('for_date', date)
    .order('category');
  if (error) throw error;
  return (data || []).map(mapMenuItem);
}

export async function createMenuItem(
  item: Omit<MenuItem, 'id'>,
  actor: UserProfile
): Promise<MenuItem> {
  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price,
      image_url: item.imageUrl,
      prepared_stock: item.preparedStock,
      current_stock: item.currentStock,
      is_active: item.isActive,
      for_date: item.forDate,
    })
    .select()
    .single();

  if (error) throw error;
  await addAuditLog({
    action: 'MENU_CREATE',
    actor,
    details: `Tạo món: ${item.name}`,
  });
  return mapMenuItem(data);
}

export async function updateMenuItem(
  id: string,
  updates: Partial<MenuItem>,
  actor: UserProfile
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.price !== undefined) payload.price = updates.price;
  if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
  if (updates.preparedStock !== undefined) payload.prepared_stock = updates.preparedStock;
  if (updates.currentStock !== undefined) payload.current_stock = updates.currentStock;
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;
  if (updates.forDate !== undefined) payload.for_date = updates.forDate;

  const { error } = await supabase.from('menu_items').update(payload).eq('id', id);
  if (error) throw error;

  await addAuditLog({
    action: 'MENU_UPDATE',
    actor,
    details: `Cập nhật món id=${id}`,
  });
}

// ============================================================
// ORDERS
// ============================================================

export async function placeOrder(params: {
  items: { menuItemId: string; quantity: number }[];
  deliveryMethod: DeliveryMethod;
  roomNumber?: string;
  pickupTime: string;
  isExceptionOrder?: boolean;
  exceptionToken?: string;
}): Promise<{ success: boolean; order_id?: string; order_code?: string; total_amount?: number; error?: string }> {
  const device = detectCurrentDevice();

  const { data, error } = await supabase.rpc('place_order', {
    p_items: params.items.map((i) => ({
      menu_item_id: i.menuItemId,
      quantity: i.quantity,
    })),
    p_delivery_method: params.deliveryMethod,
    p_room_number: params.roomNumber || null,
    p_pickup_time: params.pickupTime,
    p_is_exception: params.isExceptionOrder || false,
    p_exception_token: params.exceptionToken || null,
    p_device_info: device,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return data as any;
}

export async function cancelOrder(
  orderId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason || null,
  });
  if (error) return { success: false, error: error.message };
  return data as any;
}

export async function getOrders(filters?: {
  targetDate?: string;
  userId?: string;
  status?: string;
}): Promise<Order[]> {
  let query = supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });

  if (filters?.targetDate) query = query.eq('target_date', filters.targetDate);
  if (filters?.userId) query = query.eq('user_id', filters.userId);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapOrder);
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  actor: UserProfile
) {
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;

  await addAuditLog({
    action: 'ORDER_PLACED', // hoặc tạo action mới nếu cần
    actor,
    details: `Cập nhật trạng thái đơn ${orderId} → ${status}`,
  });
}

// ============================================================
// QR TOKENS
// ============================================================

export async function createQRToken(
  actor: UserProfile,
  note?: string,
  expiresInMinutes = 15
): Promise<QRExceptionToken> {
  const token = `QR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('qr_exception_tokens')
    .insert({
      token,
      expires_at: expiresAt,
      created_by: actor.id,
      created_by_name: actor.name,
      note: note || null,
    })
    .select()
    .single();

  if (error) throw error;

  await addAuditLog({
    action: 'QR_TOKEN_GENERATED',
    actor,
    details: `Tạo QR token: ${token}`,
  });

  return mapQRToken(data);
}

export async function getQRTokens(): Promise<QRExceptionToken[]> {
  const { data, error } = await supabase
    .from('qr_exception_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(mapQRToken);
}

// ============================================================
// AUDIT LOGS
// ============================================================

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapAuditLog);
}

async function addAuditLog(params: {
  action: AuditLog['action'];
  actor: UserProfile;
  details: string;
}) {
  await supabase.from('audit_logs').insert({
    action: params.action,
    actor_id: params.actor.id,
    actor_name: params.actor.name,
    actor_role: params.actor.role,
    details: params.details,
  });
}

// ============================================================
// TIME GATE (client-side helper – server vẫn kiểm tra trong RPC)
// ============================================================

export function getTimeGateStatus(openHour = 7, closeHour = 16): TimeGateStatus {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const isOpen = hour >= openHour && hour < closeHour;

  return {
    isOpen,
    currentHour: hour,
    currentMinute: minute,
    message: isOpen
      ? `Hệ thống đang mở cửa đặt món (đến ${closeHour}:00)`
      : `Hệ thống đóng cửa. Mở lại từ ${openHour}:00 – ${closeHour}:00`,
    opensAt: `${String(openHour).padStart(2, '0')}:00`,
    closesAt: `${String(closeHour).padStart(2, '0')}:00`,
    remainingMinutes: isOpen ? (closeHour - hour) * 60 - minute : undefined,
  };
}

// ============================================================
// REALTIME
// ============================================================

export function subscribeRealtime(callback: () => void) {
  const channel = supabase
    .channel('canteen-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => callback())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => callback())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => callback())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================
// MAPPERS
// ============================================================

function mapUser(row: any): UserProfile {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    roleTitle: row.role_title || '',
    department: row.department || '',
    phoneNumber: row.phone_number || '',
    email: row.email,
    avatarUrl: row.avatar_url,
    defaultRoom: row.default_room,
    walletBalance: Number(row.wallet_balance ?? 0),
    monthlyAllowance: Number(row.monthly_allowance ?? 1000000),
    lastWalletResetDate: row.last_wallet_reset_date,
  };
}

function mapMenuItem(row: any): MenuItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || '',
    price: Number(row.price),
    imageUrl: row.image_url || '',
    preparedStock: Number(row.prepared_stock ?? 0),
    currentStock: Number(row.current_stock ?? 0),
    isActive: Boolean(row.is_active),
    forDate: row.for_date,
  };
}

function mapOrder(row: any): Order {
  return {
    id: row.id,
    orderCode: row.order_code,
    userId: row.user_id,
    userName: row.user_name || '',
    userPhone: row.user_phone || '',
    userDepartment: row.user_department || '',
    items: (row.order_items || []).map((i: any) => ({
      menuItemId: i.menu_item_id,
      name: i.name,
      price: Number(i.price),
      quantity: Number(i.quantity),
      imageUrl: i.image_url || '',
    })),
    totalAmount: Number(row.total_amount),
    deliveryMethod: row.delivery_method,
    roomNumber: row.room_number,
    pickupTime: row.pickup_time || '',
    targetDate: row.target_date,
    createdAt: row.created_at,
    status: row.status,
    cancellationDeadline: row.cancellation_deadline,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    isExceptionOrder: row.is_exception_order,
    exceptionTokenUsed: row.exception_token_used,
    deviceInfo: row.device_info,
  };
}

function mapQRToken(row: any): QRExceptionToken {
  return {
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name || '',
    isUsed: Boolean(row.is_used),
    usedBy: row.used_by,
    usedAt: row.used_at,
    note: row.note,
  };
}

function mapAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    timestamp: row.timestamp,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name || '',
    actorRole: row.actor_role,
    details: row.details || '',
    ipAddress: row.ip_address,
    metadata: row.metadata,
  };
}
