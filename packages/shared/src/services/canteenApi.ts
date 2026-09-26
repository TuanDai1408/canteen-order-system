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

// BroadcastChannel for cross-tab and cross-iframe zero-latency communication
export const broadcastSyncChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('canteen_system_sync_bus')
    : null;

// Kênh Supabase Realtime toàn cục để broadcast sự kiện 2 chiều tức thì giữa các thiết bị/client
export const supabaseGlobalSyncChannel =
  isSupabaseConfigured && supabase
    ? supabase.channel('canteen-global-sync', { config: { broadcast: { self: false } } })
    : null;

/**
 * Phát tín hiệu đồng bộ hệ thống 3 tầng tức thì:
 * 1. Supabase Realtime WebSocket (cho các thiết bị, trình duyệt khác)
 * 2. BroadcastChannel (cho các tab/cửa sổ khác cùng trình duyệt)
 * 3. CustomEvent & LocalStorage (cho các component trong cùng window)
 */
export function broadcastSystemEvent(type: string, payload?: any) {
  const messageData = { type, ...payload, timestamp: Date.now() };

  // 1. Supabase WebSocket Broadcast
  try {
    if (supabaseGlobalSyncChannel) {
      if (supabaseGlobalSyncChannel.state !== 'joined' && supabaseGlobalSyncChannel.state !== 'joining') {
        supabaseGlobalSyncChannel.subscribe();
      }
      supabaseGlobalSyncChannel.send({
        type: 'broadcast',
        event: 'canteen_sync',
        payload: messageData,
      }).catch(() => {});
    }
  } catch {}

  // 2. Window BroadcastChannel
  try {
    if (broadcastSyncChannel) {
      broadcastSyncChannel.postMessage(messageData);
    }
  } catch {}

  // 3. Local CustomEvent
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(type, { detail: payload }));
    }
  } catch {}
}

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
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      throw new Error(
        'Hệ thống Supabase đang bật chế độ gửi mail xác nhận và đã vượt quá giới hạn 3-4 email/giờ của gói mặc định. ' +
        'Cách khắc phục triệt để: Vào Supabase Dashboard -> Authentication -> Providers -> Email -> TẮT mục "Confirm email" (Enable email confirmations = OFF).'
      );
    }
    if (msg.includes('user already registered') || msg.includes('already exists')) {
      throw new Error('Email này đã được đăng ký tài khoản trên hệ thống. Vui lòng chuyển sang tab Đăng nhập.');
    }
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
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function setCachedQRTokens(tokens: QRExceptionToken[]) {
  try {
    if (Array.isArray(tokens)) {
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

  broadcastSystemEvent('canteen_wallet_updated', { userId: params.userId, walletBalance: amount });
  broadcastSystemEvent('canteen_user_status_changed', { userId: params.userId, isActive: true });

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

  broadcastSystemEvent('canteen_wallet_updated', { userId, walletBalance: newBalance });
}

export async function setUserDisabledStatus(
  userId: string,
  isDisabled: boolean,
  actor?: UserProfile
): Promise<UserProfile> {
  checkSupabase();
  const nowIso = new Date().toISOString();

  // Thử cập nhật kèm cột is_disabled
  const payload: Record<string, any> = {
    is_active: !isDisabled,
    is_disabled: isDisabled,
    updated_at: nowIso,
  };
  if (isDisabled) {
    payload.disabled_at = nowIso;
  } else {
    payload.disabled_at = null;
  }

  let { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select()
    .maybeSingle();

  // Nếu DB chưa có cột is_disabled, fallback cập nhật is_active
  if (error && (error.message.includes('is_disabled') || error.message.includes('column'))) {
    const fallbackPayload = {
      is_active: !isDisabled,
      updated_at: nowIso,
    };
    const res = await supabase
      .from('users')
      .update(fallbackPayload)
      .eq('id', userId)
      .select()
      .maybeSingle();
    data = res.data;
    error = res.error;
  }

  if (error) {
    throw new Error(`Cập nhật trạng thái tài khoản thất bại: ${error.message}`);
  }

  // Cập nhật bộ nhớ cache người dùng
  const cachedUsers = getCachedUsers();
  const updatedList = cachedUsers.map((u) => {
    if (u.id === userId) {
      return {
        ...u,
        isDisabled,
        isActive: !isDisabled,
        disabledAt: isDisabled ? nowIso : undefined,
      };
    }
    return u;
  });
  setCachedUsers(updatedList);

  // Phát tín hiệu đồng bộ realtime tới tất cả tab / client
  broadcastSystemEvent('canteen_user_status_changed', {
    userId,
    isDisabled,
    isActive: !isDisabled,
  });

  return mapUser(data || { id: userId, is_active: !isDisabled, is_disabled: isDisabled });
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
  broadcastSystemEvent('canteen_menu_updated');
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

    broadcastSystemEvent('canteen_menu_updated');

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
  broadcastSystemEvent('canteen_menu_updated');
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
  note?: string;
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

  // Kiểm tra mã QR ngoại lệ và giới hạn số lượt đặt nếu đặt ngoài giờ
  const cleanToken = params.exceptionToken?.trim();
  let matchedToken: QRExceptionToken | null = null;

  if (params.isExceptionOrder || cleanToken) {
    if (!cleanToken) {
      return { success: false, error: 'Vui lòng nhập mã QR ngoại lệ để đặt suất ăn ngoài khung giờ.' };
    }

    const cachedTokens = getCachedQRTokens();
    matchedToken = cachedTokens.find((t) => t.token.toUpperCase() === cleanToken.toUpperCase()) || null;

    if (!matchedToken && isSupabaseConfigured && supabase) {
      try {
        const { data: dbToken } = await supabase
          .from('qr_exception_tokens')
          .select('*')
          .eq('token', cleanToken)
          .maybeSingle();
        if (dbToken) {
          matchedToken = mapQRToken(dbToken);
        }
      } catch (tErr) {
        console.warn('QR token query note:', tErr);
      }
    }

    if (!matchedToken) {
      return {
        success: false,
        error: `Mã QR ngoại lệ "${cleanToken}" không tồn tại trên hệ thống. Vui lòng kiểm tra lại.`,
      };
    }

    if (matchedToken.isDisabled) {
      return {
        success: false,
        error: `Mã QR ngoại lệ "${cleanToken}" đã bị Quản trị viên vô hiệu hóa. Không thể sử dụng để đặt món.`,
      };
    }

    if (new Date(matchedToken.expiresAt).getTime() < Date.now()) {
      return {
        success: false,
        error: `Mã QR ngoại lệ "${cleanToken}" đã hết hạn sử dụng lúc ${new Date(matchedToken.expiresAt).toLocaleTimeString('vi-VN')}.`,
      };
    }

    const allowedQty = Number(matchedToken.quantity) || 1; // Số LƯỢT ĐẶT đơn hàng cho phép
    const allCachedOrders = getCachedOrders();
    const tokenOrders = allCachedOrders.filter(
      (o) =>
        (o.exceptionTokenUsed && o.exceptionTokenUsed.toUpperCase() === cleanToken.toUpperCase()) ||
        ((o as any).used_qr_token && String((o as any).used_qr_token).toUpperCase() === cleanToken.toUpperCase())
    );
    const usedOrdersCount = Math.max(tokenOrders.length, Number(matchedToken.usedCount || 0));

    if (matchedToken.isUsed || usedOrdersCount >= allowedQty) {
      matchedToken.isUsed = true;
      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('qr_exception_tokens').update({ is_used: true, used_count: allowedQty }).eq('token', matchedToken.token);
        } catch {}
      }
      return {
        success: false,
        error: `Mã QR ngoại lệ "${cleanToken}" đã hết số lượt đặt cho phép (đã dùng ${usedOrdersCount}/${allowedQty} lượt đặt). Không thể sử dụng mã này được nữa.`,
      };
    }
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

  // Kiểm tra tài khoản có bị vô hiệu hóa không
  if (userData) {
    const isUserDisabled = Boolean(
      userData.is_disabled ||
      userData.isDisabled ||
      (userData.is_active === false && Number(userData.wallet_balance ?? 0) > 0)
    );
    if (isUserDisabled) {
      return {
        success: false,
        error: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Bạn không thể thực hiện đặt món. Vui lòng liên hệ Ban Quản lý Căn tin để được hỗ trợ mở lại.',
      };
    }
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

  // 5. Tạo mã đơn hàng độc nhất chuẩn hoá POS: CT-YYYYMMDD-HHMMSS-XXXX (Không bao giờ trùng lặp)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  let orderCode = `CT-${yyyy}${mm}${dd}-${hh}${min}${sec}-${randSuffix}`;
  const targetDate = getTomorrowStr();
  const itemsSummaryText = orderItemsData
    .map((it) => `${it.quantity}x ${it.name} (${formatVnd(it.price)})`)
    .join(', ');

  let orderUuid = generateUUID();
  const userCustomNote = params.note?.trim() || '';

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
    note: userCustomNote
      ? (params.isExceptionOrder ? `[Ngoại lệ: ${cleanToken}] ${userCustomNote}` : userCustomNote)
      : (params.isExceptionOrder ? `[Ngoại lệ: ${cleanToken}] ${itemsSummaryText}` : itemsSummaryText),
    notes: userCustomNote
      ? (params.isExceptionOrder ? `[Ngoại lệ: ${cleanToken}] ${userCustomNote}` : userCustomNote)
      : (params.isExceptionOrder ? `[Ngoại lệ: ${cleanToken}] ${itemsSummaryText}` : itemsSummaryText),
  };

  // Vòng lặp thích ứng schema: Tự động loại bỏ bất kỳ cột nào mà bảng orders trên DB chưa hỗ trợ & tự phục hồi khi trùng mã
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
        const errMsg = (res.error.message || '').toLowerCase();

        // Xử lý triệt để lỗi duplicate key value violates unique constraint "orders_order_code_key"
        if (
          errMsg.includes('orders_order_code_key') ||
          errMsg.includes('duplicate key') ||
          errMsg.includes('violates unique constraint') ||
          errMsg.includes('order_code')
        ) {
          const freshTime = new Date();
          const freshRand = Math.floor(1000 + Math.random() * 9000);
          const freshCode = `CT-${yyyy}${mm}${dd}-${String(freshTime.getHours()).padStart(2, '0')}${String(freshTime.getMinutes()).padStart(2, '0')}${String(freshTime.getSeconds()).padStart(2, '0')}-${freshRand}`;
          const freshId = generateUUID();
          orderCode = freshCode;
          orderUuid = freshId;
          currentPayload.order_code = freshCode;
          currentPayload.id = freshId;
          console.warn(
            `[placeOrder unique constraint fix]: Trùng mã đơn orders_order_code_key, tự động tạo mã duy nhất mới '${freshCode}' và thử lại ngay...`
          );
          continue;
        }

        // Trích xuất tên cột bị thiếu từ lỗi PostgREST hoặc PostgreSQL
        const missingColMatch =
          res.error.message.match(/Could not find the '([^']+)' column/) ||
          res.error.message.match(/column "([^"]+)" of relation/i) ||
          res.error.message.match(/Could not find the column '([^']+)'/i) ||
          res.error.message.match(/column '([^']+)' does not exist/i);

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
      order_id: generatedId,
      menu_item_id: it.real_db_item_id || null,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      subtotal: it.price * it.quantity,
      image_url: it.image_url || '',
    }));

    for (let itAttempt = 0; itAttempt < 6; itAttempt++) {
      const { error: itemErr } = await supabase.from('order_items').insert(itemsPayload);
      if (!itemErr) {
        console.log('[placeOrder]: Successfully inserted order_items into Supabase');
        break;
      }

      console.warn(`[placeOrder order_items attempt ${itAttempt} notice]:`, itemErr);

      const itemErrMsg = (itemErr.message || '').toLowerCase();

      // Nếu lỗi do khoá ngoại menu_item_id (món ăn chưa có trên DB hoặc khác ID)
      if (itemErrMsg.includes('menu_item_id') || itemErrMsg.includes('foreign key') || itemErrMsg.includes('violates foreign key')) {
        console.warn('[order_items adaptive]: Khoá ngoại menu_item_id không hợp lệ, chuyển về null để lưu tên món...');
        itemsPayload = itemsPayload.map((it) => ({ ...it, menu_item_id: null }));
        continue;
      }

      // Nếu lỗi do thiếu cột trên bảng order_items
      const missingItemCol =
        (itemErr.message || '').match(/Could not find the '([^']+)' column/) ||
        (itemErr.message || '').match(/column "([^"]+)" of relation/i);

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

      // Fallback: Chèn tối giản chỉ với order_id, name, price, quantity
      if (itAttempt === 2) {
        itemsPayload = orderItemsData.map((it) => ({
          order_id: generatedId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
        }));
        continue;
      }

      // Fallback: Chèn từng món một
      if (itAttempt === 3) {
        for (const it of orderItemsData) {
          try {
            await supabase.from('order_items').insert({
              order_id: generatedId,
              name: it.name,
              price: it.price,
              quantity: it.quantity,
            });
          } catch (singleErr) {
            console.warn('[placeOrder single item insert error]:', singleErr);
          }
        }
        break;
      }
      break;
    }
  } catch (e) {
    console.warn('[placeOrder order_items exception]:', e);
  }

  // 8. Trừ tồn kho món ăn trên Supabase (Hỗ trợ tra cứu theo ID hoặc Tên món)
  for (const it of orderItemsData) {
    try {
      let dbItem: { id: string; current_stock: number } | null = null;

      // 8.1 Thử tìm món trong database bằng ID (nếu có UUID hợp lệ)
      if (it.real_db_item_id && isValidUuid(it.real_db_item_id)) {
        const { data: byId } = await supabase
          .from('menu_items')
          .select('id, current_stock')
          .eq('id', it.real_db_item_id)
          .maybeSingle();
        if (byId) dbItem = byId;
      }

      // 8.2 Nếu chưa tìm thấy theo ID, tìm theo Tên món chính xác trong DB
      if (!dbItem && it.name) {
        const cleanName = it.name.trim();
        const { data: byName } = await supabase
          .from('menu_items')
          .select('id, current_stock')
          .ilike('name', cleanName)
          .limit(1)
          .maybeSingle();
        if (byName) {
          dbItem = byName;
          it.real_db_item_id = byName.id;
        }
      }

      // 8.3 Cập nhật trừ tồn kho trong bảng menu_items trên DB Supabase
      if (dbItem) {
        const currentStockVal = Number(dbItem.current_stock ?? 0);
        const newStockVal = Math.max(0, currentStockVal - it.quantity);
        const { error: stockErr } = await supabase
          .from('menu_items')
          .update({
            current_stock: newStockVal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', dbItem.id);

        if (stockErr) {
          console.warn(`[placeOrder stock update warning for "${it.name}"]:`, stockErr.message);
        } else {
          console.log(`[placeOrder stock updated]: "${it.name}" (ID: ${dbItem.id}) tồn mới: ${newStockVal}`);
        }
      } else {
        console.warn(`[placeOrder]: Không tìm thấy món "${it.name}" trong database để trừ tồn.`);
      }
    } catch (stockErr) {
      console.warn('[placeOrder stock update exception]:', stockErr);
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
    const requested = orderItemsData.find(
      (it) =>
        it.menu_item_id === m.id ||
        (it.real_db_item_id && it.real_db_item_id === m.id) ||
        (m.name && it.name && m.name.trim().toLowerCase() === it.name.trim().toLowerCase())
    );
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
    note: userCustomNote || (params.isExceptionOrder ? `[Ngoại lệ: ${cleanToken}] ${itemsSummaryText}` : itemsSummaryText),
    notes: userCustomNote || (params.isExceptionOrder ? `[Ngoại lệ: ${cleanToken}] ${itemsSummaryText}` : itemsSummaryText),
    isExceptionOrder: Boolean(params.isExceptionOrder),
    exceptionTokenUsed: params.exceptionToken || undefined,
    deviceInfo: device,
  };

  // Cập nhật trạng thái và số lượt đặt đã sử dụng của mã QR ngoại lệ
  if (matchedToken && cleanToken) {
    const allowedQty = Number(matchedToken.quantity) || 1;
    const allCachedOrders = getCachedOrders();
    const tokenOrders = allCachedOrders.filter(
      (o) =>
        (o.exceptionTokenUsed && o.exceptionTokenUsed.toUpperCase() === cleanToken.toUpperCase()) ||
        ((o as any).used_qr_token && String((o as any).used_qr_token).toUpperCase() === cleanToken.toUpperCase())
    );
    // Mỗi đơn hàng đặt thành công = 1 LƯỢT ĐẶT
    const prevUsedOrders = Math.max(tokenOrders.length, Number(matchedToken.usedCount || 0));
    const totalUsedOrders = prevUsedOrders + 1;
    const isFullyUsed = totalUsedOrders >= allowedQty;

    const updatedNote = matchedToken.note
      ? (matchedToken.note.includes('[Đã dùng:')
          ? matchedToken.note.replace(/\[Đã dùng:\s*\d+\/\d+\s*lượt\]/i, `[Đã dùng: ${totalUsedOrders}/${allowedQty} lượt]`)
          : `${matchedToken.note} [Đã dùng: ${totalUsedOrders}/${allowedQty} lượt]`)
      : `[Đã dùng: ${totalUsedOrders}/${allowedQty} lượt]`;

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('qr_exception_tokens')
          .update({
            used_count: totalUsedOrders,
            is_used: isFullyUsed,
            used_by: userData.name || authUser.email || 'Người dùng',
            used_at: new Date().toISOString(),
            note: updatedNote,
          })
          .eq('token', matchedToken.token);
      } catch (e) {
        console.warn('Update qr token status note:', e);
      }
    }

    const cachedTokens = getCachedQRTokens();
    const updatedTokens = cachedTokens.map((t) =>
      t.token.toUpperCase() === cleanToken.toUpperCase()
        ? {
            ...t,
            usedCount: totalUsedOrders,
            isUsed: isFullyUsed,
            usedBy: userData.name || authUser.email || 'Người dùng',
            usedAt: new Date().toISOString(),
            note: updatedNote,
          }
        : t
    );
    setCachedQRTokens(updatedTokens);

    // Phát tín hiệu broadcast cập nhật mã QR
    try {
      if (broadcastSyncChannel) {
        broadcastSyncChannel.postMessage({
          type: 'qr_token_updated',
          token: matchedToken.token,
          usedCount: totalUsedOrders,
          isUsed: isFullyUsed,
        });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('canteen_qr_token_updated', {
            detail: { token: matchedToken.token, usedCount: totalUsedOrders, isUsed: isFullyUsed },
          })
        );
        localStorage.setItem(
          'canteen_last_qr_token_event',
          JSON.stringify({ token: matchedToken.token, usedCount: totalUsedOrders, isUsed: isFullyUsed, time: Date.now() })
        );
      }
    } catch {}
  }

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

  // Phát tín hiệu broadcast tức thì toàn hệ thống cho tab, window và thiết bị khác cập nhật ví, thực đơn và đơn hàng
  broadcastSystemEvent('canteen_order_created', { order: localOrder, userId: userData.id });
  broadcastSystemEvent('canteen_order_placed', { order: localOrder, userId: userData.id });
  broadcastSystemEvent('canteen_wallet_updated', { walletBalance: newBalance, userId: userData.id });
  broadcastSystemEvent('canteen_menu_updated');

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
          let mItem: any = null;
          if (it.menu_item_id && isValidUuid(it.menu_item_id)) {
            const { data } = await supabase
              .from('menu_items')
              .select('id, current_stock')
              .eq('id', it.menu_item_id)
              .maybeSingle();
            mItem = data;
          }
          if (!mItem && it.name) {
            const { data } = await supabase
              .from('menu_items')
              .select('id, current_stock')
              .ilike('name', it.name.trim())
              .limit(1)
              .maybeSingle();
            mItem = data;
          }

          if (mItem) {
            const restoredStock = Number(mItem.current_stock ?? 0) + Number(it.quantity ?? 1);
            await supabase
              .from('menu_items')
              .update({ current_stock: restoredStock, updated_at: new Date().toISOString() })
              .eq('id', mItem.id);
          }
        }

        // Cập nhật lại tồn kho trong cache thực đơn
        const currMenu = getCachedMenu();
        const updatedMenu = currMenu.map((m) => {
          const matchingIt = fetchedItems.find(
            (it) => it.menu_item_id === m.id || (it.name && m.name && it.name.trim().toLowerCase() === m.name.trim().toLowerCase())
          );
          if (matchingIt) {
            return { ...m, currentStock: m.currentStock + Number(matchingIt.quantity ?? 1) };
          }
          return m;
        });
        setCachedMenu(updatedMenu);
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

    broadcastSystemEvent('canteen_order_cancelled', { orderId: cleanOrderId, status: 'cancelled' });
    broadcastSystemEvent('canteen_order_updated', { orderId: cleanOrderId, status: 'cancelled' });
    if (refundBalance !== undefined) {
      broadcastSystemEvent('canteen_wallet_updated', { walletBalance: refundBalance });
    }
    broadcastSystemEvent('canteen_menu_updated');

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

    broadcastSystemEvent('canteen_order_cancelled', { orderId: cleanOrderId, status: 'cancelled' });
    broadcastSystemEvent('canteen_order_updated', { orderId: cleanOrderId, status: 'cancelled' });
    if (refundBalance !== undefined) {
      broadcastSystemEvent('canteen_wallet_updated', { walletBalance: refundBalance });
    }
    broadcastSystemEvent('canteen_menu_updated');

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
  limit?: number;
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

    // Giảm giới hạn số dòng mỗi lần tải (user và portal) xuống mức đủ dùng vận hành để giảm egress Supabase
    const userLimit = filters?.limit ?? 40;
    const portalLimit = filters?.limit ?? 100;
    const effectiveLimit = (filters?.userId || filters?.authUserId) ? userLimit : portalLimit;
    query = query.limit(effectiveLimit);

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
        fallbackQuery = fallbackQuery.limit(effectiveLimit);

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

  // Phát tín hiệu broadcast cập nhật trạng thái đơn tức thì toàn hệ thống
  broadcastSystemEvent('canteen_order_updated', { orderId, status });
}

