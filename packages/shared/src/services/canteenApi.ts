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

  let authUserId: string | null = null;
  const userUuid = generateUUID();

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
    id: authUserId && isValidUuid(authUserId) ? authUserId : userUuid,
    auth_user_id: authUserId && isValidUuid(authUserId) ? authUserId : null,
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

export const isValidUuid = (str?: string): boolean =>
  !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ============================================================
// MENU
// ============================================================

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'a1111111-1111-4111-8111-111111111101',
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
    id: 'a1111111-1111-4111-8111-111111111102',
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
    id: 'a1111111-1111-4111-8111-111111111103',
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
    id: 'a1111111-1111-4111-8111-111111111104',
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
    id: 'a1111111-1111-4111-8111-111111111105',
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
    id: 'a1111111-1111-4111-8111-111111111106',
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
    id: 'a1111111-1111-4111-8111-111111111107',
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
    id: 'a1111111-1111-4111-8111-111111111108',
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
    id: 'a1111111-1111-4111-8111-111111111109',
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

export async function bulkCreateMenuItems(
  items: Omit<MenuItem, 'id'>[],
  actor: UserProfile
): Promise<{ success: boolean; count: number; error?: string }> {
  checkSupabase();
  if (!items || items.length === 0) {
    return { success: false, count: 0, error: 'Danh sách món ăn tải lên trống.' };
  }

  const validRows = items
    .filter((it) => it.name && it.name.trim().length > 0)
    .map((it) => ({
      name: it.name.trim(),
      category: it.category?.trim() || 'Cơm trưa',
      description: it.description?.trim() || '',
      price: Number(it.price) > 0 ? Number(it.price) : 35000,
      image_url: it.imageUrl?.trim() || '',
      prepared_stock: Number(it.preparedStock) >= 0 ? Number(it.preparedStock) : 50,
      current_stock: Number(it.currentStock) >= 0 ? Number(it.currentStock) : (Number(it.preparedStock) || 50),
      is_active: it.isActive !== undefined ? it.isActive : true,
      for_date: it.forDate?.trim() || null,
    }));

  if (validRows.length === 0) {
    return { success: false, count: 0, error: 'Không tìm thấy món ăn hợp lệ trong file (cần có cột Tên món ăn).' };
  }

  try {
    // 1. Chèn vào Supabase (hỗ trợ phân trang batch nếu số lượng lớn > 50 món)
    let insertResult: any[] = [];
    let insertErr: any = null;

    const BATCH_SIZE = 50;
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const { data: res, error: err } = await supabase
        .from('menu_items')
        .insert(batch)
        .select();

      if (!err && res) {
        insertResult.push(...res);
      } else {
        insertErr = err;
        // Thử lại batch không có cột for_date nếu bảng trên DB chưa có cột này
        const standardBatch = batch.map((r) => {
          const clone: any = { ...r };
          delete clone.for_date;
          return clone;
        });
        const { data: res2, error: err2 } = await supabase
          .from('menu_items')
          .insert(standardBatch)
          .select();

        if (!err2 && res2) {
          insertResult.push(...res2);
          insertErr = null;
        } else {
          insertErr = err2 || err;
          break;
        }
      }
    }

    if (insertErr && insertResult.length === 0) {
      throw new Error(insertErr.message);
    }

    const newItems: MenuItem[] = insertResult.map(mapMenuItem);
    const current = getCachedMenu();
    const merged = [...newItems, ...current.filter((c) => !newItems.some((n) => n.id === c.id))];
    setCachedMenu(merged);

    try {
      window.dispatchEvent(new CustomEvent('canteen_order_created'));
    } catch {}

    return { success: true, count: insertResult.length || validRows.length };
  } catch (err: any) {
    console.error('[bulkCreateMenuItems error]:', err);
    return { success: false, count: 0, error: err?.message || 'Lỗi khi lưu danh sách món vào Supabase' };
  }
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
}): Promise<{
  success: boolean;
  order_id?: string;
  order_code?: string;
  total_amount?: number;
  new_balance?: number;
  error?: string;
}> {
  checkSupabase();
  const device = detectCurrentDevice();

  if (!params.items || params.items.length === 0) {
    return { success: false, error: 'Giỏ hàng trống. Vui lòng chọn ít nhất 1 món ăn.' };
  }

  // 1. Xác thực người dùng hiện tại qua Supabase Auth
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return {
      success: false,
      error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục đặt món.',
    };
  }

  // 2. Tìm hoặc khởi tạo chính xác bản ghi user trong bảng users của Supabase (Bắt buộc để thỏa mãn Foreign Key)
  let userData: any = null;
  try {
    const { data: foundUsers } = await supabase
      .from('users')
      .select('*')
      .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id},email.eq.${authUser.email}`);

    if (foundUsers && foundUsers.length > 0) {
      userData = foundUsers[0];
      // Nếu auth_user_id chưa được map, cập nhật ngay
      if (!userData.auth_user_id && authUser.id) {
        try {
          await supabase.from('users').update({ auth_user_id: authUser.id }).eq('id', userData.id);
        } catch {}
      }
    }
  } catch (userQueryErr) {
    console.warn('[placeOrder user query note]:', userQueryErr);
  }

  // Nếu chưa có row trong bảng users, tiến hành chèn trực tiếp vào DB
  if (!userData) {
    const cachedProfile = getCachedUserProfile();
    const validUserId = isValidUuid(authUser.id) ? authUser.id : generateUUID();
    const newUserData = {
      id: validUserId,
      auth_user_id: isValidUuid(authUser.id) ? authUser.id : null,
      email: authUser.email || `${validUserId}@canteen.edu.vn`,
      name:
        cachedProfile?.name ||
        authUser.user_metadata?.full_name ||
        authUser.email?.split('@')[0] ||
        'Cán bộ',
      role: cachedProfile?.role || 'teacher',
      role_title: cachedProfile?.roleTitle || 'Giáo viên',
      department: cachedProfile?.department || 'Tổ Chuyên Môn',
      default_room: cachedProfile?.defaultRoom || 'P.101',
      phone_number: cachedProfile?.phoneNumber || '',
      wallet_balance: cachedProfile?.walletBalance ?? 1000000,
      monthly_allowance: cachedProfile?.monthlyAllowance ?? 1000000,
      is_active: true,
    };

    try {
      const { data: createdUser, error: insertErr } = await supabase
        .from('users')
        .upsert(newUserData, { onConflict: 'email' })
        .select()
        .maybeSingle();

      if (createdUser) {
        userData = createdUser;
      } else {
        const { data: reUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();
        userData = reUser || newUserData;
      }
    } catch (createErr) {
      console.error('[placeOrder create user error]:', createErr);
      userData = newUserData;
    }
  }

  // Kiểm tra tài khoản đã kích hoạt chưa
  if (userData.is_active === false) {
    return {
      success: false,
      error: 'Tài khoản của bạn đang chờ Ban Quản Trị Canteen duyệt và cấp hạn mức ví. Vui lòng liên hệ Quản lý Căn tin để được kích hoạt.',
    };
  }

  // 3. Lấy danh sách thực đơn từ bảng menu_items để map UUID chuẩn cho order_items
  let dbMenuList: any[] = [];
  try {
    const { data: fetchedMenu } = await withQueryTimeout(
      supabase.from('menu_items').select('*'),
      12000,
      'Timeout fetch menu items'
    );
    if (fetchedMenu && fetchedMenu.length > 0) {
      dbMenuList = fetchedMenu;
      setCachedMenu(dbMenuList.map(mapMenuItem));
    }
  } catch (menuErr) {
    console.warn('[placeOrder fetch menu note]:', menuErr);
  }

  if (dbMenuList.length === 0) {
    dbMenuList = getCachedMenu();
  }

  let totalAmount = 0;
  const orderItemsData: {
    menu_item_id: string;
    real_db_item_id: string | null;
    name: string;
    price: number;
    quantity: number;
    image_url: string;
  }[] = [];

  for (const requestedItem of params.items) {
    const menuItem =
      dbMenuList.find((m) => m.id === requestedItem.menuItemId) ||
      dbMenuList.find(
        (m) =>
          requestedItem.name &&
          m.name &&
          m.name.trim().toLowerCase() === requestedItem.name.trim().toLowerCase()
      ) ||
      DEFAULT_MENU_ITEMS.find((m) => m.id === requestedItem.menuItemId) ||
      DEFAULT_MENU_ITEMS.find(
        (m) =>
          requestedItem.name &&
          m.name &&
          m.name.trim().toLowerCase() === requestedItem.name.trim().toLowerCase()
      );

    const itemName = requestedItem.name || menuItem?.name || 'Suất ăn Căn tin';
    const itemPrice = Number(requestedItem.price ?? menuItem?.price ?? 35000);
    const itemImg = requestedItem.imageUrl || menuItem?.image_url || menuItem?.imageUrl || '';
    const itemStock = menuItem ? Number(menuItem.current_stock ?? menuItem.currentStock ?? 999) : 999;

    if (itemStock < requestedItem.quantity) {
      return {
        success: false,
        error: `Món "${itemName}" chỉ còn ${itemStock} suất, không đủ ${requestedItem.quantity} suất yêu cầu.`,
      };
    }

    const itemTotal = itemPrice * requestedItem.quantity;
    totalAmount += itemTotal;

    // Chỉ gán real_db_item_id nếu ID đó là UUID hợp lệ và có trong bảng menu_items trên DB
    let realDbId: string | null = null;
    if (menuItem?.id && isValidUuid(menuItem.id)) {
      realDbId = menuItem.id;
    } else if (isValidUuid(requestedItem.menuItemId)) {
      realDbId = requestedItem.menuItemId;
    }

    orderItemsData.push({
      menu_item_id: requestedItem.menuItemId,
      real_db_item_id: realDbId,
      name: itemName,
      price: itemPrice,
      quantity: requestedItem.quantity,
      image_url: itemImg,
    });
  }

  // 4. Kiểm tra số dư ví
  const currentWallet = Number(userData.wallet_balance ?? 0);
  if (currentWallet < totalAmount) {
    return {
      success: false,
      error: `Số dư ví không đủ. Cần ${formatVnd(totalAmount)}, số dư hiện có ${formatVnd(currentWallet)}.`,
    };
  }

  // 5. Tạo mã đơn hàng chuẩn hoá POS: CT-YYYYMMDD-XXX
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `CT-${yyyy}${mm}${dd}-`;

  const allCached = getCachedOrders();
  const todayCount = allCached.filter(
    (o) => o.orderCode && o.orderCode.startsWith(datePrefix)
  ).length;
  const seqStr = String(todayCount + Math.floor(Math.random() * 80) + 1).padStart(3, '0');
  const orderCode = `${datePrefix}${seqStr}`;
  const targetDate = getTomorrowStr();
  const itemsSummaryText = orderItemsData
    .map((it) => `${it.quantity}x ${it.name} (${formatVnd(it.price)})`)
    .join(', ');

  const orderUuid = generateUUID();

  // 6. Chèn đơn hàng vào bảng orders trên Supabase (Adaptive Schema Insertion)
  let newOrder: any = null;
  let orderInsertError: string | null = null;

  let currentPayload: Record<string, any> = {
    id: orderUuid,
    order_code: orderCode,
    user_id: userData.id,
    user_name: userData.name || authUser.email?.split('@')[0] || 'Cán bộ',
    user_email: userData.email || authUser.email || '',
    user_phone: userData.phone_number || '',
    user_department: userData.department || '',
    order_date: now.toISOString().split('T')[0],
    target_date: targetDate,
    meal_date: targetDate,
    delivery_method: params.deliveryMethod,
    room_number: params.deliveryMethod === 'room_delivery' ? params.roomNumber || '' : '',
    pickup_time: params.pickupTime,
    total_amount: totalAmount,
    status: 'confirmed',
    used_qr_token: params.exceptionToken || null,
    is_exception_order: Boolean(params.isExceptionOrder),
    exception_token_used: params.exceptionToken || null,
    device_info: device,
    note: params.isExceptionOrder
      ? `[Ngoại lệ: ${params.exceptionToken}] ${itemsSummaryText}`
      : itemsSummaryText,
  };

  // Vòng lặp thích ứng schema: Tự động loại bỏ bất kỳ cột nào mà bảng orders trên DB chưa hỗ trợ
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await withQueryTimeout(
        supabase.from('orders').insert(currentPayload).select().maybeSingle(),
        15000,
        'Timeout creating order on Supabase'
      );

      if (!res.error && res.data) {
        newOrder = res.data;
        orderInsertError = null;
        break;
      }

      if (res.error) {
        orderInsertError = res.error.message;
        const errMsg = res.error.message || '';

        // Trích xuất tên cột bị thiếu từ lỗi PostgREST hoặc PostgreSQL
        const missingColMatch =
          errMsg.match(/Could not find the '([^']+)' column/) ||
          errMsg.match(/column "([^"]+)" of relation/i) ||
          errMsg.match(/Could not find the column '([^']+)'/i) ||
          errMsg.match(/column '([^']+)' does not exist/i);

        if (missingColMatch && missingColMatch[1]) {
          const colToRemove = missingColMatch[1];
          console.warn(
            `[placeOrder schema adaptive]: Bảng 'orders' trên DB không có cột '${colToRemove}', tự động loại bỏ và thử lại...`
          );
          delete currentPayload[colToRemove];
          continue;
        }

        // Fallback 1: Loại bỏ meal_date và các cột metadata mở rộng
        if (attempt === 0) {
          delete currentPayload.meal_date;
          delete currentPayload.device_info;
          delete currentPayload.is_exception_order;
          delete currentPayload.exception_token_used;
          delete currentPayload.user_department;
          delete currentPayload.user_phone;
          continue;
        }

        // Fallback 2: Loại bỏ target_date nếu chỉ có order_date
        if (attempt === 1) {
          delete currentPayload.target_date;
          delete currentPayload.used_qr_token;
          delete currentPayload.room_number;
          continue;
        }

        break;
      }
    } catch (queryEx: any) {
      orderInsertError = queryEx.message || 'Lỗi mạng kết nối Supabase';
      break;
    }
  }

  // Nếu insert vào Supabase thất bại, báo lỗi cụ thể để xử lý thay vì im lặng
  if (!newOrder && orderInsertError) {
    return {
      success: false,
      error: `Không thể lưu đơn hàng vào máy chủ Supabase: ${orderInsertError}. Vui lòng kiểm tra quyền truy cập RLS của bảng orders.`,
    };
  }

  const generatedId = newOrder ? newOrder.id : orderUuid;

  // 7. Thêm chi tiết món ăn vào bảng order_items trên Supabase (Adaptive Schema)
  try {
    let itemsPayload: any[] = orderItemsData.map((it) => ({
      id: generateUUID(),
      order_id: generatedId,
      menu_item_id: it.real_db_item_id,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      subtotal: it.price * it.quantity,
      image_url: it.image_url || '',
    }));

    for (let itAttempt = 0; itAttempt < 5; itAttempt++) {
      const { error: itemErr } = await supabase.from('order_items').insert(itemsPayload);
      if (!itemErr) break;

      const itemErrMsg = itemErr.message || '';
      const missingItemCol =
        itemErrMsg.match(/Could not find the '([^']+)' column/) ||
        itemErrMsg.match(/column "([^"]+)" of relation/i);

      if (missingItemCol && missingItemCol[1]) {
        const col = missingItemCol[1];
        console.warn(`[order_items adaptive]: Bảng 'order_items' không có cột '${col}', tự động loại bỏ...`);
        itemsPayload = itemsPayload.map((it) => {
          const clone = { ...it };
          delete clone[col];
          return clone;
        });
        continue;
      }

      if (itAttempt === 0) {
        // Fallback standard không có image_url & id
        itemsPayload = orderItemsData.map((it) => ({
          order_id: generatedId,
          menu_item_id: it.real_db_item_id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          subtotal: it.price * it.quantity,
        }));
        continue;
      }
      break;
    }
  } catch (e) {
    console.warn('[placeOrder order_items exception]:', e);
  }

  // 8. Trừ tồn kho món ăn trên Supabase
  for (const it of orderItemsData) {
    if (it.real_db_item_id) {
      try {
        const { data: currentDbItem } = await supabase
          .from('menu_items')
          .select('current_stock')
          .eq('id', it.real_db_item_id)
          .maybeSingle();

        if (currentDbItem) {
          const currentStockVal = Number(currentDbItem.current_stock ?? 0);
          await supabase
            .from('menu_items')
            .update({ current_stock: Math.max(0, currentStockVal - it.quantity) })
            .eq('id', it.real_db_item_id);
        }
      } catch (stockErr) {
        console.warn('[placeOrder stock update note]:', stockErr);
      }
    }
  }

  // 9. Trừ số dư ví của người dùng trong bảng users trên Supabase
  const newBalance = Math.max(0, currentWallet - totalAmount);
  try {
    const { error: walletErr } = await supabase
      .from('users')
      .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', userData.id);

    if (walletErr) {
      console.warn('[placeOrder wallet update note]:', walletErr.message);
    }

    // Ghi nhật ký biến động ví
    await supabase.from('wallet_transactions').insert({
      id: generateUUID(),
      user_id: userData.id,
      amount: -totalAmount,
      type: 'order_payment',
      reference_id: orderCode,
      balance_after: newBalance,
      note: `Thanh toán đơn hàng ${orderCode}`,
    });
  } catch (e) {
    console.warn('[placeOrder wallet_transactions sync note]:', e);
  }

  // 10. Cập nhật local cached user profile để UI cập nhật số dư tức thì
  const currProfile = getCachedUserProfile();
  if (currProfile) {
    currProfile.walletBalance = newBalance;
    setCachedUserProfile(currProfile);
  }

  // 11. Cập nhật tồn kho trong cache thực đơn
  const cachedMenu = getCachedMenu();
  const updatedCachedMenu = cachedMenu.map((m) => {
    const requested = orderItemsData.find((it) => it.menu_item_id === m.id || it.name === m.name);
    if (requested) {
      return { ...m, currentStock: Math.max(0, m.currentStock - requested.quantity) };
    }
    return m;
  });
  setCachedMenu(updatedCachedMenu);

  // 12. Tạo và lưu đơn vào cache cục bộ để hiển thị ngay tức thì
  const localOrder: Order = {
    id: generatedId,
    orderCode,
    userId: userData.id,
    userName: userData.name || authUser.email?.split('@')[0] || 'Cán bộ',
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
    isExceptionOrder: Boolean(params.isExceptionOrder),
    exceptionTokenUsed: params.exceptionToken || undefined,
    deviceInfo: device,
  };

  const userOrders = getCachedOrders(userData.id);
  const updatedUserOrders = [
    localOrder,
    ...userOrders.filter((o) => o.id !== localOrder.id && o.orderCode !== localOrder.orderCode),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  setCachedOrders(updatedUserOrders, userData.id);

  if (authUser.id && authUser.id !== userData.id) {
    const authOrders = getCachedOrders(authUser.id);
    const updatedAuthOrders = [
      localOrder,
      ...authOrders.filter((o) => o.id !== localOrder.id && o.orderCode !== localOrder.orderCode),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setCachedOrders(updatedAuthOrders, authUser.id);
  }

  const allOrdersList = getCachedOrders();
  const updatedAllOrders = [
    localOrder,
    ...allOrdersList.filter((o) => o.id !== localOrder.id && o.orderCode !== localOrder.orderCode),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  setCachedOrders(updatedAllOrders);

  // Phát tín hiệu broadcast cho tab hoặc window khác cập nhật ví và đơn hàng
  try {
    window.dispatchEvent(new CustomEvent('canteen_order_created', { detail: localOrder }));
    window.dispatchEvent(
      new CustomEvent('canteen_wallet_updated', {
        detail: { walletBalance: newBalance, userId: userData.id },
      })
    );
  } catch {}

  return {
    success: true,
    order_id: generatedId,
    order_code: orderCode,
    total_amount: totalAmount,
    new_balance: newBalance,
  };
}

export async function cancelOrder(
  orderId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; new_balance?: number; refund_amount?: number }> {
  checkSupabase();

  if (!orderId) {
    return { success: false, error: 'Mã đơn hàng không hợp lệ.' };
  }

  const cleanOrderId = String(orderId).trim();

  // 1. Thử gọi RPC 'cancel_order' nếu database đã cài đặt procedure này
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('cancel_order', {
      p_order_id: cleanOrderId,
      p_reason: reason || null,
    });
    if (!rpcError && rpcData && typeof rpcData === 'object') {
      const res = rpcData as { success?: boolean; error?: string; new_balance?: number; refund_amount?: number };
      if (res.success) {
        try {
          window.dispatchEvent(new CustomEvent('canteen_order_created'));
          if (res.new_balance !== undefined) {
            window.dispatchEvent(new CustomEvent('canteen_wallet_updated', { detail: { walletBalance: res.new_balance } }));
          }
        } catch {}
        return { success: true, new_balance: res.new_balance, refund_amount: res.refund_amount };
      }
    }
  } catch {
    // Tiếp tục xử lý bằng bảng trực tiếp nếu RPC không có
  }

  // 2. Tìm kiếm đơn hàng trong Supabase (sử dụng select('*') đơn giản tránh lỗi schema quan hệ)
  let order: any = null;
  try {
    // 2.1 Tìm theo ID
    if (isValidUuid(cleanOrderId)) {
      const { data: byId } = await supabase
        .from('orders')
        .select('*')
        .eq('id', cleanOrderId)
        .maybeSingle();
      if (byId) order = byId;
    }

    // 2.2 Tìm theo order_code chính xác
    if (!order) {
      const { data: byCode } = await supabase
        .from('orders')
        .select('*')
        .eq('order_code', cleanOrderId)
        .maybeSingle();
      if (byCode) order = byCode;
    }

    // 2.3 Tìm theo order_code không phân biệt hoa thường
    if (!order) {
      const { data: byIlike } = await supabase
        .from('orders')
        .select('*')
        .ilike('order_code', cleanOrderId)
        .maybeSingle();
      if (byIlike) order = byIlike;
    }
  } catch (err) {
    console.warn('[Fetch order for cancellation notice]:', err);
  }

  // 3. Nếu tìm thấy trên Supabase
  if (order) {
    if (order.status === 'cancelled') {
      return { success: false, error: 'Đơn hàng này đã được hủy trước đó.' };
    }

    if (order.status === 'completed') {
      return { success: false, error: 'Đơn hàng đã hoàn thành, không thể hủy.' };
    }

    // Kiểm tra giới hạn 5 phút đối với yêu cầu hủy bởi người dùng
    const isUserCancellation =
      !reason ||
      reason.toLowerCase().includes('người dùng') ||
      reason.toLowerCase().includes('user');

    if (isUserCancellation) {
      const orderCreatedAt = order.created_at || order.order_date;
      if (orderCreatedAt) {
        const orderTime = new Date(orderCreatedAt).getTime();
        const elapsed = Date.now() - orderTime;
        // Quá 5 phút (cho phép 15s độ lệch đồng hồ / mạng)
        if (elapsed > 5 * 60 * 1000 + 15000) {
          return {
            success: false,
            error:
              'Đã quá thời gian cho phép hủy món (5 phút sau khi đặt). Đơn hàng đã được chuyển sang bộ phận Bếp chế biến.',
          };
        }
      }
    }

    // Cập nhật trạng thái đơn thành 'cancelled' với Adaptive Schema Handling
    let updateSuccess = false;
    let updateErrorMsg = '';

    const updatePayloads: Record<string, any>[] = [
      {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason || 'Người dùng hủy đơn',
        updated_at: new Date().toISOString(),
      },
      {
        status: 'cancelled',
        cancel_reason: reason || 'Người dùng hủy đơn',
        updated_at: new Date().toISOString(),
      },
      {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      },
      {
        status: 'cancelled',
      },
    ];

    for (const payload of updatePayloads) {
      const { error: updErr } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', order.id);

      if (!updErr) {
        updateSuccess = true;
        break;
      } else {
        updateErrorMsg = updErr.message;
      }
    }

    if (!updateSuccess) {
      console.error('[cancelOrder DB update failed]:', updateErrorMsg);
      // Nếu không update được do RLS hoặc quyền hạn, thông báo rõ cho người dùng
      return {
        success: false,
        error: `Không thể cập nhật trạng thái hủy đơn trên máy chủ: ${updateErrorMsg}. Vui lòng kiểm tra quyền RLS (UPDATE) của bảng 'orders'.`,
      };
    }

    let refundBalance: number | undefined;
    const refundAmount = Number(order.total_amount || 0);

    // Hoàn tiền lại ví cho người dùng trong Supabase
    try {
      // Tìm user theo id, auth_user_id hoặc email
      let user: any = null;
      if (order.user_id) {
        const { data: u1 } = await supabase
          .from('users')
          .select('*')
          .or(`id.eq.${order.user_id},auth_user_id.eq.${order.user_id}`)
          .maybeSingle();
        if (u1) user = u1;
      }

      if (!user && order.user_email) {
        const { data: u2 } = await supabase
          .from('users')
          .select('*')
          .eq('email', order.user_email)
          .maybeSingle();
        if (u2) user = u2;
      }

      if (!user) {
        const { data: { user: currentAuthUser } } = await supabase.auth.getUser();
        if (currentAuthUser) {
          const { data: u3 } = await supabase
            .from('users')
            .select('*')
            .or(`id.eq.${currentAuthUser.id},auth_user_id.eq.${currentAuthUser.id},email.eq.${currentAuthUser.email}`)
            .maybeSingle();
          if (u3) user = u3;
        }
      }

      if (user) {
        refundBalance = Number(user.wallet_balance || 0) + refundAmount;
        
        // Thử cập nhật số dư ví
        try {
          await supabase
            .from('users')
            .update({ wallet_balance: refundBalance, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        } catch {
          await supabase
            .from('users')
            .update({ wallet_balance: refundBalance })
            .eq('id', user.id);
        }

        // Thử ghi nhật ký biến động ví
        try {
          await supabase.from('wallet_transactions').insert({
            id: generateUUID(),
            user_id: user.id,
            amount: refundAmount,
            type: 'order_refund',
            reference_id: order.order_code || order.id,
            note: `Hoàn tiền hủy đơn ${order.order_code || order.id}`,
            balance_after: refundBalance,
          });
        } catch {}

        // Cập nhật local cached user profile
        const currProfile = getCachedUserProfile();
        if (currProfile && (currProfile.id === user.id || currProfile.authUserId === user.id || currProfile.authUserId === user.auth_user_id || currProfile.email === user.email)) {
          currProfile.walletBalance = refundBalance;
          setCachedUserProfile(currProfile);
        }
      }
    } catch (refundErr) {
      console.warn('[Refund wallet notice]:', refundErr);
    }

    // Nếu không lấy được user từ DB, hoàn tiền vào cached user profile
    if (refundBalance === undefined) {
      const currProfile = getCachedUserProfile();
      if (currProfile) {
        refundBalance = Number(currProfile.walletBalance || 0) + refundAmount;
        currProfile.walletBalance = refundBalance;
        setCachedUserProfile(currProfile);
      }
    }

    // Phục hồi lại số lượng tồn kho món ăn trong bảng menu_items
    try {
      const { data: fetchedItems } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id);

      if (fetchedItems && Array.isArray(fetchedItems)) {
        for (const it of fetchedItems) {
          if (it.menu_item_id && isValidUuid(it.menu_item_id)) {
            const { data: mItem } = await supabase
              .from('menu_items')
              .select('current_stock')
              .eq('id', it.menu_item_id)
              .maybeSingle();

            if (mItem) {
              await supabase
                .from('menu_items')
                .update({ current_stock: Number(mItem.current_stock ?? 0) + Number(it.quantity ?? 1) })
                .eq('id', it.menu_item_id);
            }
          }
        }
      }
    } catch (restockErr) {
      console.warn('[Restock menu items notice]:', restockErr);
    }

    // Cập nhật trạng thái trong localStorage cache
    const allCached = getCachedOrders();
    const updatedAll = allCached.map((o) =>
      o.id === order.id || o.orderCode === order.order_code
        ? { ...o, status: 'cancelled' as const, cancelledAt: new Date().toISOString(), cancelReason: reason || 'Người dùng hủy đơn' }
        : o
    );
    setCachedOrders(updatedAll);
    if (order.user_id) {
      const userCached = getCachedOrders(order.user_id);
      setCachedOrders(
        userCached.map((o) =>
          o.id === order.id || o.orderCode === order.order_code
            ? { ...o, status: 'cancelled' as const, cancelledAt: new Date().toISOString(), cancelReason: reason || 'Người dùng hủy đơn' }
            : o
        ),
        order.user_id
      );
    }

    try {
      window.dispatchEvent(new CustomEvent('canteen_order_created'));
      if (refundBalance !== undefined) {
        window.dispatchEvent(new CustomEvent('canteen_wallet_updated', { detail: { walletBalance: refundBalance } }));
      }
    } catch {}

    return { success: true, new_balance: refundBalance, refund_amount: refundAmount };
  }

  // 4. Nếu không tìm thấy trong Supabase, kiểm tra trong local storage cache
  const cachedList = getCachedOrders();
  const cachedOrder = cachedList.find((o) => o.id === cleanOrderId || o.orderCode === cleanOrderId || (o.orderCode && o.orderCode.toLowerCase() === cleanOrderId.toLowerCase()));

  if (cachedOrder) {
    if (cachedOrder.status === 'cancelled') {
      return { success: false, error: 'Đơn hàng này đã được hủy trước đó.' };
    }
    if (cachedOrder.status === 'completed') {
      return { success: false, error: 'Đơn hàng đã hoàn thành, không thể hủy.' };
    }

    // Cập nhật cache thành đã hủy
    const updatedAll = cachedList.map((o) =>
      o.id === cachedOrder.id || o.orderCode === cachedOrder.orderCode
        ? { ...o, status: 'cancelled' as const, cancelledAt: new Date().toISOString(), cancelReason: reason || 'Người dùng hủy đơn' }
        : o
    );
    setCachedOrders(updatedAll);

    // Hoàn tiền vào local profile
    let refundBalance = 0;
    const refundAmount = Number(cachedOrder.totalAmount || 0);
    const currProfile = getCachedUserProfile();
    if (currProfile) {
      refundBalance = Number(currProfile.walletBalance || 0) + refundAmount;
      currProfile.walletBalance = refundBalance;
      setCachedUserProfile(currProfile);

      // Cố gắng cập nhật vào DB nếu user tồn tại
      if (currProfile.id) {
        try {
          await supabase.from('users').update({ wallet_balance: refundBalance }).eq('id', currProfile.id);
        } catch {}
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('canteen_order_created'));
      if (refundBalance !== undefined) {
        window.dispatchEvent(new CustomEvent('canteen_wallet_updated', { detail: { walletBalance: refundBalance } }));
      }
    } catch {}

    return { success: true, new_balance: refundBalance, refund_amount: refundAmount };
  }

  return { success: false, error: 'Không tìm thấy thông tin đơn hàng trên hệ thống để hủy.' };
}

export function getCachedOrders(userId?: string): Order[] {
  try {
    const key = `canteen_orders_cache_${userId || 'all'}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
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
          if (matching.length > 0) {
            return matching.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
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
      const sorted = [...orders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      localStorage.setItem(key, JSON.stringify(sorted.slice(0, 200)));
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

    if (filters?.targetDate) {
      query = query.or(`target_date.eq.${filters.targetDate},meal_date.eq.${filters.targetDate}`);
    }
    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.userId && filters?.authUserId && filters.userId !== filters.authUserId) {
      query = query.or(`user_id.eq.${filters.userId},user_id.eq.${filters.authUserId}`);
    } else if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    } else if (filters?.authUserId) {
      query = query.eq('user_id', filters.authUserId);
    }

    if (filters?.userId || filters?.authUserId) {
      query = query.limit(100);
    } else {
      query = query.limit(300);
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
    if (queryError || !data) {
      try {
        let fallbackQuery = supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (filters?.targetDate) {
          fallbackQuery = fallbackQuery.or(`target_date.eq.${filters.targetDate},meal_date.eq.${filters.targetDate}`);
        }
        if (filters?.status && filters.status !== 'all') {
          fallbackQuery = fallbackQuery.eq('status', filters.status);
        }
        if (filters?.userId && filters?.authUserId && filters.userId !== filters.authUserId) {
          fallbackQuery = fallbackQuery.or(`user_id.eq.${filters.userId},user_id.eq.${filters.authUserId}`);
        } else if (filters?.userId) {
          fallbackQuery = fallbackQuery.eq('user_id', filters.userId);
        } else if (filters?.authUserId) {
          fallbackQuery = fallbackQuery.eq('user_id', filters.authUserId);
        }
        fallbackQuery = fallbackQuery.limit(filters?.userId || filters?.authUserId ? 100 : 300);

        const fbRes = await withQueryTimeout(fallbackQuery, 10000, 'Fallback getOrders timeout');
        if (fbRes.data) {
          data = fbRes.data;
          queryError = null;
        }
      } catch (fbErr) {
        console.warn('[Fallback direct orders query notice]:', fbErr);
      }
    }

    // Luôn chủ động fetch order_items nếu có đơn nào bị thiếu items do join không trả về
    if (data && data.length > 0) {
      const ordersMissingItems = data.filter(
        (o) => !o.order_items || !Array.isArray(o.order_items) || o.order_items.length === 0
      );
      if (ordersMissingItems.length > 0) {
        const missingIds = ordersMissingItems.map((o) => o.id).filter(Boolean);
        try {
          const { data: itemsData } = await supabase
            .from('order_items')
            .select('*')
            .in('order_id', missingIds);

          if (itemsData && itemsData.length > 0) {
            data = data.map((ord) => {
              const matchedItems = itemsData.filter((it) => it.order_id === ord.id);
              if (matchedItems.length > 0) {
                return { ...ord, order_items: matchedItems };
              }
              return ord;
            });
          }
        } catch (itemErr) {
          console.warn('[Fetch order_items notice]:', itemErr);
        }
      }
    }

    if (!queryError && data) {
      const orders = data.map(mapOrder);
      const cached = getCachedOrders(filters?.userId);
      const combined = orders.map((ord) => {
        const found = cached.find((c) => c.id === ord.id || c.orderCode === ord.orderCode);
        const hasSpecificItems = ord.items && ord.items.length > 0 && ord.items.some((it) => it.name && it.name !== 'Suất ăn Căn tin');
        if (found && !hasSpecificItems && found.items && found.items.length > 0 && found.items.some((it) => it.name && it.name !== 'Suất ăn Căn tin')) {
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

      // Luôn sắp xếp đơn hàng mới nhất lên đầu (LIFO: newest first)
      combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
      let matchedRow: any = null;

      // 1. Thử đọc từ bảng 'settings'
      try {
        const { data: sData } = await supabase
          .from('settings')
          .select('*')
          .in('key', ['time_gate', 'time_gate_config']);
        if (sData && sData.length > 0) matchedRow = sData[0];
      } catch {}

      // 2. Nếu không có trong 'settings', thử 'system_settings'
      if (!matchedRow) {
        try {
          const { data: sysData } = await supabase
            .from('system_settings')
            .select('*')
            .in('key', ['time_gate', 'time_gate_config', 'canteen_time_gate']);
          if (sysData && sysData.length > 0) matchedRow = sysData[0];
        } catch {}
      }

      if (matchedRow?.value) {
        let val = matchedRow.value;
        if (typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch {}
        }
        let openTime =
          val.openTime ||
          (val.open_hour !== undefined ? `${String(val.open_hour).padStart(2, '0')}:00` : '07:00');
        let closeTime =
          val.closeTime ||
          (val.close_hour !== undefined ? `${String(val.close_hour).padStart(2, '0')}:00` : '16:00');

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
    const payload = {
      openTime,
      closeTime,
      open_hour: isNaN(openHour) ? 7 : openHour,
      close_hour: isNaN(closeHour) ? 16 : closeHour,
      timezone: 'Asia/Ho_Chi_Minh',
      updated_by: actor?.name || 'Admin',
      updated_at: new Date().toISOString(),
    };

    // 1. Lưu vào bảng 'settings'
    try {
      await supabase.from('settings').upsert({
        key: 'time_gate',
        value: payload,
        updated_at: new Date().toISOString(),
      });
    } catch {}

    // 2. Lưu vào bảng 'system_settings'
    try {
      await supabase.from('system_settings').upsert({
        key: 'time_gate_config',
        value: payload,
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }

  // Phát tín hiệu cập nhật thời gian mở cổng cho toàn bộ ứng dụng
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('canteen_time_gate_updated', { detail: cfg }));
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

  let isOpen = false;
  let remainingMinutes: number | undefined;

  if (openMinutes <= closeMinutes) {
    // Khung giờ cùng trong 1 ngày (VD: 07:00 -> 23:00)
    isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    if (isOpen) remainingMinutes = closeMinutes - currentMinutes;
  } else {
    // Khung giờ qua đêm (VD: 18:00 -> 06:00 sáng hôm sau)
    isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    if (isOpen) {
      remainingMinutes =
        currentMinutes >= openMinutes
          ? 24 * 60 - currentMinutes + closeMinutes
          : closeMinutes - currentMinutes;
    }
  }

  return {
    isOpen,
    currentHour: now.getHours(),
    currentMinute: now.getMinutes(),
    message: isOpen
      ? `Căn tin đang mở nhận đơn đặt suất (từ ${cfg.openTime} đến ${cfg.closeTime})`
      : `Cổng đặt món thường hiện đang đóng. Khung giờ nhận đơn: ${cfg.openTime} – ${cfg.closeTime}`,
    opensAt: cfg.openTime,
    closesAt: cfg.closeTime,
    remainingMinutes,
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
  // Lắng nghe sự kiện tạo đơn nội bộ giữa các tabs / components
  const localHandler = () => {
    callback();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('canteen_order_created', localHandler);
    window.addEventListener('storage', localHandler);
  }

  if (!isSupabaseConfigured || !supabase) {
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('canteen_order_created', localHandler);
        window.removeEventListener('storage', localHandler);
      }
    };
  }
  try {
    let debounceTimer: any = null;
    const debouncedCallback = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        callback();
      }, 400);
    };

    const channel = supabase
      .channel('canteen-realtime-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_exception_tokens' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, debouncedCallback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, debouncedCallback)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('canteen_order_created', localHandler);
        window.removeEventListener('storage', localHandler);
      }
    };
  } catch {
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('canteen_order_created', localHandler);
        window.removeEventListener('storage', localHandler);
      }
    };
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

