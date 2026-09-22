import { supabase, isSupabaseConfigured } from '../lib/supabase';
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

const checkSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Hệ thống chưa cấu hình biến môi trường Supabase (VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY).'
    );
  }
};

// ============================================================
// AUTH
// ============================================================

export async function login(email: string, password: string) {
  checkSupabase();
  const cleanEmail = email.trim();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Email hoặc mật khẩu không chính xác trên hệ thống.');
    }
    if (msg.toLowerCase().includes('email not confirmed')) {
      throw new Error(
        'Email chưa được kích hoạt. Vui lòng kiểm tra hộp thư hoặc tắt tùy chọn "Confirm email" trong cài đặt Supabase Auth.'
      );
    }
    throw new Error(msg || 'Đăng nhập không thành công.');
  }

  return data;
}

export async function signUp(
  email: string,
  password: string,
  fullName?: string,
  role: string = 'teacher'
) {
  checkSupabase();
  const cleanEmail = email.trim();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: fullName || cleanEmail.split('@')[0],
        role,
      },
    },
  });

  if (error) {
    throw new Error(error.message || 'Đăng ký tài khoản thất bại.');
  }

  // Khởi tạo hồ sơ người dùng trong bảng users trên Supabase
  if (data?.user) {
    try {
      const roleTitle =
        role === 'admin'
          ? 'Quản lý Căn tin'
          : role === 'data_entry'
          ? 'Nhân viên Bếp'
          : role === 'executive'
          ? 'Ban Giám hiệu'
          : 'Giáo viên';

      await supabase.from('users').upsert({
        id: data.user.id,
        auth_user_id: data.user.id,
        name: fullName || cleanEmail.split('@')[0],
        email: cleanEmail,
        role,
        role_title: roleTitle,
        wallet_balance: 1000000,
        monthly_allowance: 1000000,
        is_active: true,
      });
    } catch (e) {
      console.warn('Profile initialization note:', e);
    }
  }

  return data;
}

export async function logout() {
  checkSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    let { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!data && user.email) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('*')
        .eq('email', user.email)
        .eq('is_active', true)
        .maybeSingle();
      if (byEmail) {
        data = byEmail;
        await supabase.from('users').update({ auth_user_id: user.id }).eq('id', byEmail.id);
      }
    }

    if (!data) {
      // Tự động đồng bộ hồ sơ cho tài khoản vừa đăng nhập vào bảng users
      const role =
        user.user_metadata?.role ||
        (user.email?.includes('admin') || user.email === 'trantuandai2508@gmail.com'
          ? 'admin'
          : user.email?.includes('bep')
          ? 'data_entry'
          : user.email?.includes('hieutruong')
          ? 'executive'
          : 'teacher');

      const roleTitle =
        role === 'admin'
          ? 'Quản lý Căn tin'
          : role === 'data_entry'
          ? 'Nhân viên Bếp'
          : role === 'executive'
          ? 'Ban Giám hiệu'
          : 'Giáo viên';

      const newRow = {
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Cán bộ Căn tin',
        role,
        role_title: roleTitle,
        email: user.email || '',
        auth_user_id: user.id,
        wallet_balance: 1000000,
        monthly_allowance: 1000000,
        is_active: true,
      };

      try {
        const { data: inserted } = await supabase.from('users').insert(newRow).select().maybeSingle();
        if (inserted) {
          data = inserted;
        }
      } catch (e) {
        console.warn('Profile sync note:', e);
      }

      if (!data) {
        return {
          id: user.id,
          name: newRow.name,
          role,
          roleTitle,
          department: 'Trường học',
          phoneNumber: '',
          email: user.email || '',
          walletBalance: 1000000,
          monthlyAllowance: 1000000,
        };
      }
    }

    return mapUser(data);
  } catch (err) {
    console.error('[Supabase getCurrentUserProfile error]', err);
    return null;
  }
}

// ============================================================
// USERS
// ============================================================

export async function getUsers(): Promise<UserProfile[]> {
  checkSupabase();
  const { data, error } = await supabase.from('users').select('*').order('name');
  if (error) throw new Error(error.message);
  return (data || []).map(mapUser);
}