// ============================================================
// QR TOKENS
// ============================================================

export async function createQRToken(
  actor: UserProfile,
  note?: string,
  expiresInMinutes = 30,
  quantity = 1
): Promise<QRExceptionToken> {
  checkSupabase();
  const token = `QR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  const cleanUserNote = note ? note.replace(/\[Số lượng:\s*\d+\s*(suất|lượt)\]\s*/gi, '').trim() : '';
  const formattedNote = cleanUserNote ? `[Số lượng: ${quantity} lượt] ${cleanUserNote}` : `[Số lượng: ${quantity} lượt]`;

  let insertedData: any = null;
  // Try inserting with quantity and used_count
  try {
    const { data, error } = await supabase
      .from('qr_exception_tokens')
      .insert({
        token,
        expires_at: expiresAt,
        created_by: actor.id,
        created_by_name: actor.name,
        note: formattedNote,
        quantity,
        used_count: 0,
        is_used: false,
      })
      .select()
      .single();

    if (!error && data) {
      insertedData = data;
    } else if (error) {
      // Retry without quantity/used_count column if schema does not have it yet
      const { data: retryData, error: retryErr } = await supabase
        .from('qr_exception_tokens')
        .insert({
          token,
          expires_at: expiresAt,
          created_by: actor.id,
          created_by_name: actor.name,
          note: formattedNote,
          is_used: false,
        })
        .select()
        .single();
      if (retryErr) throw new Error(`Lỗi tạo mã QR ngoại lệ: ${retryErr.message}`);
      insertedData = retryData;
    }
  } catch (err: any) {
    throw new Error(`Lỗi tạo mã QR ngoại lệ: ${err.message}`);
  }

  const newToken = mapQRToken(insertedData);
  newToken.quantity = quantity;
  newToken.usedCount = 0;
  newToken.isUsed = false;
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

    const allOrders = getCachedOrders();

    if (!error && data) {
      const list = data.map((row) => {
        const tokenObj = mapQRToken(row);
        const actualOrders = allOrders.filter(
          (o) =>
            (o.exceptionTokenUsed && o.exceptionTokenUsed.toUpperCase() === tokenObj.token.toUpperCase()) ||
            ((o as any).used_qr_token && String((o as any).used_qr_token).toUpperCase() === tokenObj.token.toUpperCase())
        );
        const dynamicUsed = Math.max(Number(tokenObj.usedCount) || 0, actualOrders.length);
        const qty = Number(tokenObj.quantity) || 1;
        tokenObj.usedCount = dynamicUsed;
        tokenObj.isUsed = tokenObj.isUsed || dynamicUsed >= qty;
        return tokenObj;
      });
      setCachedQRTokens(list);
      return list;
    }
    if (error) {
      console.warn('[getQRTokens notice]:', error.message);
    }

    const cached = getCachedQRTokens();
    const recalculated = cached.map((t) => {
      const actualOrders = allOrders.filter(
        (o) =>
          (o.exceptionTokenUsed && o.exceptionTokenUsed.toUpperCase() === t.token.toUpperCase()) ||
          ((o as any).used_qr_token && String((o as any).used_qr_token).toUpperCase() === t.token.toUpperCase())
      );
      const dynamicUsed = Math.max(Number(t.usedCount) || 0, actualOrders.length);
      const qty = Number(t.quantity) || 1;
      return {
        ...t,
        usedCount: dynamicUsed,
        isUsed: t.isUsed || dynamicUsed >= qty,
      };
    });
    setCachedQRTokens(recalculated);
    return recalculated;
  } catch (err) {
    console.warn('[getQRTokens error]:', err);
    return getCachedQRTokens();
  }
}

/**
 * Vô hiệu hóa hoặc kích hoạt lại mã QR ngoại lệ
 */
export async function toggleQRTokenStatus(
  tokenString: string,
  isDisabled: boolean
): Promise<QRExceptionToken> {
  checkSupabase();
  const cleanToken = tokenString.trim();

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from('qr_exception_tokens')
        .update({
          is_disabled: isDisabled,
        })
        .eq('token', cleanToken);

      if (error) {
        // Fallback: update is_used flag if is_disabled column not in table
        await supabase
          .from('qr_exception_tokens')
          .update({
            is_used: isDisabled,
          })
          .eq('token', cleanToken);
      }
    } catch (e) {
      console.warn('toggleQRTokenStatus err:', e);
    }
  }

  const cached = getCachedQRTokens();
  let updatedToken: QRExceptionToken | null = null;
  const updatedList = cached.map((t) => {
    if (t.token.toUpperCase() === cleanToken.toUpperCase()) {
      updatedToken = {
        ...t,
        isDisabled,
      };
      return updatedToken;
    }
    return t;
  });
  setCachedQRTokens(updatedList);

  // Broadcast QR update
  try {
    if (broadcastSyncChannel) {
      broadcastSyncChannel.postMessage({
        type: 'qr_token_updated',
        token: cleanToken,
        isDisabled,
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('canteen_qr_token_updated', {
          detail: { token: cleanToken, isDisabled },
        })
      );
      localStorage.setItem(
        'canteen_last_qr_token_event',
        JSON.stringify({ token: cleanToken, isDisabled, time: Date.now() })
      );
    }
  } catch {}

  if (!updatedToken) {
    throw new Error(`Không tìm thấy mã QR "${cleanToken}"`);
  }
  return updatedToken;
}

/**
 * Xóa mã QR ngoại lệ
 */
export async function deleteQRToken(tokenString: string): Promise<boolean> {
  checkSupabase();
  const cleanToken = tokenString.trim();
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('qr_exception_tokens').delete().eq('token', cleanToken);
    } catch (e) {
      console.warn('deleteQRToken err:', e);
    }
  }

  const cached = getCachedQRTokens();
  const updatedList = cached.filter((t) => t.token.toUpperCase() !== cleanToken.toUpperCase());
  setCachedQRTokens(updatedList);

  try {
    if (broadcastSyncChannel) {
      broadcastSyncChannel.postMessage({ type: 'qr_token_deleted', token: cleanToken });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('canteen_qr_token_updated', { detail: { token: cleanToken, deleted: true } }));
    }
  } catch {}

  return true;
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
      broadcastSystemEvent('canteen_menu_updated');
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

export interface TimeGateConfig {
  openTime: string;
  closeTime: string;
  isForceOpen?: boolean;
}

export function getCustomTimeGateConfig(): TimeGateConfig {
  try {
    const saved = localStorage.getItem(TIME_GATE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.openTime && parsed.closeTime) return parsed;
    }
  } catch {
    // fallback
  }
  return { openTime: '13:00', closeTime: '17:00', isForceOpen: false };
}

export async function fetchTimeGateConfig(): Promise<TimeGateConfig> {
  try {
    if (isSupabaseConfigured && supabase) {
      let matchedRow: any = null;

      // 1. Thử đọc từ bảng 'settings'
      try {
        const { data: sData, error: sErr } = await supabase
          .from('settings')
          .select('*');
        if (!sErr && Array.isArray(sData) && sData.length > 0) {
          matchedRow = sData.find(
            (r) => r.key === 'time_gate_config' || r.key === 'time_gate'
          ) || sData[0];
        }
      } catch (err) {
        console.warn('Fetch from settings notice:', err);
      }

      // 2. Nếu không có trong 'settings', thử 'system_settings'
      if (!matchedRow) {
        try {
          const { data: sysData, error: sysErr } = await supabase
            .from('system_settings')
            .select('*');
          if (!sysErr && Array.isArray(sysData) && sysData.length > 0) {
            matchedRow = sysData.find(
              (r) => r.key === 'time_gate_config' || r.key === 'time_gate' || r.key === 'canteen_time_gate'
            ) || sysData[0];
          }
        } catch (err) {
          console.warn('Fetch from system_settings notice:', err);
        }
      }

      if (matchedRow?.value) {
        let val = matchedRow.value;
        if (typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch {}
        }
        const openTime =
          val.openTime ||
          (val.open_hour !== undefined ? `${String(val.open_hour).padStart(2, '0')}:00` : '13:00');
        const closeTime =
          val.closeTime ||
          (val.close_hour !== undefined ? `${String(val.close_hour).padStart(2, '0')}:00` : '17:00');
        const isForceOpen = Boolean(val.isForceOpen || val.is_force_open || val.forceOpen);

        const cfg: TimeGateConfig = { openTime, closeTime, isForceOpen };
        const oldCfg = getCustomTimeGateConfig();
        const hasChanged =
          oldCfg.openTime !== cfg.openTime ||
          oldCfg.closeTime !== cfg.closeTime ||
          Boolean(oldCfg.isForceOpen) !== Boolean(cfg.isForceOpen);

        if (hasChanged) {
          localStorage.setItem(TIME_GATE_STORAGE_KEY, JSON.stringify(cfg));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_time_gate_updated', { detail: cfg }));
          }
        }
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
  actor?: UserProfile,
  isForceOpen?: boolean
): Promise<void> {
  const [openHour] = openTime.split(':').map(Number);
  const [closeHour] = closeTime.split(':').map(Number);
  const cfg: TimeGateConfig = {
    openTime,
    closeTime,
    isForceOpen: Boolean(isForceOpen),
  };
  localStorage.setItem(TIME_GATE_STORAGE_KEY, JSON.stringify(cfg));

  // Phát tín hiệu tức thì toàn hệ thống qua Supabase, BroadcastChannel và Window
  broadcastSystemEvent('canteen_time_gate_updated', { cfg });

  if (isSupabaseConfigured && supabase) {
    const payload = {
      openTime,
      closeTime,
      open_hour: isNaN(openHour) ? 13 : openHour,
      close_hour: isNaN(closeHour) ? 17 : closeHour,
      isForceOpen: Boolean(isForceOpen),
      timezone: 'Asia/Ho_Chi_Minh',
      updated_by: actor?.name || 'Admin',
      updated_at: new Date().toISOString(),
    };

    // Lưu đồng thời vào cả 'settings' và 'system_settings' để đồng bộ 100%
    try {
      await Promise.allSettled([
        supabase.from('settings').upsert({
          key: 'time_gate_config',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('settings').upsert({
          key: 'time_gate',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('system_settings').upsert({
          key: 'time_gate_config',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('system_settings').upsert({
          key: 'time_gate',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
      ]);
    } catch (e) {
      console.warn('Sync time gate to supabase warning:', e);
    }
  }
}

/**
 * Lấy giờ & phút chuẩn theo múi giờ Việt Nam (UTC+7)
 */
function getVietnamTime(): { hours: number; minutes: number } {
  try {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const hourPart = parts.find((p) => p.type === 'hour');
    const minPart = parts.find((p) => p.type === 'minute');
    if (hourPart && minPart) {
      return { hours: parseInt(hourPart.value, 10), minutes: parseInt(minPart.value, 10) };
    }
  } catch (e) {}
  const now = new Date();
  return { hours: now.getHours(), minutes: now.getMinutes() };
}

export function getTimeGateStatus(customOpenHour?: number, customCloseHour?: number): TimeGateStatus {
  const cfg = getCustomTimeGateConfig();
  const [cfgOpenH, cfgOpenM] = cfg.openTime.split(':').map(Number);
  const [cfgCloseH, cfgCloseM] = cfg.closeTime.split(':').map(Number);

  const openH = customOpenHour ?? (isNaN(cfgOpenH) ? 13 : cfgOpenH);
  const openM = isNaN(cfgOpenM) ? 0 : cfgOpenM;
  const closeH = customCloseHour ?? (isNaN(cfgCloseH) ? 17 : cfgCloseH);
  const closeM = isNaN(cfgCloseM) ? 0 : cfgCloseM;

  const vnTime = getVietnamTime();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const checkIsOpen = (h: number, m: number): { open: boolean; remaining?: number } => {
    const curM = h * 60 + m;
    if (openMinutes === closeMinutes) {
      return { open: true, remaining: 24 * 60 };
    }
    if (openMinutes <= closeMinutes) {
      // Khung giờ cùng trong 1 ngày (VD: 06:00 -> 22:00)
      const open = curM >= openMinutes && curM < closeMinutes;
      return { open, remaining: open ? closeMinutes - curM : undefined };
    } else {
      // Khung giờ qua đêm (VD: 18:00 -> 06:00 sáng hôm sau)
      const open = curM >= openMinutes || curM < closeMinutes;
      const remaining = open
        ? curM >= openMinutes
          ? 24 * 60 - curM + closeMinutes
          : closeMinutes - curM
        : undefined;
      return { open, remaining };
    }
  };

  const vnStatus = checkIsOpen(vnTime.hours, vnTime.minutes);

  // Cổng mở nếu: được cấu hình Luôn Mở (forceOpen), hoặc giờ VN nằm trong khung giờ
  const isOpen = Boolean(cfg.isForceOpen) || vnStatus.open;
  const remainingMinutes = vnStatus.remaining;

  return {
    isOpen,
    currentHour: vnTime.hours,
    currentMinute: vnTime.minutes,
    message: isOpen
      ? `Cổng đặt món đang mở nhận đơn (từ ${cfg.openTime} đến ${cfg.closeTime})`
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

export interface RealtimeSyncInfo {
  tables: string[];
  payload?: any;
}

export function subscribeRealtime(callback: (info?: RealtimeSyncInfo) => void): () => void {
  let debounceTimer: any = null;
  const changedTables = new Set<string>();
  let lastPayload: any = null;

  // Hợp nhất (coalesce) mọi sự kiện trong cửa sổ 500ms thành đúng 1 lần tải lại duy nhất
  const triggerDebounced = (payload?: any) => {
    lastPayload = payload;
    if (payload?.table) {
      changedTables.add(String(payload.table));
    }
    const eventType = payload?.type || payload?.event;
    if (typeof eventType === 'string') {
      if (eventType.includes('order')) {
        changedTables.add('orders');
        changedTables.add('menu_items');
      }
      if (eventType.includes('menu')) {
        changedTables.add('menu_items');
      }
      if (eventType.includes('wallet') || eventType.includes('user')) {
        changedTables.add('users');
      }
      if (eventType.includes('qr')) {
        changedTables.add('qr_exception_tokens');
      }
      if (eventType.includes('time_gate')) {
        changedTables.add('settings');
      }
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const tables = Array.from(changedTables);
      changedTables.clear();
      if (tables.includes('settings') || tables.includes('system_settings')) {
        fetchTimeGateConfig().catch(() => {});
      }
      try {
        callback({ tables, payload: lastPayload });
      } catch (err) {
        console.warn('[@canteen/shared] Realtime callback error:', err);
      }
    }, 500);
  };

  const localHandler = (e: Event) => {
    const detail = (e as CustomEvent)?.detail;
    triggerDebounced({ type: e.type, ...detail });
  };

  const broadcastHandler = (ev: MessageEvent) => {
    if (ev.data) {
      triggerDebounced(ev.data);
    }
  };

  const EVENT_NAMES = [
    'canteen_order_created',
    'canteen_order_placed',
    'canteen_order_updated',
    'canteen_order_cancelled',
    'canteen_menu_updated',
    'canteen_wallet_updated',
    'canteen_user_status_changed',
    'canteen_time_gate_updated',
    'canteen_qr_token_updated',
  ];

  if (typeof window !== 'undefined') {
    EVENT_NAMES.forEach((evt) => window.addEventListener(evt, localHandler));
  }

  if (broadcastSyncChannel) {
    broadcastSyncChannel.addEventListener('message', broadcastHandler);
  }

  const cleanupLocal = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (typeof window !== 'undefined') {
      EVENT_NAMES.forEach((evt) => window.removeEventListener(evt, localHandler));
    }
    if (broadcastSyncChannel) {
      broadcastSyncChannel.removeEventListener('message', broadcastHandler);
    }
  };

  if (!isSupabaseConfigured || !supabase) {
    return cleanupLocal;
  }

  try {
    // Đảm bảo token auth đã được gán vào Supabase Realtime client nếu có session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && supabase?.realtime) {
        supabase.realtime.setAuth(session.access_token).catch(() => {});
      }
    }).catch(() => {});

    const channelName = `canteen-realtime-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_exception_tokens' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, (p) => triggerDebounced(p))
      .on('broadcast', { event: 'canteen_sync' }, (p) => triggerDebounced(p?.payload || p))
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.info('[@canteen/shared] Supabase Realtime subscribed successfully:', channelName);
        } else if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[@canteen/shared] Supabase Realtime channel status:', status, err);
        }
      });

    return () => {
      cleanupLocal();
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  } catch (err) {
    console.warn('[@canteen/shared] subscribeRealtime error:', err);
    return cleanupLocal;
  }
}