export function parseItemsFromNote(noteText?: string): { menuItemId: string; name: string; price: number; quantity: number; imageUrl: string }[] {
  if (!noteText || typeof noteText !== 'string') return [];
  const items: { menuItemId: string; name: string; price: number; quantity: number; imageUrl: string }[] = [];
  
  // Xóa các tag đặc biệt [Ngoại lệ: ...] hoặc [Ghi chú: ...]
  const clean = noteText.replace(/\[.*?\]/g, '').trim();
  if (!clean) return [];

  const parts = clean.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    // Kiểu 1: 1x Cơm sườn cốt lết (35000đ) hoặc 2x Trà đào (15.000đ) hoặc 2x Bún bò Huế
    const matchFull = part.match(/^(\d+)\s*[xX×*]\s*(.*?)(?:\s*[\(（](.*?)[đĐ₫]?[\)）])?$/);
    if (matchFull) {
      const qty = parseInt(matchFull[1], 10) || 1;
      const name = matchFull[2].trim();
      const rawPriceStr = matchFull[3] ? matchFull[3].replace(/[.,\sđĐ₫]/g, '') : '';
      const price = rawPriceStr && !isNaN(Number(rawPriceStr)) ? parseInt(rawPriceStr, 10) : 35000;
      if (name) {
        items.push({
          menuItemId: '',
          name,
          quantity: qty,
          price,
          imageUrl: '',
        });
      }
      continue;
    }

    // Kiểu 2: Cơm sườn cốt lết (35.000đ)
    const matchPrice = part.match(/^(.*?)\s*[\(（](.*?)[đĐ₫]?[\)）]$/);
    if (matchPrice) {
      const name = matchPrice[1].trim();
      const rawPriceStr = matchPrice[2] ? matchPrice[2].replace(/[.,\sđĐ₫]/g, '') : '';
      const price = rawPriceStr && !isNaN(Number(rawPriceStr)) ? parseInt(rawPriceStr, 10) : 35000;
      if (name) {
        items.push({
          menuItemId: '',
          name,
          quantity: 1,
          price,
          imageUrl: '',
        });
      }
      continue;
    }

    // Kiểu 3: Tên món đơn thuần: "Cơm gà xối mỡ"
    const simpleName = part.trim();
    if (simpleName && simpleName.length > 2 && !simpleName.startsWith('Ăn tại') && !simpleName.startsWith('Giao tận')) {
      items.push({
        menuItemId: '',
        name: simpleName,
        quantity: 1,
        price: 35000,
        imageUrl: '',
      });
    }
  }

  return items;
}