export async function createUserByAdmin(
  params: {
    name: string;
    email: string;
    password?: string;
    role: string;
    department?: string;
    phoneNumber?: string;
    defaultRoom?: string;
    walletBalance?: number;
    monthlyAllowance?: number;
  },
  actor: UserProfile
): Promise<UserProfile> {
  checkSupabase();
  const cleanEmail = params.email.trim().toLowerCase();
  const pwd = params.password?.trim() || 'Canteen@123456';

  let authUserId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Thử đăng ký Supabase Auth
  try {
    const { data: authData } = await supabase.auth.signUp({
      email: cleanEmail,
      password: pwd,
      options: {
        data: {
          full_name: params.name.trim(),
          role: params.role,
        },
      },
    });
    if (authData?.user?.id) {
      authUserId = authData.user.id;
    }
  } catch (e) {
    console.warn('Auth signup note on createUserByAdmin:', e);
  }

  const roleTitle =
    params.role === 'admin'
      ? 'Quản lý Căn tin'
      : params.role === 'data_entry'
      ? 'Nhân viên Bếp'
      : params.role === 'executive'
      ? 'Ban Giám hiệu'
      : 'Giáo viên';

  const newRow = {
    id: authUserId,
    auth_user_id: authUserId,
    name: params.name.trim(),
    email: cleanEmail,
    role: params.role,
    role_title: roleTitle,
    department: params.department || 'Bộ phận nhà trường',
    phone_number: params.phoneNumber || '',
    default_room: params.defaultRoom || '',
    wallet_balance: params.walletBalance ?? 1000000,
    monthly_allowance: params.monthlyAllowance ?? 1000000,
    is_active: true,
  };

  const { data, error } = await supabase.from('users').upsert(newRow).select().single();
  if (error) {
    throw new Error(`Lỗi tạo thành viên trong bảng users: ${error.message}`);
  }

  await addAuditLog({
    action: 'USER_ROLE_CHANGED',
    actor,
    details: `Tạo tài khoản cán bộ mới: ${params.name} (${cleanEmail}) - Vai trò: ${roleTitle}`,
  });

  return mapUser(data);
}

export async function updateUserWallet(
  userId: string,
  newBalance: number,
  note?: string
) {
  checkSupabase();
  const { error } = await supabase
    .from('users')
    .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(`Cập nhật số dư thất bại: ${error.message}`);

  try {
    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      amount: 0,
      type: 'manual',
      note: note || 'Cập nhật số dư ví Căn tin',
      balance_after: newBalance,
    });
  } catch {
    // optional audit
  }
}

// ============================================================
// MENU
// ============================================================