// ============================================================
// MAPPERS
// ============================================================

function mapUser(row: any): UserProfile {
  const isDisabled = Boolean(
    row.is_disabled ||
    row.isDisabled ||
    (row.is_active === false && Number(row.wallet_balance ?? 0) > 0)
  );
  const isActive = row.is_active !== undefined ? Boolean(row.is_active) : !isDisabled;

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
    isActive,
    isDisabled,
    disabledAt: row.disabled_at,
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

export function getOrderDisplayItems(
  order: Partial<Order> & { note?: string },
  menuList: MenuItem[] = []
): { menuItemId: string; name: string; quantity: number; price: number; imageUrl: string; category?: string }[] {
  let items: { menuItemId: string; name: string; quantity: number; price: number; imageUrl: string; category?: string }[] = [];
  const fullMenu = (menuList && menuList.length > 0) ? menuList : getCachedMenu();

  if (Array.isArray(order.items) && order.items.length > 0) {
    items = order.items.map((it) => {
      let name = it.name;
      const foundInMenu = fullMenu.find((m) => m.id === it.menuItemId || (it.name && m.name === it.name));
      if (!name || name === 'Suất ăn Căn tin') {
        if (foundInMenu) name = foundInMenu.name;
      }
      return {
        menuItemId: it.menuItemId || foundInMenu?.id || '',
        name: name || 'Suất ăn Căn tin',
        quantity: it.quantity || 1,
        price: it.price || foundInMenu?.price || 35000,
        imageUrl: it.imageUrl || foundInMenu?.imageUrl || '',
        category: foundInMenu?.category || '',
      };
    });
  }

  const allGeneric = items.length === 0 || items.every((it) => !it.name || it.name === 'Suất ăn Căn tin');
  if (allGeneric && (order as any).note) {
    const fromNote = parseItemsFromNote((order as any).note);
    if (fromNote.length > 0) {
      items = fromNote.map((it) => {
        let name = it.name;
        const foundInMenu = fullMenu.find((m) => m.name === it.name || m.id === it.menuItemId);
        if (!name || name === 'Suất ăn Căn tin') {
          if (foundInMenu) name = foundInMenu.name;
        }
        return {
          menuItemId: it.menuItemId || foundInMenu?.id || '',
          name: name || 'Suất ăn Căn tin',
          quantity: it.quantity || 1,
          price: it.price || foundInMenu?.price || 35000,
          imageUrl: it.imageUrl || foundInMenu?.imageUrl || '',
          category: foundInMenu?.category || '',
        };
      });
    }
  }

  // Nếu vẫn là generic, tra cứu theo ID trong cache
  if (items.length === 0 || items.every((it) => !it.name || it.name === 'Suất ăn Căn tin')) {
    if (order.id || order.orderCode) {
      const cached = getCachedOrders();
      const matched = cached.find((c) => c.id === order.id || c.orderCode === order.orderCode);
      if (matched && matched.items && matched.items.length > 0 && matched.items.some((it) => it.name && it.name !== 'Suất ăn Căn tin')) {
        items = matched.items.map((it) => {
          const foundInMenu = fullMenu.find((m) => m.id === it.menuItemId || (it.name && m.name === it.name));
          return {
            menuItemId: it.menuItemId || foundInMenu?.id || '',
            name: it.name || foundInMenu?.name || 'Suất ăn Căn tin',
            quantity: it.quantity || 1,
            price: it.price || foundInMenu?.price || 35000,
            imageUrl: it.imageUrl || foundInMenu?.imageUrl || '',
            category: foundInMenu?.category || '',
          };
        });
      }
    }
  }

  if (items.length === 0) {
    items = [{ menuItemId: '', name: 'Suất ăn Căn tin', quantity: 1, price: order.totalAmount || 35000, imageUrl: '', category: 'Cơm trưa' }];
  }

  return items;
}

/**
 * Phân tích tên món Combo dạng "<Tên combo> ( <Món A> + <Món B> )"
 * Trả về mainName và mảng các món thành phần parts
 */
export function parseComboItem(name: string): { mainName: string; parts: string[] } | null {
  if (!name || typeof name !== 'string') return null;
  // Match standard pattern: <Tên combo> ( <Món A> + <Món B> )
  const match = name.match(/^(.*?)\s*[\(（]([^)）]+?\+[^)）]+?)[\)）]/);
  if (match) {
    const mainName = match[1].trim();
    const parts = match[2].split('+').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { mainName: mainName || name.trim(), parts };
    }
  }

  // Fallback pattern nếu không dùng ngoặc: "Combo ... : Món A + Món B"
  if (name.toLowerCase().includes('combo') && name.includes('+')) {
    const colonIdx = name.indexOf(':');
    if (colonIdx !== -1) {
      const mainName = name.substring(0, colonIdx).trim();
      const parts = name.substring(colonIdx + 1).split('+').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return { mainName: mainName || name.trim(), parts };
      }
    }
  }

  return null;
}

