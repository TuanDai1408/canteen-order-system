import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type {
  UserProfile,
  MenuItem,
  Order,
  QRExceptionToken,
  DeliveryMethod,
  TimeGateStatus,
} from '../types';
import { detectCurrentDevice } from '../utils/deviceDetector';
import { getTomorrowStr, formatVnd } from '../utils/date';

const checkSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Hệ thống chưa cấu hình biến môi trường Supabase (VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY).'
    );
  }
};

/**
 * Giới hạn thời gian truy vấn Supabase, ngăn chặn browser treo do statement_timeout
 */
export async function withQueryTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = 15000,
  fallbackMessage = 'Truy vấn quá thời gian phản hồi (timeout)'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

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
        is_active: false,
      },
    },
  });

  if (error) {
    throw new Error(error.message || 'Đăng ký tài khoản thất bại.');
  }

  // Khởi tạo hồ sơ người dùng trong bảng users trên Supabase với is_active = false và ví 0đ
  if (data?.user) {
    try {
      await supabase.from('users').upsert({
        id: data.user.id,
        auth_user_id: data.user.id,
        name: fullName || cleanEmail.split('@')[0],
        email: cleanEmail,
        role: 'teacher',
        role_title: 'Giáo viên',
        wallet_balance: 0,
        monthly_allowance: 0,
        is_active: false, // Chờ Admin phê duyệt và nạp ví
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

export function getCachedUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('canteen_user_profile_cache');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function setCachedUserProfile(profile: UserProfile | null) {
  try {
    if (profile) {
      localStorage.setItem('canteen_user_profile_cache', JSON.stringify(profile));
    } else {
      localStorage.removeItem('canteen_user_profile_cache');
    }
  } catch {}
}

const USERS_STORAGE_KEY = 'canteen_users_list_cache';

export function getCachedUsers(): UserProfile[] {
  try {
    const saved = localStorage.getItem(USERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

export function setCachedUsers(users: UserProfile[]) {
  try {
    if (Array.isArray(users) && users.length > 0) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    }
  } catch {}
}

const QR_TOKENS_STORAGE_KEY = 'canteen_qr_tokens_cache';

export function getCachedQRTokens(): QRExceptionToken[] {
  try {
    const saved = localStorage.getItem(QR_TOKENS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

export function setCachedQRTokens(tokens: QRExceptionToken[]) {
  try {
    if (Array.isArray(tokens) && tokens.length > 0) {
      localStorage.setItem(QR_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    }
  } catch {}
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    let { data } = await withQueryTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle(),
      12000,
      'Timeout fetch auth_user_id'
    ).catch(() => ({ data: null, error: null }));

    if (!data && user.email) {
      const { data: byEmail } = await withQueryTimeout(
        supabase
          .from('users')
          .select('*')
          .eq('email', user.email)
          .maybeSingle(),
        12000,
        'Timeout fetch byEmail'
      ).catch(() => ({ data: null, error: null }));

      if (byEmail) {
        data = byEmail;
        if (byEmail.auth_user_id !== user.id) {
          try {
            await supabase.from('users').update({ auth_user_id: user.id }).eq('id', byEmail.id);
          } catch {}
        }
      }
    }

    if (!data) {
      // Tự động đồng bộ hồ sơ cho tài khoản vừa đăng nhập vào bảng users
      const isStaff =
        user.email?.includes('admin') ||
        user.email === 'trantuandai2508@gmail.com' ||
        user.email?.includes('bep') ||
        user.email?.includes('hieutruong');

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

      const isActive = isStaff ? true : false;
      const initialWallet = isStaff ? 2000000 : 0;

      const newRow = {
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Cán bộ Căn tin',
        role,
        role_title: roleTitle,
        email: user.email || '',
        auth_user_id: user.id,
        wallet_balance: initialWallet,
        monthly_allowance: initialWallet,
        is_active: isActive,
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
        const fallbackProfile: UserProfile = {
          id: user.id,
          authUserId: user.id,
          name: newRow.name,
          role,
          roleTitle,
          department: 'Trường học',
          phoneNumber: '',
          email: user.email || '',
          walletBalance: initialWallet,
          monthlyAllowance: initialWallet,
          isActive,
        };
        setCachedUserProfile(fallbackProfile);
        return fallbackProfile;
      }
    }

    const mapped = mapUser(data);
    if (!mapped.authUserId && user.id) {
      mapped.authUserId = user.id;
    }
    setCachedUserProfile(mapped);
    return mapped;
  } catch (err) {
    console.error('[Supabase getCurrentUserProfile error]', err);
    return getCachedUserProfile();
  }
}

// ============================================================
// USERS
// ============================================================

export async function getUsers(): Promise<UserProfile[]> {
  checkSupabase();
  try {
    const { data, error } = await withQueryTimeout(
      supabase.from('users').select('*').order('name'),
      12000,
      'Timeout fetch users'
    );
    if (!error && data) {
      const list = data.map(mapUser);
      setCachedUsers(list);
      return list;
    }
    if (error) {
      console.warn('[getUsers notice]:', error.message);
    }
    return getCachedUsers();
  } catch (err) {
    console.warn('[getUsers error]:', err);
    return getCachedUsers();
  }
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

  return mapUser(data);
}

export async function approveUserAndFundWallet(
  params: {
    userId: string;
    walletAmount: number;
    note?: string;
  },
  actor: UserProfile
): Promise<UserProfile> {
  checkSupabase();
  const amount = Number(params.walletAmount || 0);

  // 1. Cập nhật trạng thái người dùng sang is_active = true và set số dư ví
  const { data: updatedUser, error: updateErr } = await supabase
    .from('users')
    .update({
      is_active: true,
      wallet_balance: amount,
      monthly_allowance: amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.userId)
    .select()
    .single();

  if (updateErr || !updatedUser) {
    throw new Error(`Không thể phê duyệt thành viên: ${updateErr?.message || 'Lỗi cơ sở dữ liệu'}`);
  }

  // 2. Ghi nhận giao dịch cấp ví ban đầu vào wallet_transactions
  if (amount > 0) {
    try {
      await supabase.from('wallet_transactions').insert({
        user_id: params.userId,
        amount: amount,
        type: 'allowance',
        reference_id: `APPROVAL-${Date.now()}`,
        balance_after: amount,
        note: params.note || 'Phê duyệt tài khoản & cấp hạn mức ví suất ăn ban đầu',
        created_by: actor.id,
      });
    } catch (txErr) {
      console.warn('Lỗi ghi transaction ví khi duyệt user:', txErr);
    }
  }

  return mapUser(updatedUser);
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

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'dish-com-suon',
    name: 'Cơm sườn cốt lết nướng mật ong',
    category: 'Cơm trưa',
    description: 'Sườn nướng mật ong vàng ruộm, trứng ốp la, dưa leo tươi mát và canh súp rau củ',
    price: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80',
    preparedStock: 50,
    currentStock: 45,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-com-ga',
    name: 'Cơm gà xối mỡ da giòn',
    category: 'Cơm trưa',
    description: 'Đùi gà góc tư chiên giòn, cơm rang tỏi thơm dẻo, kèm sốt chua ngọt và salad',
    price: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=80',
    preparedStock: 45,
    currentStock: 38,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-com-ca-kho',
    name: 'Cơm cá thu sốt cà chua',
    category: 'Cơm trưa',
    description: 'Cá sốt cà chua đậm đà hương vị gia đình, kèm canh mồng tơi cua đồng thanh nhiệt',
    price: 40000,
    imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500&auto=format&fit=crop&q=80',
    preparedStock: 30,
    currentStock: 26,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-pho-bo',
    name: 'Phở bò tái nạm đặc biệt',
    category: 'Bún / Phở',
    description: 'Bánh phở tươi, thịt bò tái nạm mềm thơm ngậy, nước hầm xương ống 12 tiếng cùng quẩy giòn',
    price: 40000,
    imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&auto=format&fit=crop&q=80',
    preparedStock: 40,
    currentStock: 34,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-bun-bo-hue',
    name: 'Bún bò giò heo xứ Huế',
    category: 'Bún / Phở',
    description: 'Bún sợi to đặc trưng, khoanh giò nạc, chả cua Huế và nước dùng cay nồng hương sả',
    price: 40000,
    imageUrl: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500&auto=format&fit=crop&q=80',
    preparedStock: 35,
    currentStock: 28,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-com-chay-nam',
    name: 'Cơm nấm đùi gà xào hạt sen (Chay)',
    category: 'Món Chay',
    description: 'Nấm tươi xào sốt tiêu đen, hạt sen bùi béo, đậu hũ non chiên giòn và canh rong biển',
    price: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80',
    preparedStock: 25,
    currentStock: 22,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-bun-cha-gio-chay',
    name: 'Bún chả giò chay rau sống',
    category: 'Món Chay',
    description: 'Chả giò khoai môn nấm mèo giòn rụm, đậu hũ nướng sả, nước mắm chay pha chua ngọt',
    price: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=80',
    preparedStock: 25,
    currentStock: 20,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-tra-dao',
    name: 'Trà đào cam sả hạt chia',
    category: 'Đồ uống / Tráng miệng',
    description: 'Trà thảo mộc ướp sả thanh mát, miếng đào giòn ngâm thơm ngon và hạt chia giàu dinh dưỡng',
    price: 15000,
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80',
    preparedStock: 60,
    currentStock: 50,
    isActive: true,
    forDate: '',
  },
  {
    id: 'dish-sua-chua',
    name: 'Sữa chua dẻo ngũ cốc trái cây',
    category: 'Đồ uống / Tráng miệng',
    description: 'Sữa chua tự nhiên nhà làm thơm mát, kiwi dâu tây tươi mọng cùng ngũ cốc giòn tan',
    price: 18000,
    imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=500&auto=format&fit=crop&q=80',
    preparedStock: 40,
    currentStock: 35,
    isActive: true,
    forDate: '',
  },
];

const MENU_STORAGE_KEY = 'canteen_menu_cache_v2';

export function getCachedMenu(): MenuItem[] {
  try {
    const raw = localStorage.getItem(MENU_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [...DEFAULT_MENU_ITEMS];
}

export function setCachedMenu(items: MenuItem[]) {
  try {
    if (Array.isArray(items) && items.length > 0) {
      localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {}
}

export async function getMenu(forDate?: string): Promise<MenuItem[]> {
  checkSupabase();

  try {
    let query = supabase
      .from('menu_items')
      .select('id, name, category, description, price, image_url, prepared_stock, current_stock, is_active, for_date')
      .eq('is_active', true);

    if (forDate) {
      query = query.or(`for_date.eq.${forDate},for_date.is.null,for_date.eq.''`);
    }

    const { data, error } = await withQueryTimeout(query, 15000, 'Supabase getMenu timeout');
    if (error) {
      console.warn('[Supabase getMenu query error]:', error.message);
      return getCachedMenu();
    }

    if (data && data.length > 0) {
      const mapped = data.map(mapMenuItem).sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
      setCachedMenu(mapped);
      return mapped;
    }
    return getCachedMenu();
  } catch (err: any) {
    console.warn('[getMenu fallback notice - timeout or network]:', err?.message || err);
    return getCachedMenu();
  }
}

export async function getAllMenuItems(forDate?: string): Promise<MenuItem[]> {
  checkSupabase();

  try {
    let query = supabase
      .from('menu_items')
      .select('id, name, category, description, price, image_url, prepared_stock, current_stock, is_active, for_date');

    if (forDate) {
      query = query.or(`for_date.eq.${forDate},for_date.is.null,for_date.eq.''`);
    }

    const { data, error } = await withQueryTimeout(query, 15000, 'Supabase getAllMenuItems timeout');
    if (error) {
      console.warn('[Supabase getAllMenuItems notice]:', error.message);
      return getCachedMenu();
    }

    if (data && data.length > 0) {
      const mapped = data.map(mapMenuItem).sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
      setCachedMenu(mapped);
      return mapped;
    }
    return getCachedMenu();
  } catch (err: any) {
    console.warn('[getAllMenuItems fallback notice]:', err?.message || err);
    return getCachedMenu();
  }
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

  const newItem = mapMenuItem(data);
  const current = getCachedMenu();
  setCachedMenu([newItem, ...current.filter((c) => c.id !== newItem.id)]);
  return newItem;
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

  const current = getCachedMenu();
  setCachedMenu(current.map((m) => (m.id === id ? { ...m, ...updates } : m)));
}

// ============================================================
// ORDERS
// ============================================================

export async function placeOrder(params: {
  items: {
    menuItemId: string;
    quantity: number;
    name?: string;
    price?: number;
    imageUrl?: string;
  }[];
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

  // Kiểm tra tài khoản đã được Quản trị Canteen phê duyệt chưa
  if (userData.is_active === false) {
    return {
      success: false,
      error: 'Tài khoản của bạn đang chờ Ban Quản Trị Canteen phê duyệt và cấp hạn mức ví suất ăn. Vui lòng liên hệ Quản lý Căn tin để được kích hoạt.',
    };
  }

  // Lấy chi tiết món ăn từ bảng menu_items hoặc cache
  const itemIds = params.items.map((i) => i.menuItemId);
  let menuList: any[] = [];
  try {
    const { data: fetchedMenu } = await withQueryTimeout(
      supabase
        .from('menu_items')
        .select('*')
        .in('id', itemIds),
      12000,
      'Timeout fetch menu items'
    );
    if (fetchedMenu && fetchedMenu.length > 0) {
      menuList = fetchedMenu;
    }
  } catch {}

  if (menuList.length === 0) {
    const cached = getCachedMenu();
    menuList = cached
      .filter((m) => itemIds.includes(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        price: m.price,
        current_stock: m.currentStock,
        image_url: m.imageUrl,
      }));
  }

  if (menuList.length === 0) {
    return { success: false, error: 'Không thể tải thông tin món ăn từ hệ thống.' };
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
    const itemName = menuItem?.name || requestedItem.name || 'Suất ăn Căn tin';
    const itemPrice = Number(menuItem?.price ?? requestedItem.price ?? 35000);
    const itemImg = menuItem?.image_url || menuItem?.imageUrl || requestedItem.imageUrl || '';
    const itemStock = menuItem ? Number(menuItem.current_stock ?? menuItem.currentStock ?? 999) : 999;

    if (itemStock < requestedItem.quantity) {
      return {
        success: false,
        error: `Món "${itemName}" chỉ còn ${itemStock} suất, không đủ ${requestedItem.quantity} suất yêu cầu.`,
      };
    }
    const itemTotal = itemPrice * requestedItem.quantity;
    totalAmount += itemTotal;
    orderItemsData.push({
      menu_item_id: requestedItem.menuItemId,
      name: itemName,
      price: itemPrice,
      quantity: requestedItem.quantity,
      image_url: itemImg,
    });
  }

  // Kiểm tra số dư ví
  if (Number(userData.wallet_balance) < totalAmount) {
    return {
      success: false,
      error: `Số dư ví không đủ. Cần ${totalAmount.toLocaleString('vi-VN')} đ, số dư hiện có ${Number(userData.wallet_balance).toLocaleString('vi-VN')} đ.`,
    };
  }

  // Tạo mã đơn hàng chuẩn hoá POS: CT-YYYYMMDD-XXX (Ví dụ: CT-20260923-012)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `CT-${yyyy}${mm}${dd}-`;

  const allCached = getCachedOrders();
  const todayCount = allCached.filter(
    (o) => o.orderCode && o.orderCode.startsWith(datePrefix)
  ).length;
  const seqStr = String(todayCount + 1).padStart(3, '0');
  const orderCode = `${datePrefix}${seqStr}`;
  const targetDate = getTomorrowStr();

  // Tạo đơn hàng trong bảng orders
  let newOrder: any = null;
  try {
    const { data: insertedOrder, error: orderInsertErr } = await withQueryTimeout(
      supabase
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
        .single(),
      15000,
      'Timeout creating order on Supabase'
    );
    if (!orderInsertErr && insertedOrder) {
      newOrder = insertedOrder;
    }
  } catch (e) {
    console.warn('[Supabase order insert notice - will save to local store]:', e);
  }

  const generatedId = newOrder ? newOrder.id : `ord-${Date.now()}`;

  // Kiểm tra UUID hợp lệ để không bị lỗi 22P02 khi insert vào Supabase
  const isValidUuid = (str?: string) =>
    !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  // Thêm chi tiết món ăn vào bảng order_items nếu đã tạo được order trên Supabase
  if (newOrder) {
    try {
      const itemsToInsert = orderItemsData.map((it) => ({
        order_id: newOrder.id,
        menu_item_id: isValidUuid(it.menu_item_id) ? it.menu_item_id : null,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        image_url: it.image_url || '',
      }));
      const { error: itemErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemErr) {
        console.error('[Supabase order_items insert error]:', itemErr.message);
      }

      // Trừ số lượng tồn kho của món ăn trên Supabase
      for (const it of params.items) {
        if (isValidUuid(it.menuItemId)) {
          const curr = menuList.find((m) => m.id === it.menuItemId);
          if (curr) {
            const currentStockVal = Number(curr.current_stock ?? curr.currentStock ?? 0);
            await supabase
              .from('menu_items')
              .update({ current_stock: Math.max(0, currentStockVal - it.quantity) })
              .eq('id', it.menuItemId);
          }
        }
      }
    } catch (e) {
      console.warn('Order items insert note:', e);
    }
  }

  // Trừ số dư ví của người dùng
  const newBalance = Number(userData.wallet_balance) - totalAmount;
  try {
    await supabase
      .from('users')
      .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', userData.id);

    // Ghi nhật ký giao dịch ví
    await supabase.from('wallet_transactions').insert({
      user_id: userData.id,
      amount: -totalAmount,
      type: 'order_payment',
      order_id: generatedId,
      note: `Thanh toán đơn hàng ${orderCode}`,
      balance_after: newBalance,
    });
  } catch (e) {
    console.warn('Wallet balance sync note:', e);
  }

  // Cập nhật tồn kho trong cache thực đơn
  const cachedMenu = getCachedMenu();
  const updatedCachedMenu = cachedMenu.map((m) => {
    const requested = params.items.find((it) => it.menuItemId === m.id);
    if (requested) {
      return { ...m, currentStock: Math.max(0, m.currentStock - requested.quantity) };
    }
    return m;
  });
  setCachedMenu(updatedCachedMenu);

  // Tạo và lưu đơn vào cache cục bộ để hiển thị ngay tức thì
  const localOrder: Order = {
    id: generatedId,
    orderCode,
    userId: userData.id,
    userName: userData.name,
    userPhone: userData.phone_number || '',
    userDepartment: userData.department || '',
    items: orderItemsData.map((it) => ({
      menuItemId: it.menu_item_id,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      imageUrl: it.image_url,
    })),
    totalAmount,
    deliveryMethod: params.deliveryMethod,
    roomNumber: params.deliveryMethod === 'room_delivery' ? params.roomNumber || undefined : undefined,
    pickupTime: params.pickupTime,
    targetDate,
    createdAt: new Date().toISOString(),
    status: 'confirmed',
    cancellationDeadline: '16:00',
    isExceptionOrder: params.isExceptionOrder || false,
    exceptionTokenUsed: params.exceptionToken || undefined,
    deviceInfo: device,
  };

  const userOrders = getCachedOrders(userData.id);
  setCachedOrders(
    [localOrder, ...userOrders.filter((o) => o.id !== localOrder.id && o.orderCode !== localOrder.orderCode)],
    userData.id
  );
  if (authUser.id && authUser.id !== userData.id) {
    const authOrders = getCachedOrders(authUser.id);
    setCachedOrders(
      [localOrder, ...authOrders.filter((o) => o.id !== localOrder.id && o.orderCode !== localOrder.orderCode)],
      authUser.id
    );
  }
  const allOrders = getCachedOrders();
  setCachedOrders(
    [localOrder, ...allOrders.filter((o) => o.id !== localOrder.id && o.orderCode !== localOrder.orderCode)]
  );

  return {
    success: true,
    order_id: generatedId,
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

export function getCachedOrders(userId?: string): Order[] {
  try {
    const key = `canteen_orders_cache_${userId || 'all'}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Nếu cache theo userId trống, kiểm tra cache 'all' xem có đơn của user này không
    if (userId) {
      const allRaw = localStorage.getItem('canteen_orders_cache_all');
      if (allRaw) {
        const allParsed = JSON.parse(allRaw);
        if (Array.isArray(allParsed)) {
          const matching = allParsed.filter(
            (o: Order) => o.userId === userId
          );
          if (matching.length > 0) return matching;
        }
      }
    }
  } catch {}
  return [];
}

export function setCachedOrders(orders: Order[], userId?: string) {
  try {
    const key = `canteen_orders_cache_${userId || 'all'}`;
    if (Array.isArray(orders)) {
      localStorage.setItem(key, JSON.stringify(orders.slice(0, 100)));
    }
  } catch {}
}

export async function getOrders(filters?: {
  targetDate?: string;
  userId?: string;
  authUserId?: string;
  userEmail?: string;
  status?: string;
}): Promise<Order[]> {
  checkSupabase();

  try {
    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });

    if (filters?.targetDate) query = query.eq('target_date', filters.targetDate);
    if (filters?.status) query = query.eq('status', filters.status);

    if (filters?.userId && filters?.authUserId && filters.userId !== filters.authUserId) {
      query = query.or(`user_id.eq.${filters.userId},user_id.eq.${filters.authUserId}`);
    } else if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    } else if (filters?.authUserId) {
      query = query.eq('user_id', filters.authUserId);
    }

    if (filters?.userId || filters?.authUserId) {
      query = query.limit(50);
    } else {
      query = query.limit(200);
    }

    let data: any[] | null = null;
    let queryError: any = null;

    try {
      const res = await withQueryTimeout(query, 15000, 'Supabase getOrders timeout');
      data = res.data;
      queryError = res.error;
    } catch (err: any) {
      queryError = err;
    }

    // Nếu query join *, order_items(*) thất bại, fallback query trực tiếp bảng orders
    if (queryError && !data) {
      try {
        let fallbackQuery = supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (filters?.targetDate) fallbackQuery = fallbackQuery.eq('target_date', filters.targetDate);
        if (filters?.status) fallbackQuery = fallbackQuery.eq('status', filters.status);
        if (filters?.userId && filters?.authUserId && filters.userId !== filters.authUserId) {
          fallbackQuery = fallbackQuery.or(`user_id.eq.${filters.userId},user_id.eq.${filters.authUserId}`);
        } else if (filters?.userId) {
          fallbackQuery = fallbackQuery.eq('user_id', filters.userId);
        } else if (filters?.authUserId) {
          fallbackQuery = fallbackQuery.eq('user_id', filters.authUserId);
        }
        fallbackQuery = fallbackQuery.limit(filters?.userId || filters?.authUserId ? 50 : 200);

        const fbRes = await withQueryTimeout(fallbackQuery, 10000, 'Fallback getOrders timeout');
        if (fbRes.data) {
          data = fbRes.data;
          queryError = null;
          if (data.length > 0) {
            const orderIds = data.map((o) => o.id).filter(Boolean);
            try {
              const { data: itemsData } = await supabase
                .from('order_items')
                .select('*')
                .in('order_id', orderIds);
              if (itemsData && itemsData.length > 0) {
                data = data.map((ord) => ({
                  ...ord,
                  order_items: itemsData.filter((it) => it.order_id === ord.id),
                }));
              }
            } catch {}
          }
        }
      } catch (fbErr) {
        console.warn('[Fallback direct orders query notice]:', fbErr);
      }
    }

    if (!queryError && data) {
      const orders = data.map(mapOrder);
      const cached = getCachedOrders(filters?.userId);
      const combined = orders.map((ord) => {
        const found = cached.find((c) => c.id === ord.id || c.orderCode === ord.orderCode);
        if (found && (!ord.items || ord.items.length === 0) && found.items && found.items.length > 0) {
          return { ...ord, items: found.items };
        }
        return ord;
      });
      // Giữ đơn mới trong cache nếu chưa kịp sync lên DB (tạo trong 24 giờ)
      for (const c of cached) {
        if (!combined.some((o) => o.id === c.id || o.orderCode === c.orderCode)) {
          const age = Date.now() - new Date(c.createdAt).getTime();
          if (isNaN(age) || age < 24 * 60 * 60 * 1000) {
            combined.push(c);
          }
        }
      }
      setCachedOrders(combined, filters?.userId);
      if (!filters?.userId) {
        setCachedOrders(combined);
      }
      return combined;
    }

    return getCachedOrders(filters?.userId);
  } catch (err: any) {
    console.warn('[getOrders fallback notice - timeout or network]:', err?.message || err);
    return getCachedOrders(filters?.userId);
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  actor: UserProfile
) {
  checkSupabase();
  try {
    await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId);
  } catch (e) {
    console.warn('Update order status remote note:', e);
  }

  // Cập nhật trạng thái trong cache cục bộ
  try {
    const all = getCachedOrders();
    const updatedAll = all.map((o) => (o.id === orderId ? { ...o, status: status as any } : o));
    setCachedOrders(updatedAll);
  } catch {}
}

// ============================================================
// QR TOKENS
// ============================================================

export async function createQRToken(
  actor: UserProfile,
  note?: string,
  expiresInMinutes = 15,
  quantity = 1
): Promise<QRExceptionToken> {
  checkSupabase();
  const token = `QR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  const formattedNote = note ? `[Số lượng: ${quantity} suất] ${note}` : `[Số lượng: ${quantity} suất]`;

  const { data, error } = await supabase
    .from('qr_exception_tokens')
    .insert({
      token,
      expires_at: expiresAt,
      created_by: actor.id,
      created_by_name: actor.name,
      note: formattedNote,
    })
    .select()
    .single();

  if (error) throw new Error(`Lỗi tạo mã QR ngoại lệ: ${error.message}`);

  const newToken = mapQRToken(data);
  const cached = getCachedQRTokens();
  setCachedQRTokens([newToken, ...cached.filter((t) => t.token !== newToken.token)]);
  return newToken;
}

export async function getQRTokens(): Promise<QRExceptionToken[]> {
  checkSupabase();
  try {
    const { data, error } = await withQueryTimeout(
      supabase
        .from('qr_exception_tokens')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      12000,
      'Timeout fetch qr_exception_tokens'
    );

    if (!error && data) {
      const list = data.map(mapQRToken);
      setCachedQRTokens(list);
      return list;
    }
    if (error) {
      console.warn('[getQRTokens notice]:', error.message);
    }
    return getCachedQRTokens();
  } catch (err) {
    console.warn('[getQRTokens error]:', err);
    return getCachedQRTokens();
  }
}

// ============================================================
// DATA SYNC / SEED HELPER
// ============================================================

export async function seedMenuToSupabase(): Promise<{ success: boolean; count: number; error?: string }> {
  checkSupabase();
  try {
    const { data: existing } = await supabase.from('menu_items').select('id');
    if (existing && existing.length > 0) {
      return { success: true, count: existing.length };
    }
    const rows = DEFAULT_MENU_ITEMS.map((item) => ({
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price,
      image_url: item.imageUrl,
      prepared_stock: item.preparedStock,
      current_stock: item.currentStock,
      is_active: item.isActive,
      for_date: item.forDate || null,
    }));

    const { data, error } = await supabase.from('menu_items').insert(rows).select();
    if (error) {
      return { success: false, count: 0, error: error.message };
    }
    if (data && data.length > 0) {
      setCachedMenu(data.map(mapMenuItem));
      return { success: true, count: data.length };
    }
    return { success: true, count: 0 };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
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

export async function fetchTimeGateConfig(): Promise<{ openTime: string; closeTime: string }> {
  try {
    if (isSupabaseConfigured && supabase) {
      // 1. Thử đọc từ bảng 'settings' chuẩn theo schema Supabase
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .in('key', ['time_gate', 'time_gate_config'])
        .maybeSingle();

      if (!error && data?.value) {
        let openTime = '07:00';
        let closeTime = '16:00';

        if (data.value.openTime && data.value.closeTime) {
          openTime = data.value.openTime;
          closeTime = data.value.closeTime;
        } else if (data.value.open_hour !== undefined && data.value.close_hour !== undefined) {
          openTime = `${String(data.value.open_hour).padStart(2, '0')}:00`;
          closeTime = `${String(data.value.close_hour).padStart(2, '0')}:00`;
        }

        const cfg = { openTime, closeTime };
        localStorage.setItem(TIME_GATE_STORAGE_KEY, JSON.stringify(cfg));
        return cfg;
      }
    }
  } catch (e) {
    console.warn('Fetch time gate config notice:', e);
  }
  return getCustomTimeGateConfig();
}

export async function setCustomTimeGateConfig(
  openTime: string,
  closeTime: string,
  actor?: UserProfile
): Promise<void> {
  const [openHour] = openTime.split(':').map(Number);
  const [closeHour] = closeTime.split(':').map(Number);
  const cfg = { openTime, closeTime };
  localStorage.setItem(TIME_GATE_STORAGE_KEY, JSON.stringify(cfg));

  if (isSupabaseConfigured && supabase) {
    // 1. Lưu vào bảng 'settings'
    try {
      await supabase.from('settings').upsert({
        key: 'time_gate',
        value: {
          openTime,
          closeTime,
          open_hour: isNaN(openHour) ? 7 : openHour,
          close_hour: isNaN(closeHour) ? 16 : closeHour,
          timezone: 'Asia/Ho_Chi_Minh',
          updated_by: actor?.name || 'Admin',
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Fallback nếu dùng bảng system_settings
      try {
        await supabase.from('system_settings').upsert({
          key: 'time_gate_config',
          value: { openTime, closeTime, updated_by: actor?.name || 'Admin', updated_at: new Date().toISOString() },
        });
      } catch (err) {
        console.warn('Set time gate config notice:', err);
      }
    }
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
    let debounceTimer: any = null;
    const debouncedCallback = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        callback();
      }, 2500);
    };

    const channel = supabase
      .channel('canteen-realtime-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_exception_tokens' }, debouncedCallback)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
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
    authUserId: row.auth_user_id || undefined,
    name: row.name,
    role: row.role,
    roleTitle: row.role_title || '',
    department: row.department || '',
    phoneNumber: row.phone_number || '',
    email: row.email,
    avatarUrl: row.avatar_url,
    defaultRoom: row.default_room,
    walletBalance: Number(row.wallet_balance ?? 0),
    monthlyAllowance: Number(row.monthly_allowance ?? 0),
    lastWalletResetDate: row.last_wallet_reset_date,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    createdAt: row.created_at,
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
  let mappedItems: any[] = [];
  if (Array.isArray(row.order_items) && row.order_items.length > 0) {
    mappedItems = row.order_items.map((i: any) => ({
      menuItemId: i.menu_item_id || '',
      name: i.name || 'Suất ăn Căn tin',
      price: Number(i.price ?? 0),
      quantity: Number(i.quantity ?? 1),
      imageUrl: i.image_url || '',
    }));
  } else if (Array.isArray(row.items) && row.items.length > 0) {
    mappedItems = row.items.map((i: any) => ({
      menuItemId: i.menuItemId || i.menu_item_id || '',
      name: i.name || 'Suất ăn Căn tin',
      price: Number(i.price ?? 0),
      quantity: Number(i.quantity ?? 1),
      imageUrl: i.imageUrl || i.image_url || '',
    }));
  }

  return {
    id: row.id,
    orderCode: row.order_code,
    userId: row.user_id,
    userName: row.user_name || '',
    userPhone: row.user_phone || '',
    userDepartment: row.user_department || '',
    items: mappedItems,
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
  let qty = 1;
  if (row.quantity) {
    qty = Number(row.quantity);
  } else if (row.note) {
    const m = String(row.note).match(/\[Số lượng:\s*(\d+)\s*suất\]/);
    if (m) qty = parseInt(m[1], 10);
  }

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
    quantity: qty,
  };
}