export async function getMenu(forDate?: string): Promise<MenuItem[]> {
  checkSupabase();
  const date = forDate || getTomorrowStr();

  // Ưu tiên lấy món theo ngày phục vụ
  let { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('for_date', date)
    .eq('is_active', true)
    .order('category')
    .order('name');

  // Nếu ngày chỉ định chưa có món, hiển thị các món ăn active chung của Căn tin
  if (!error && (!data || data.length === 0)) {
    const { data: allActive, error: allErr } = await supabase
      .from('menu_items')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('name');

    if (!allErr && allActive && allActive.length > 0) {
      data = allActive;
    }
  }

  if (error) throw new Error(`Lỗi tải thực đơn: ${error.message}`);
  return (data || []).map(mapMenuItem);
}

export async function getAllMenuItems(forDate?: string): Promise<MenuItem[]> {
  checkSupabase();
  const date = forDate || getTomorrowStr();

  let { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('for_date', date)
    .order('category');

  if (!error && (!data || data.length === 0)) {
    const { data: allItems, error: allErr } = await supabase
      .from('menu_items')
      .select('*')
      .order('category');

    if (!allErr && allItems && allItems.length > 0) {
      data = allItems;
    }
  }

  if (error) throw new Error(`Lỗi tải danh mục món: ${error.message}`);
  return (data || []).map(mapMenuItem);
}

export async function createMenuItem(
  item: Omit<MenuItem, 'id'>,
  actor: UserProfile
): Promise<MenuItem> {
  checkSupabase();
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

  if (error) throw new Error(`Lỗi thêm món ăn: ${error.message}`);

  await addAuditLog({
    action: 'MENU_CREATE',
    actor,
    details: `Tạo món ăn: ${item.name} (${item.price.toLocaleString('vi-VN')} đ)`,
  });

  return mapMenuItem(data);
}

export async function updateMenuItem(
  id: string,
  updates: Partial<MenuItem>,
  actor: UserProfile
): Promise<void> {
  checkSupabase();
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
  if (error) throw new Error(`Lỗi cập nhật món ăn: ${error.message}`);

  await addAuditLog({
    action: 'MENU_UPDATE',
    actor,
    details: `Cập nhật món ID=${id}`,
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
  checkSupabase();
  const device = detectCurrentDevice();

  // 1. Thử gọi hàm RPC 'place_order' trên Supabase nếu đã tạo
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('place_order', {
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

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      const res = rpcData as { success?: boolean; error?: string; order_id?: string; order_code?: string; total_amount?: number };
      if (res.success) {
        return {
          success: true,
          order_id: res.order_id,
          order_code: res.order_code,
          total_amount: res.total_amount,
        };
      }
      if (res.error) {
        return { success: false, error: res.error };
      }
    }
  } catch {
    // Nếu RPC chưa cài đặt trên database, thực thi trực tiếp qua các bảng Supabase
  }

  // 2. Thực thi giao dịch trực tiếp qua bảng Supabase (Direct table transactions)
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { success: false, error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' };
  }

  // Lấy thông tin người dùng từ bảng users
  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('*')
    .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id}`)
    .maybeSingle();

  if (userErr || !userData) {
    return { success: false, error: 'Không tìm thấy hồ sơ người dùng trên hệ thống.' };
  }

  // Lấy chi tiết món ăn từ bảng menu_items
  const itemIds = params.items.map((i) => i.menuItemId);
  const { data: menuList, error: menuErr } = await supabase
    .from('menu_items')
    .select('*')
    .in('id', itemIds);

  if (menuErr || !menuList || menuList.length === 0) {
    return { success: false, error: 'Không thể tải thông tin món ăn từ cơ sở dữ liệu.' };
  }

  let totalAmount = 0;
  const orderItemsData: {
    menu_item_id: string;
    name: string;
    price: number;
    quantity: number;
    image_url: string;
  }[] = [];

  for (const requestedItem of params.items) {
    const menuItem = menuList.find((m) => m.id === requestedItem.menuItemId);
    if (!menuItem) {
      return { success: false, error: `Món ăn không tồn tại hoặc đã bị gỡ bỏ.` };
    }
    if (menuItem.current_stock < requestedItem.quantity) {
      return {
        success: false,
        error: `Món "${menuItem.name}" chỉ còn ${menuItem.current_stock} suất, không đủ ${requestedItem.quantity} suất yêu cầu.`,
      };
    }
    const itemTotal = Number(menuItem.price) * requestedItem.quantity;
    totalAmount += itemTotal;
    orderItemsData.push({
      menu_item_id: menuItem.id,
      name: menuItem.name,
      price: Number(menuItem.price),
      quantity: requestedItem.quantity,
      image_url: menuItem.image_url || '',
    });
  }

  // Kiểm tra số dư ví
  if (Number(userData.wallet_balance) < totalAmount) {
    return {
      success: false,
      error: `Số dư ví không đủ. Cần ${totalAmount.toLocaleString('vi-VN')} đ, số dư hiện có ${Number(userData.wallet_balance).toLocaleString('vi-VN')} đ.`,
    };
  }

  // Tạo mã đơn hàng chuẩn hoá POS: #CT-2026-XXXX
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const orderCode = `#CT-${new Date().getFullYear()}-${randomSuffix}`;
  const targetDate = getTomorrowStr();

  // Tạo đơn hàng trong bảng orders
  const { data: newOrder, error: orderInsertErr } = await supabase
    .from('orders')
    .insert({
      order_code: orderCode,
      user_id: userData.id,
      user_name: userData.name,
      user_phone: userData.phone_number || '',
      user_department: userData.department || '',
      total_amount: totalAmount,
      delivery_method: params.deliveryMethod,
      room_number: params.deliveryMethod === 'room_delivery' ? params.roomNumber || null : null,
      pickup_time: params.pickupTime,
      target_date: targetDate,
      status: 'confirmed',
      is_exception_order: params.isExceptionOrder || false,
      exception_token_used: params.exceptionToken || null,
      device_info: device,
    })
    .select()
    .single();

  if (orderInsertErr || !newOrder) {
    return { success: false, error: `Lỗi tạo đơn hàng: ${orderInsertErr?.message || 'Không rõ nguyên nhân'}` };
  }

  // Thêm chi tiết món ăn vào bảng order_items
  const itemsToInsert = orderItemsData.map((it) => ({
    order_id: newOrder.id,
    ...it,
  }));
  await supabase.from('order_items').insert(itemsToInsert);

  // Trừ số lượng tồn kho của món ăn
  for (const it of params.items) {
    const curr = menuList.find((m) => m.id === it.menuItemId);
    if (curr) {
      await supabase
        .from('menu_items')
        .update({ current_stock: Math.max(0, curr.current_stock - it.quantity) })
        .eq('id', it.menuItemId);
    }
  }

  // Trừ số dư ví của người dùng
  const newBalance = Number(userData.wallet_balance) - totalAmount;
  await supabase
    .from('users')
    .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userData.id);

  // Ghi nhật ký giao dịch ví
  await supabase.from('wallet_transactions').insert({
    user_id: userData.id,
    amount: -totalAmount,
    type: 'order_payment',
    order_id: newOrder.id,
    note: `Thanh toán đơn hàng ${orderCode}`,
    balance_after: newBalance,
  });

  return {
    success: true,
    order_id: newOrder.id,
    order_code: orderCode,
    total_amount: totalAmount,
  };
}

export async function cancelOrder(
  orderId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  checkSupabase();

  // 1. Thử gọi RPC 'cancel_order' nếu có
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_reason: reason || null,
    });
    if (!rpcError && rpcData && typeof rpcData === 'object') {
      const res = rpcData as { success?: boolean; error?: string };
      if (res.success) return { success: true };
      if (res.error) return { success: false, error: res.error };
    }
  } catch {
    // Tiếp tục xử lý bằng bảng trực tiếp nếu RPC chưa có
  }

  // 2. Cập nhật trạng thái hủy trực tiếp trên Supabase
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) {
    return { success: false, error: 'Không tìm thấy thông tin đơn hàng.' };
  }

  if (order.status === 'cancelled') {
    return { success: false, error: 'Đơn hàng này đã được hủy trước đó.' };
  }

  if (order.status === 'completed') {
    return { success: false, error: 'Đơn hàng đã hoàn thành, không thể hủy.' };
  }

  // Cập nhật trạng thái đơn thành cancelled
  const { error: updateErr } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason || 'Người dùng hủy đơn',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateErr) {
    return { success: false, error: `Lỗi cập nhật hủy đơn: ${updateErr.message}` };
  }

  // Hoàn tiền lại ví cho người dùng
  const { data: user } = await supabase.from('users').select('*').eq('id', order.user_id).single();
  if (user) {
    const refundBalance = Number(user.wallet_balance) + Number(order.total_amount);
    await supabase
      .from('users')
      .update({ wallet_balance: refundBalance, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    await supabase.from('wallet_transactions').insert({
      user_id: user.id,
      amount: Number(order.total_amount),
      type: 'order_refund',
      order_id: order.id,
      note: `Hoàn tiền hủy đơn ${order.order_code}`,
      balance_after: refundBalance,
    });
  }

  // Phục hồi lại số lượng tồn kho món ăn
  if (order.order_items && Array.isArray(order.order_items)) {
    for (const it of order.order_items) {
      const { data: mItem } = await supabase.from('menu_items').select('*').eq('id', it.menu_item_id).maybeSingle();
      if (mItem) {
        await supabase
          .from('menu_items')
          .update({ current_stock: mItem.current_stock + it.quantity })
          .eq('id', it.menu_item_id);
      }
    }
  }

  return { success: true };
}

export async function getOrders(filters?: {
  targetDate?: string;
  userId?: string;
  status?: string;
}): Promise<Order[]> {
  checkSupabase();
  let query = supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });

  if (filters?.targetDate) query = query.eq('target_date', filters.targetDate);
  if (filters?.userId) query = query.eq('user_id', filters.userId);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw new Error(`Lỗi tải danh sách đơn hàng: ${error.message}`);
  return (data || []).map(mapOrder);
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  actor: UserProfile
) {
  checkSupabase();
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) throw new Error(`Lỗi cập nhật trạng thái đơn: ${error.message}`);

  await addAuditLog({
    action: 'ORDER_PLACED',
    actor,
    details: `Cập nhật trạng thái đơn ${orderId} thành "${status}"`,
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
  checkSupabase();
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

  if (error) throw new Error(`Lỗi tạo mã QR ngoại lệ: ${error.message}`);

  await addAuditLog({
    action: 'QR_TOKEN_GENERATED',
    actor,
    details: `Tạo mã QR ngoại lệ: ${token} (hiệu lực ${expiresInMinutes} phút)`,
  });

  return mapQRToken(data);
}

export async function getQRTokens(): Promise<QRExceptionToken[]> {
  checkSupabase();
  const { data, error } = await supabase
    .from('qr_exception_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`Lỗi tải danh sách mã QR: ${error.message}`);
  return (data || []).map(mapQRToken);
}

// ============================================================
// AUDIT LOGS
// ============================================================

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  checkSupabase();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Lỗi tải nhật ký hệ thống: ${error.message}`);
  return (data || []).map(mapAuditLog);
}

async function addAuditLog(params: {
  action: AuditLog['action'];
  actor: UserProfile;
  details: string;
}) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('audit_logs').insert({
      action: params.action,
      actor_id: params.actor.id,
      actor_name: params.actor.name,
      actor_role: params.actor.role,
      details: params.details,
    });
  } catch (e) {
    console.warn('[Audit log notice]:', e);
  }
}

// ============================================================
// TIME GATE & CONFIGURATION
// ============================================================

const TIME_GATE_STORAGE_KEY = 'canteen_time_gate_config';

export function getCustomTimeGateConfig(): { openTime: string; closeTime: string } {
  try {
    const saved = localStorage.getItem(TIME_GATE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.openTime && parsed.closeTime) return parsed;
    }
  } catch {
    // fallback
  }
  return { openTime: '07:00', closeTime: '16:00' };
}

export async function setCustomTimeGateConfig(
  openTime: string,
  closeTime: string,
  actor?: UserProfile
): Promise<void> {
  try {
    localStorage.setItem(TIME_GATE_STORAGE_KEY, JSON.stringify({ openTime, closeTime }));
    if (isSupabaseConfigured && supabase) {
      await supabase.from('system_settings').upsert({
        key: 'time_gate_config',
        value: { openTime, closeTime, updated_by: actor?.name || 'Admin', updated_at: new Date().toISOString() },
      });
    }
    if (actor) {
      await addAuditLog({
        action: 'TIMEGATE_OVERRIDE',
        actor,
        details: `Cập nhật khung giờ nhận đơn thường: ${openTime} - ${closeTime}`,
      });
    }
  } catch (e) {
    console.warn('Set time gate config notice:', e);
  }
}

export function getTimeGateStatus(customOpenHour?: number, customCloseHour?: number): TimeGateStatus {
  const cfg = getCustomTimeGateConfig();
  const [cfgOpenH, cfgOpenM] = cfg.openTime.split(':').map(Number);
  const [cfgCloseH, cfgCloseM] = cfg.closeTime.split(':').map(Number);

  const openH = customOpenHour ?? (isNaN(cfgOpenH) ? 7 : cfgOpenH);
  const openM = isNaN(cfgOpenM) ? 0 : cfgOpenM;
  const closeH = customCloseHour ?? (isNaN(cfgCloseH) ? 16 : cfgCloseH);
  const closeM = isNaN(cfgCloseM) ? 0 : cfgCloseM;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

  return {
    isOpen,
    currentHour: now.getHours(),
    currentMinute: now.getMinutes(),
    message: isOpen
      ? `Căn tin đang nhận đơn đặt suất (đến ${cfg.closeTime})`
      : `Căn tin đã đóng cổng đặt món. Mở lại từ ${cfg.openTime} – ${cfg.closeTime}`,
    opensAt: cfg.openTime,
    closesAt: cfg.closeTime,
    remainingMinutes: isOpen ? closeMinutes - currentMinutes : undefined,
  };
}

/**
 * Đọc file ảnh từ máy tính cá nhân thành Data URL base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// ============================================================
// REALTIME
// ============================================================

export function subscribeRealtime(callback: () => void) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }
  try {
    const channel = supabase
      .channel('canteen-realtime-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => callback())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
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