/**
 * Nhận diện món ăn thuộc nhóm đồ uống / tráng miệng hay món cơm / thức ăn chính
 */
export function isDrinkItem(name: string, category?: string, menuList: MenuItem[] = []): boolean {
  if (!name) return false;
  const fullMenu = (menuList && menuList.length > 0) ? menuList : getCachedMenu();

  // 1. Phân loại theo category truyền vào nếu có
  if (category) {
    const catLower = category.toLowerCase().trim();
    if (
      catLower.includes('đồ uống') ||
      catLower.includes('tráng miệng') ||
      catLower.includes('nước') ||
      catLower.includes('drink') ||
      catLower.includes('beverage')
    ) {
      return true;
    }
    if (
      catLower.includes('cơm') ||
      catLower.includes('bún') ||
      catLower.includes('phở') ||
      catLower.includes('chay') ||
      catLower.includes('thức ăn') ||
      catLower.includes('món ăn')
    ) {
      return false;
    }
  }

  // 2. Tra cứu trong menu hệ thống theo tên món
  const nameNorm = name.toLowerCase().trim();
  const matched = fullMenu.find((m) => m.name.toLowerCase().trim() === nameNorm);
  if (matched && matched.category) {
    const catLower = matched.category.toLowerCase().trim();
    if (
      catLower.includes('đồ uống') ||
      catLower.includes('tráng miệng') ||
      catLower.includes('nước') ||
      catLower.includes('drink') ||
      catLower.includes('beverage')
    ) {
      return true;
    }
    if (
      catLower.includes('cơm') ||
      catLower.includes('bún') ||
      catLower.includes('phở') ||
      catLower.includes('chay')
    ) {
      return false;
    }
  }

  // 3. Quy tắc ưu tiên món ăn chính (chống nhầm lẫn món ăn như "Gà hấp lá chanh", "Cá sốt chua ngọt")
  const foodKeywords = [
    'cơm', 'com', 'bún', 'bun', 'phở', 'pho', 'mì', 'mi', 'hủ tiếu', 'hu tieu',
    'bánh canh', 'cháo', 'chao', 'xôi', 'xoi', 'nui', 'súp', 'canh', 'lẩu',
    'bánh mì', 'gà', 'ga', 'heo', 'bò', 'bo', 'cá', 'tôm', 'mực', 'sườn', 'suon', 'chả'
  ];
  if (foodKeywords.some((kw) => nameNorm.startsWith(kw + ' ') || nameNorm.includes(' ' + kw + ' ') || nameNorm.includes(kw))) {
    const strongDrinkPrefix = ['trà', 'tra', 'cà phê', 'ca phe', 'cafe', 'coffee', 'nước', 'nuoc', 'sinh tố', 'chè', 'soda'];
    if (!strongDrinkPrefix.some((dp) => nameNorm.startsWith(dp))) {
      return false;
    }
  }

  // 4. Fallback bằng từ khóa đồ uống / tráng miệng phổ biến
  const drinkKeywords = [
    'trà', 'tra', 'nước', 'nuoc', 'sữa', 'sua', 'cà phê', 'ca phe', 'cafe', 'coffee',
    'sinh tố', 'sinh to', 'nước ép', 'nuoc ep', 'chè', 'che', 'đá me', 'da me',
    'soda', 'matcha', 'pepsi', 'coca', 'cocacola', 'sting',
    'revive', 'aquafina', 'dasani', 'nước sâm', 'nuoc sam', 'mủ trôm', 'mu trom',
    'nha đam', 'nha dam', 'yaourt', 'sữa chua', 'sua chua', 'trà chanh', 'trà tắc', 'trà đào',
    'me đá', 'bò húc', 'redbull', 'nước suối', 'c2', 'trà ô long', 'oolong', 'nước mía', 'nước ngọt',
    'nước sấu', 'nước khoáng'
  ];

  return drinkKeywords.some((kw) => nameNorm.includes(kw));
}