function mapOrder(row: any): Order {
  let mappedItems: any[] = [];
  const cachedMenu = getCachedMenu();

  if (Array.isArray(row.order_items) && row.order_items.length > 0) {
    mappedItems = row.order_items.map((i: any) => {
      const menuItem = cachedMenu.find((m) => m.id === i.menu_item_id || m.id === i.menuItemId);
      const rawName = i.name || i.menu_items?.name;
      let finalName = rawName;
      if (!finalName || finalName === 'Suất ăn Căn tin') {
        finalName = menuItem?.name || finalName || '';
      }
      const finalPrice = Number(i.price ?? i.menu_items?.price ?? menuItem?.price ?? 0);
      const finalImg = i.image_url || i.imageUrl || i.menu_items?.image_url || menuItem?.imageUrl || '';

      return {
        menuItemId: i.menu_item_id || i.menuItemId || '',
        name: finalName || 'Suất ăn Căn tin',
        price: finalPrice > 0 ? finalPrice : 35000,
        quantity: Number(i.quantity ?? 1),
        imageUrl: finalImg,
      };
    });
  } else if (Array.isArray(row.items) && row.items.length > 0) {
    mappedItems = row.items.map((i: any) => {
      const menuItem = cachedMenu.find((m) => m.id === i.menu_item_id || m.id === i.menuItemId);
      const rawName = i.name;
      let finalName = rawName;
      if (!finalName || finalName === 'Suất ăn Căn tin') {
        finalName = menuItem?.name || finalName || '';
      }
      return {
        menuItemId: i.menuItemId || i.menu_item_id || '',
        name: finalName || 'Suất ăn Căn tin',
        price: Number(i.price ?? menuItem?.price ?? 35000),
        quantity: Number(i.quantity ?? 1),
        imageUrl: i.imageUrl || i.image_url || menuItem?.imageUrl || '',
      };
    });
  }

  // Nếu tất cả các món đều mang tên generic 'Suất ăn Căn tin' hoặc mảng trống, phân tích từ row.note
  const allGeneric = mappedItems.length === 0 || mappedItems.every((it) => !it.name || it.name === 'Suất ăn Căn tin');
  if (allGeneric && row.note) {
    const fromNote = parseItemsFromNote(row.note);
    if (fromNote.length > 0) {
      mappedItems = fromNote;
    }
  }

  // Nếu vẫn chưa có tên món cụ thể, tìm trong local storage cache
  const stillGeneric = mappedItems.length === 0 || mappedItems.every((it) => !it.name || it.name === 'Suất ăn Căn tin');
  if (stillGeneric && (row.id || row.order_code)) {
    const cached = getCachedOrders();
    const matched = cached.find((c) => c.id === row.id || c.orderCode === row.order_code);
    if (matched && matched.items && matched.items.length > 0 && matched.items.some((it) => it.name && it.name !== 'Suất ăn Căn tin')) {
      mappedItems = matched.items;
    }
  }

  // Bổ sung thông tin từ cachedMenu cho các món còn thiếu
  mappedItems = mappedItems.map((it) => {
    if ((!it.name || it.name === 'Suất ăn Căn tin') && it.menuItemId) {
      const found = cachedMenu.find((m) => m.id === it.menuItemId);
      if (found) {
        return {
          ...it,
          name: found.name,
          price: it.price || found.price,
          imageUrl: it.imageUrl || found.imageUrl,
        };
      }
    }
    return it;
  });

  return {
    id: row.id,
    orderCode: row.order_code,
    userId: row.user_id,
    userName: row.user_name || '',
    userPhone: row.user_phone || '',
    userDepartment: row.user_department || '',
    items: mappedItems,
    totalAmount: Number(row.total_amount || 0),
    deliveryMethod: row.delivery_method || 'dine_in',
    roomNumber: row.room_number || '',
    pickupTime: row.pickup_time || '11:30',
    targetDate: row.target_date || row.meal_date || row.order_date || '',
    createdAt: row.created_at || new Date().toISOString(),
    status: row.status || 'confirmed',
    cancellationDeadline: row.cancellation_deadline || '16:00',
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    isExceptionOrder: Boolean(row.is_exception_order || row.used_qr_token),
    exceptionTokenUsed: row.exception_token_used || row.used_qr_token || '',
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