export type TicketType = 'total' | 'food' | 'drink';

export interface TicketItem {
  menuItemId?: string;
  name: string;
  quantity: number;
  price?: number;
  isFromCombo?: boolean;
}

export interface OrderTicket {
  id: string;
  ticketType: TicketType;
  title: string;
  subtitle: string;
  items: TicketItem[];
  order: Order;
  totalQuantity: number;
  totalAmount?: number;
}

/**
 * Tách một đơn hàng thành các phiếu in nhiệt chuyên dụng:
 * 1. Bill Tổng: luôn luôn được tạo (hiển thị đầy đủ tất cả món, giá tiền, tổng cộng).
 * 2. Bill Món Cơm: chỉ tạo khi có ít nhất 1 món ăn chính / cơm (hoặc tách từ combo). Không có giá.
 * 3. Bill Món Nước: chỉ tạo khi có ít nhất 1 món đồ uống / tráng miệng (hoặc tách từ combo). Không có giá.
 */
export function getOrderTickets(order: Order, menuList: MenuItem[] = []): OrderTicket[] {
  const displayItems = getOrderDisplayItems(order, menuList);
  const orderId = order.id || order.orderCode || 'ord';

  // 1. Bill Tổng (luôn luôn có)
  const totalTicket: OrderTicket = {
    id: `${orderId}-total`,
    ticketType: 'total',
    title: 'CƠM NGON SIBA',
    subtitle: 'ĂN SẠCH – SỐNG KHỎE · PHIẾU BẾP & XUẤT SUẤT ĂN',
    items: displayItems.map((it) => ({
      menuItemId: it.menuItemId,
      name: it.name,
      quantity: it.quantity || 1,
      price: it.price,
      isFromCombo: false,
    })),
    order,
    totalQuantity: displayItems.reduce((acc, it) => acc + (it.quantity || 1), 0),
    totalAmount: order.totalAmount,
  };

  // 2. Phân tách danh sách món ăn cho Bếp Cơm và Bếp Nước
  const foodItems: TicketItem[] = [];
  const drinkItems: TicketItem[] = [];

  for (const it of displayItems) {
    const combo = parseComboItem(it.name);
    if (combo) {
      // Món combo: tách các thành phần con trong ngoặc
      for (const part of combo.parts) {
        // Tách số lượng nếu phần tử con có dạng: "2x Trà đào" hoặc "2 Trà đào"
        let partQty = it.quantity || 1;
        let partCleanName = part.trim();
        const partMatch = partCleanName.match(/^(\d+)\s*[xX*]?\s*(.+)$/);
        if (partMatch) {
          const mult = parseInt(partMatch[1], 10);
          if (!isNaN(mult) && mult > 0) {
            partQty *= mult;
            partCleanName = partMatch[2].trim();
          }
        }

        const isDrink = isDrinkItem(partCleanName, undefined, menuList);
        if (isDrink) {
          drinkItems.push({
            name: partCleanName,
            quantity: partQty,
            isFromCombo: true,
          });
        } else {
          foodItems.push({
            name: partCleanName,
            quantity: partQty,
            isFromCombo: true,
          });
        }
      }
    } else {
      // Món đơn thông thường
      const isDrink = isDrinkItem(it.name, it.category, menuList);
      if (isDrink) {
        drinkItems.push({
          menuItemId: it.menuItemId,
          name: it.name,
          quantity: it.quantity || 1,
          price: it.price,
          isFromCombo: false,
        });
      } else {
        foodItems.push({
          menuItemId: it.menuItemId,
          name: it.name,
          quantity: it.quantity || 1,
          price: it.price,
          isFromCombo: false,
        });
      }
    }
  }

  // Gộp các món trùng tên và cùng thuộc tính combo để phiếu in gọn gàng
  const aggregateItems = (items: TicketItem[]): TicketItem[] => {
    const map = new Map<string, TicketItem>();
    for (const it of items) {
      const key = `${it.name.trim().toLowerCase()}__${it.isFromCombo ? '1' : '0'}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += it.quantity;
      } else {
        map.set(key, { ...it });
      }
    }
    return Array.from(map.values());
  };

  const finalFoodItems = aggregateItems(foodItems);
  const finalDrinkItems = aggregateItems(drinkItems);

  const tickets: OrderTicket[] = [totalTicket];

  // 3. Bill Món Cơm (chỉ thêm nếu có món ăn chính)
  if (finalFoodItems.length > 0) {
    tickets.push({
      id: `${orderId}-food`,
      ticketType: 'food',
      title: 'CƠM NGON SIBA',
      subtitle: 'PHIẾU BẾP – MÓN CƠM',
      items: finalFoodItems,
      order,
      totalQuantity: finalFoodItems.reduce((acc, it) => acc + it.quantity, 0),
    });
  }

  // 4. Bill Món Nước (chỉ thêm nếu có món đồ uống / tráng miệng)
  if (finalDrinkItems.length > 0) {
    tickets.push({
      id: `${orderId}-drink`,
      ticketType: 'drink',
      title: 'CƠM NGON SIBA',
      subtitle: 'PHIẾU BẾP – MÓN NƯỚC',
      items: finalDrinkItems,
      order,
      totalQuantity: finalDrinkItems.reduce((acc, it) => acc + it.quantity, 0),
    });
  }

  return tickets;
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

  // Trích xuất ghi chú của khách hàng (từ DB hoặc cache nếu cột trên DB chưa có)
  const rawNote = row.note || row.notes || row.customer_note || '';
  let finalNote = rawNote;
  if (!finalNote && (row.id || row.order_code)) {
    const cached = getCachedOrders();
    const matched = cached.find((c) => c.id === row.id || c.orderCode === row.order_code);
    if (matched?.note) {
      finalNote = matched.note;
    }
  }

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
    note: finalNote,
    notes: finalNote,
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
    const m = String(row.note).match(/\[Số lượng:\s*(\d+)\s*(suất|lượt)\]/i);
    if (m) qty = parseInt(m[1], 10);
  }

  let usedCount = Number(row.used_count || row.usedCount || 0);
  if (usedCount === 0 && row.note) {
    const mUsed = String(row.note).match(/\[Đã dùng:\s*(\d+)\/\d+\s*lượt\]/i);
    if (mUsed) usedCount = parseInt(mUsed[1], 10);
  }

  const isDisabled = Boolean(
    row.is_disabled ||
    (row.isDisabled !== undefined ? row.isDisabled : false)
  );
  const isUsed = Boolean(row.is_used || (usedCount >= qty && qty > 0));

  return {
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name || '',
    isUsed,
    isDisabled,
    usedBy: row.used_by,
    usedAt: row.used_at,
    note: row.note,
    quantity: qty,
    usedCount,
  };
}
