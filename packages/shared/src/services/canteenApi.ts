import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type {
  UserProfile,
  UserRole,
  MenuItem,
  Order,
  OrderStatus,
  QRExceptionToken,
  DeliveryMethod,
  TimeGateStatus,
  AutoPrintConfig,
  PrinterConfig,
  WalletTransaction,
  Site,
  SiteCode,
  PaymentMethod,
  PaymentStatus,
} from '../types';
import { detectCurrentDevice } from '../utils/deviceDetector';
import { getTodayStr, getTomorrowStr, formatVnd } from '../utils/date';

/**
 * Hạn mức nạp ví mặc định hàng tháng cho cán bộ / giáo viên (1.040.000đ)
 */
export const MONTHLY_WALLET_ALLOWANCE = 1040000;

// ============================================================
// SITES (HÙNG VƯƠNG & G-GROUP)
// ============================================================

export const DEFAULT_SITES: Site[] = [
  {
    id: 'hung_vuong',
    code: 'hung_vuong',
    name: 'Đại học Hùng Vương',
    description: 'Cơ sở Đại học Hùng Vương — Dành cho Giáo viên, Cán bộ & Khách hàng lẻ',
    bankName: 'Vietcombank (Ngoại Thương)',
    bankAccountNo: '1022334455',
    bankAccountName: 'CANTEEN HUNG VUONG',
    bankQrImageUrl: 'https://img.vietqr.io/image/VCB-1022334455-compact2.png',
    bankAccountInfo: {
      bankName: 'Vietcombank (Ngân hàng TMCP Ngoại Thương)',
      accountNumber: '1022334455',
      accountHolder: 'CANTEEN HUNG VUONG',
      qrImageUrl: 'https://img.vietqr.io/image/VCB-1022334455-compact2.png',
      instructionNote: 'Vui lòng ghi đúng nội dung chuyển khoản kèm mã đơn hàng để hệ thống tự động nhận diện thanh toán.',
    },
    features: {
      qrException: true,
      staffTab: true,
      wallet: true,
      timeGate: true,
      guestOrder: true,
    },
  },
  {
    id: 'g_group',
    code: 'g_group',
    name: 'Canteen G-Group',
    description: 'Cơ sở Canteen G-Group — Phục vụ Cán bộ và Khách hàng lẻ',
    bankName: 'MB Bank (Quân Đội)',
    bankAccountNo: '999988886666',
    bankAccountName: 'CANTEEN G-GROUP',
    bankQrImageUrl: 'https://img.vietqr.io/image/MB-999988886666-compact2.png',
    bankAccountInfo: {
      bankName: 'MB Bank (Ngân hàng TMCP Quân Đội)',
      accountNumber: '999988886666',
      accountHolder: 'CANTEEN G-GROUP',
      qrImageUrl: 'https://img.vietqr.io/image/MB-999988886666-compact2.png',
      instructionNote: 'Vui lòng ghi đúng nội dung chuyển khoản kèm mã đơn hàng để hệ thống tự động nhận diện thanh toán.',
    },
    features: {
      qrException: false,
      staffTab: false,
      wallet: false,
      timeGate: false,
      guestOrder: true,
    },
  },
];

export const CURRENT_SITE_STORAGE_KEY = 'canteen_selected_site_code';
const SITES_CACHE_STORAGE_KEY = 'canteen_sites_list_cache';

export function getSelectedSiteCode(): SiteCode {
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSite = urlParams.get('site');
      if (urlSite === 'hung_vuong' || urlSite === 'g_group') {
        return urlSite as SiteCode;
      }
      const saved = localStorage.getItem(CURRENT_SITE_STORAGE_KEY);
      if (saved === 'hung_vuong' || saved === 'g_group') {
        return saved as SiteCode;
      }
    }
  } catch {}
  return 'hung_vuong';
}

export function setSelectedSiteCode(code: SiteCode): void {
  try {
    localStorage.setItem(CURRENT_SITE_STORAGE_KEY, code);
    broadcastSystemEvent('canteen_site_changed', { siteCode: code });
  } catch {}
}

export function getCachedSites(): Site[] {
  try {
    const raw = localStorage.getItem(SITES_CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...DEFAULT_SITES];
}

export function setCachedSites(sites: Site[]): void {
  try {
    if (Array.isArray(sites) && sites.length > 0) {
      localStorage.setItem(SITES_CACHE_STORAGE_KEY, JSON.stringify(sites));
    }
  } catch {}
}

export const isUuid = (val?: string): boolean =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val).trim());

export async function getSites(): Promise<Site[]> {
  if (!isSupabaseConfigured || !supabase) {
    return getCachedSites();
  }

  try {
    const { data, error } = await withQueryTimeout(
      supabase.from('sites').select('*').order('code'),
      10000,
      'Timeout fetch sites'
    );

    let mappedSites: Site[] = [];
    if (!error && Array.isArray(data) && data.length > 0) {
      mappedSites = data.map((r: any) => {
        const defaultMatch = DEFAULT_SITES.find((s) => s.code === r.code) || DEFAULT_SITES[0];
        const mergedFeatures = {
          ...defaultMatch.features,
          ...(r.features && typeof r.features === 'object' ? r.features : {}),
        };
        // Cơ sở G-Group quy chuẩn tắt tab Cán bộ và Mã QR Ngoại lệ
        if (r.code === 'g_group' || defaultMatch.code === 'g_group') {
          mergedFeatures.staffTab = false;
          mergedFeatures.qrException = false;
          mergedFeatures.guestOrder = true;
        }
        return {
          id: r.id || r.code,
          code: (r.code as SiteCode) || defaultMatch.code,
          name: r.name || defaultMatch.name,
          description: r.description || defaultMatch.description,
          bankName: r.bank_name || defaultMatch.bankName,
          bankAccountNo: r.bank_account_no || defaultMatch.bankAccountNo,
          bankAccountName: r.bank_account_name || defaultMatch.bankAccountName,
          bankQrImageUrl: r.bank_qr_image_url || defaultMatch.bankQrImageUrl,
          bankAccountInfo: r.bank_account_info || defaultMatch.bankAccountInfo,
          features: mergedFeatures,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });

      for (const def of DEFAULT_SITES) {
        if (!mappedSites.some((s) => s.code === def.code)) {
          mappedSites.push({ ...def });
        }
      }
    } else {
      mappedSites = DEFAULT_SITES.map((s) => ({ ...s }));
    }

    // Luôn đọc cấu hình ngân hàng & QR từ system_settings phòng khi bảng sites chưa migrate các cột ngân hàng
    try {
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('key, value')
        .like('key', 'canteen_site_settings_%');
      if (Array.isArray(settingsData) && settingsData.length > 0) {
        settingsData.forEach((row: any) => {
          const sCode = row.key.replace('canteen_site_settings_', '');
          const val = row.value;
          if (val && typeof val === 'object') {
            const match = mappedSites.find((s) => s.code === sCode);
            if (match) {
              if (val.name) match.name = val.name;
              if (val.description) match.description = val.description;
              if (val.bankName) match.bankName = val.bankName;
              if (val.bankAccountNo) match.bankAccountNo = val.bankAccountNo;
              if (val.bankAccountName) match.bankAccountName = val.bankAccountName;
              if (val.bankQrImageUrl !== undefined) match.bankQrImageUrl = val.bankQrImageUrl;
              if (val.bankAccountInfo) {
                match.bankAccountInfo = {
                  ...match.bankAccountInfo,
                  ...val.bankAccountInfo,
                };
              }
              if (val.features) match.features = { ...match.features, ...val.features };
            }
          }
        });
      }
    } catch (e) {
      console.warn('[getSites system_settings note]:', e);
    }

    setCachedSites(mappedSites);
    return mappedSites;
  } catch (e) {
    console.warn('[getSites note]:', e);
  }

  return getCachedSites();
}

export async function updateSite(
  siteCode: string,
  updates: Partial<Site>
): Promise<Site> {
  const currentSites = getCachedSites();
  const matched = currentSites.find((s) => s.code === siteCode) || DEFAULT_SITES.find((s) => s.code === siteCode) || DEFAULT_SITES[1];
  const merged: Site = {
    ...matched,
    ...updates,
    bankAccountInfo: {
      ...matched.bankAccountInfo,
      ...(updates.bankAccountInfo || {}),
    },
    features: {
      ...matched.features,
      ...(updates.features || {}),
    },
  };

  if (isSupabaseConfigured && supabase) {
    // 1. Thử lưu vào bảng sites
    try {
      const payload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.bankName !== undefined) payload.bank_name = updates.bankName;
      if (updates.bankAccountNo !== undefined) payload.bank_account_no = updates.bankAccountNo;
      if (updates.bankAccountName !== undefined) payload.bank_account_name = updates.bankAccountName;
      if (updates.bankQrImageUrl !== undefined) payload.bank_qr_image_url = updates.bankQrImageUrl;
      if (updates.bankAccountInfo !== undefined) payload.bank_account_info = updates.bankAccountInfo;
      if (updates.features !== undefined) payload.features = updates.features;

      const { error: updErr } = await supabase
        .from('sites')
        .update(payload)
        .or(`code.eq.${siteCode},id.eq.${siteCode}`);
      if (updErr) {
        console.warn('[updateSite sites update note]:', updErr);
        // Fallback update features nếu bảng sites thiếu cột bank_*
        await supabase
          .from('sites')
          .update({ features: merged.features, updated_at: new Date().toISOString() })
          .or(`code.eq.${siteCode},id.eq.${siteCode}`);
      }
    } catch (e) {
      console.warn('[updateSite Supabase sites note]:', e);
    }

    // 2. Luôn đồng bộ vào system_settings để đảm bảo 100% không bao giờ mất thông tin QR & Ngân hàng
    try {
      await supabase.from('system_settings').upsert({
        key: `canteen_site_settings_${siteCode}`,
        value: merged,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[updateSite Supabase system_settings note]:', e);
    }
  }

  const updatedList = currentSites.map((s) => (s.code === siteCode ? merged : s));
  setCachedSites(updatedList);
  broadcastSystemEvent('canteen_site_updated', { siteCode, site: merged });
  return merged;
}

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

// Chủ động đăng ký kênh Supabase Realtime ngay khi module khởi tạo để WebSocket sẵn sàng phát tín hiệu tức thì
if (supabaseGlobalSyncChannel) {
  try {
    supabaseGlobalSyncChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info('[@canteen/shared] Global sync channel connected.');
      }
    });
  } catch {}
}

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
  role: string = 'teacher',
  phoneNumber?: string
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
        phone_number: phoneNumber?.trim() || '',
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
        phone_number: phoneNumber?.trim() || '',
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

      const isSuperAdmin =
        user.user_metadata?.role === 'super_admin' ||
        user.email?.includes('superadmin') ||
        user.email === 'trantuandai2508@gmail.com';

      const role: UserRole =
        user.user_metadata?.role ||
        (isSuperAdmin
          ? 'super_admin'
          : user.email?.includes('admin')
          ? 'admin'
          : user.email?.includes('bep')
          ? 'data_entry'
          : user.email?.includes('hieutruong')
          ? 'executive'
          : 'teacher');

      const roleTitle =
        role === 'super_admin'
          ? 'Quản trị Cấp cao'
          : role === 'admin'
          ? 'Quản lý Căn tin'
          : role === 'data_entry'
          ? 'Nhân viên Bếp'
          : role === 'executive'
          ? 'Ban Giám hiệu'
          : 'Giáo viên';

      const isActive = isStaff ? true : false;
      const initialWallet = isStaff ? 2000000 : 0;
      const assignedSiteId =
        role === 'super_admin'
          ? (user.user_metadata?.site_id || null)
          : (user.user_metadata?.site_id || 'hung_vuong');

      const newRow = {
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Cán bộ Căn tin',
        role,
        role_title: roleTitle,
        email: user.email || '',
        auth_user_id: user.id,
        wallet_balance: initialWallet,
        monthly_allowance: initialWallet,
        is_active: isActive,
        site_id: assignedSiteId,
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
          siteId: assignedSiteId || undefined,
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

export async function getUsers(siteId?: string): Promise<UserProfile[]> {
  checkSupabase();
  try {
    let query = supabase.from('users').select('*').order('name');
    if (siteId) {
      if (siteId === 'hung_vuong') {
        query = query.or('site_id.eq.hung_vuong,site_id.is.null');
      } else {
        query = query.eq('site_id', siteId);
      }
    }

    const { data, error } = await withQueryTimeout(
      query,
      12000,
      'Timeout fetch users'
    );
    if (!error && data) {
      let list = data.map(mapUser);
      if (siteId) {
        list = list.filter((u) => (siteId === 'hung_vuong' ? !u.siteId || u.siteId === 'hung_vuong' : u.siteId === siteId));
      }
      setCachedUsers(list);
      return list;
    }
    if (error) {
      // Fallback nếu câu query or() chứa site_id lỗi do DB chưa có cột site_id
      const { data: fbData } = await supabase.from('users').select('*').order('name');
      if (fbData) {
        let list = fbData.map(mapUser);
        if (siteId) {
          list = list.filter((u) => (siteId === 'hung_vuong' ? !u.siteId || u.siteId === 'hung_vuong' : u.siteId === siteId));
        }
        setCachedUsers(list);
        return list;
      }
      console.warn('[getUsers notice]:', error.message);
    }
    const cached = getCachedUsers();
    if (siteId) {
      return cached.filter((u) => (siteId === 'hung_vuong' ? !u.siteId || u.siteId === 'hung_vuong' : u.siteId === siteId));
    }
    return cached;
  } catch (err) {
    console.warn('[getUsers error]:', err);
    const cached = getCachedUsers();
    if (siteId) {
      return cached.filter((u) => (siteId === 'hung_vuong' ? !u.siteId || u.siteId === 'hung_vuong' : u.siteId === siteId));
    }
    return cached;
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
    siteId?: string;
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
    params.role === 'super_admin'
      ? 'Quản trị Cấp cao'
      : params.role === 'admin'
      ? 'Quản lý Căn tin'
      : params.role === 'data_entry'
      ? 'Nhân viên Bếp'
      : params.role === 'executive'
      ? 'Ban Giám hiệu'
      : 'Giáo viên';

  // Nếu actor là super_admin: cho phép chọn site_id (hoặc null nếu tạo super_admin khác).
  // Nếu actor là admin thường / nhân viên: BẮT BUỘC gán site_id = site của actor
  const assignedSiteId =
    actor.role === 'super_admin'
      ? (params.role === 'super_admin' ? (params.siteId || null) : (params.siteId || 'hung_vuong'))
      : (actor.siteId || 'hung_vuong');

  const newRow: Record<string, any> = {
    id: authUserId && isValidUuid(authUserId) ? authUserId : userUuid,
    auth_user_id: authUserId && isValidUuid(authUserId) ? authUserId : null,
    name: params.name.trim(),
    email: cleanEmail,
    role: params.role,
    role_title: roleTitle,
    department: params.department || 'Bộ phận nhà trường',
    phone_number: params.phoneNumber || '',
    default_room: params.defaultRoom || '',
    wallet_balance: params.walletBalance ?? MONTHLY_WALLET_ALLOWANCE,
    monthly_allowance: params.monthlyAllowance ?? MONTHLY_WALLET_ALLOWANCE,
    is_active: true,
    site_id: assignedSiteId,
  };

  let { data, error } = await supabase.from('users').upsert(newRow).select().single();
  if (error && error.message?.includes('site_id')) {
    delete newRow.site_id;
    const retry = await supabase.from('users').upsert(newRow).select().single();
    data = retry.data;
    error = retry.error;
  }
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

/**
 * Lấy lịch sử biến động số dư ví (wallet_transactions)
 */
export async function fetchWalletTransactions(userId?: string): Promise<WalletTransaction[]> {
  try {
    if (isSupabaseConfigured && supabase) {
      let query = supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map((t: any) => ({
          id: t.id,
          userId: t.user_id,
          amount: Number(t.amount || 0),
          type: t.type || 'order',
          referenceId: t.reference_id,
          balanceAfter: t.balance_after !== null && t.balance_after !== undefined ? Number(t.balance_after) : undefined,
          note: t.note || '',
          createdBy: t.created_by,
          createdAt: t.created_at || new Date().toISOString(),
        }));
      }
    }
  } catch (err) {
    console.warn('[fetchWalletTransactions error]:', err);
  }
  return [];
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
  // --- Cơ sở Đại học Hùng Vương ---
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
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
    siteId: 'hung_vuong',
    availableSiteIds: ['hung_vuong'],
  },
  // --- Cơ sở Canteen G-Group ---
  {
    id: 'b2222222-2222-4222-8222-222222222201',
    name: 'Cơm sườn cốt lết nướng mật ong (G-Group)',
    category: 'Cơm trưa',
    description: 'Sườn nướng mật ong vàng ruộm, trứng ốp la, dưa leo tươi mát và canh súp rau củ',
    price: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80',
    preparedStock: 50,
    currentStock: 50,
    isActive: true,
    forDate: '',
    siteId: 'g_group',
    availableSiteIds: ['g_group'],
  },
  {
    id: 'b2222222-2222-4222-8222-222222222202',
    name: 'Cơm gà xối mỡ da giòn (G-Group)',
    category: 'Cơm trưa',
    description: 'Đùi gà góc tư chiên giòn, cơm rang tỏi thơm dẻo, kèm sốt chua ngọt và salad',
    price: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=80',
    preparedStock: 45,
    currentStock: 45,
    isActive: true,
    forDate: '',
    siteId: 'g_group',
    availableSiteIds: ['g_group'],
  },
  {
    id: 'b2222222-2222-4222-8222-222222222203',
    name: 'Phở bò tái nạm đặc biệt (G-Group)',
    category: 'Bún / Phở',
    description: 'Bánh phở tươi, thịt bò tái nạm mềm thơm ngậy, nước hầm xương ống 12 tiếng cùng quẩy giòn',
    price: 40000,
    imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&auto=format&fit=crop&q=80',
    preparedStock: 40,
    currentStock: 40,
    isActive: true,
    forDate: '',
    siteId: 'g_group',
    availableSiteIds: ['g_group'],
  },
  {
    id: 'b2222222-2222-4222-8222-222222222204',
    name: 'Bún bò giò heo xứ Huế (G-Group)',
    category: 'Bún / Phở',
    description: 'Bún sợi to đặc trưng, khoanh giò nạc, chả cua Huế và nước dùng cay nồng hương sả',
    price: 40000,
    imageUrl: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500&auto=format&fit=crop&q=80',
    preparedStock: 35,
    currentStock: 35,
    isActive: true,
    forDate: '',
    siteId: 'g_group',
    availableSiteIds: ['g_group'],
  },
  {
    id: 'b2222222-2222-4222-8222-222222222205',
    name: 'Cơm nấm đùi gà xào hạt sen (Chay) (G-Group)',
    category: 'Món Chay',
    description: 'Nấm tươi xào sốt tiêu đen, hạt sen bùi béo, đậu hũ non chiên giòn và canh rong biển',
    price: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80',
    preparedStock: 30,
    currentStock: 30,
    isActive: true,
    forDate: '',
    siteId: 'g_group',
    availableSiteIds: ['g_group'],
  },
  {
    id: 'b2222222-2222-4222-8222-222222222206',
    name: 'Trà đào cam sả hạt chia (G-Group)',
    category: 'Đồ uống / Tráng miệng',
    description: 'Trà thảo mộc ướp sả thanh mát, miếng đào giòn ngâm thơm ngon và hạt chia giàu dinh dưỡng',
    price: 15000,
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80',
    preparedStock: 50,
    currentStock: 50,
    isActive: true,
    forDate: '',
    siteId: 'g_group',
    availableSiteIds: ['g_group'],
  },
  {
    id: 'b2222222-2222-4222-8222-222222222207',
    name: 'Sữa chua dẻo ngũ cốc trái cây (G-Group)',
    category: 'Đồ uống / Tráng miệng',
    description: 'Sữa chua tự nhiên nhà làm thơm mát, kiwi dâu tây tươi mọng cùng ngũ cốc giòn tan',
    price: 18000,
    imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=500&auto=format&fit=crop&q=80',
    preparedStock: 40,
    currentStock: 40,
    isActive: true,
    forDate: '',
    siteId: 'g_group',
    availableSiteIds: ['g_group'],
  },
];

const MENU_STORAGE_KEY = 'canteen_menu_cache_v2';

export function getCachedMenu(siteId?: string): MenuItem[] {
  try {
    const raw = localStorage.getItem(MENU_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (siteId) {
          return parsed.filter((m: MenuItem) => {
            if (m.siteId) return m.siteId === siteId;
            if (m.availableSiteIds && m.availableSiteIds.length > 0) return m.availableSiteIds.includes(siteId);
            return siteId === 'hung_vuong';
          });
        }
        return parsed;
      }
    }
  } catch {}
  if (siteId) {
    return DEFAULT_MENU_ITEMS.filter((m) => {
      if (m.siteId) return m.siteId === siteId;
      if (m.availableSiteIds && m.availableSiteIds.length > 0) return m.availableSiteIds.includes(siteId);
      return siteId === 'hung_vuong';
    });
  }
  return [...DEFAULT_MENU_ITEMS];
}

export function setCachedMenu(items: MenuItem[]) {
  try {
    if (Array.isArray(items)) {
      const raw = localStorage.getItem(MENU_STORAGE_KEY);
      let existing: MenuItem[] = [];
      if (raw) {
        try { existing = JSON.parse(raw); } catch {}
      }
      const map = new Map<string, MenuItem>();
      if (Array.isArray(existing)) {
        existing.forEach((it) => { if (it.id) map.set(it.id, it); });
      }
      items.forEach((it) => { if (it.id) map.set(it.id, it); });
      const merged = Array.from(map.values());
      localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(merged));
    }
  } catch {}
}

export async function getMenu(
  arg?: string | { siteId?: string; forDate?: string },
  secondaryForDate?: string
): Promise<MenuItem[]> {
  checkSupabase();
  const siteId =
    typeof arg === 'object'
      ? arg.siteId
      : typeof arg === 'string' && (arg === 'hung_vuong' || arg === 'g_group')
      ? arg
      : undefined;
  const forDate =
    typeof arg === 'object'
      ? arg.forDate
      : typeof arg === 'string' && arg !== 'hung_vuong' && arg !== 'g_group'
      ? arg
      : secondaryForDate;

  try {
    let query = supabase
      .from('menu_items')
      .select('*')
      .eq('is_active', true);

    if (forDate) {
      query = query.or(`for_date.eq.${forDate},for_date.is.null,for_date.eq.''`);
    }

    if (siteId) {
      if (siteId === 'hung_vuong') {
        query = query.or('site_id.eq.hung_vuong,site_id.is.null,available_site_ids.cs.{hung_vuong}');
      } else {
        query = query.or(`site_id.eq.${siteId},available_site_ids.cs.{${siteId}}`);
      }
    }

    const { data, error } = await withQueryTimeout(query, 15000, 'Supabase getMenu timeout');
    if (error) {
      console.warn('[Supabase getMenu query error]:', error.message);
      return getCachedMenu(siteId);
    }

    if (data && data.length > 0) {
      let mapped = data.map(mapMenuItem).sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
      setCachedMenu(mapped);
      if (siteId) {
        mapped = mapped.filter((m) => {
          if (m.siteId) return m.siteId === siteId;
          if (m.availableSiteIds && m.availableSiteIds.length > 0) return m.availableSiteIds.includes(siteId);
          return siteId === 'hung_vuong';
        });
      }
      return mapped;
    }
    return getCachedMenu(siteId);
  } catch (err: any) {
    console.warn('[getMenu fallback notice - timeout or network]:', err?.message || err);
    return getCachedMenu(siteId);
  }
}

export async function getAllMenuItems(
  arg?: string | { siteId?: string; forDate?: string },
  secondaryForDate?: string
): Promise<MenuItem[]> {
  checkSupabase();
  const siteId =
    typeof arg === 'object'
      ? arg.siteId
      : typeof arg === 'string' && (arg === 'hung_vuong' || arg === 'g_group')
      ? arg
      : undefined;
  const forDate =
    typeof arg === 'object'
      ? arg.forDate
      : typeof arg === 'string' && arg !== 'hung_vuong' && arg !== 'g_group'
      ? arg
      : secondaryForDate;

  try {
    let query = supabase
      .from('menu_items')
      .select('*');

    if (forDate) {
      query = query.or(`for_date.eq.${forDate},for_date.is.null,for_date.eq.''`);
    }

    if (siteId) {
      if (siteId === 'hung_vuong') {
        query = query.or('site_id.eq.hung_vuong,site_id.is.null,available_site_ids.cs.{hung_vuong}');
      } else {
        query = query.or(`site_id.eq.${siteId},available_site_ids.cs.{${siteId}}`);
      }
    }

    const { data, error } = await withQueryTimeout(query, 15000, 'Supabase getAllMenuItems timeout');
    if (error) {
      console.warn('[Supabase getAllMenuItems notice]:', error.message);
      return getCachedMenu(siteId);
    }

    if (data && data.length > 0) {
      let mapped = data.map(mapMenuItem).sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
      setCachedMenu(mapped);
      if (siteId) {
        mapped = mapped.filter((m) => {
          if (m.siteId) return m.siteId === siteId;
          if (m.availableSiteIds && m.availableSiteIds.length > 0) return m.availableSiteIds.includes(siteId);
          return siteId === 'hung_vuong';
        });
      }
      return mapped;
    }
    return getCachedMenu(siteId);
  } catch (err: any) {
    console.warn('[getAllMenuItems fallback notice]:', err?.message || err);
    return getCachedMenu(siteId);
  }
}

export async function createMenuItem(
  item: Omit<MenuItem, 'id'>,
  actor: UserProfile,
  siteCode?: string
): Promise<MenuItem> {
  checkSupabase();
  const targetSiteId =
    item.siteId ||
    siteCode ||
    (item.availableSiteIds && item.availableSiteIds.length === 1 ? item.availableSiteIds[0] : undefined) ||
    (actor.role === 'super_admin' ? getSelectedSiteCode() : (actor.siteId || 'hung_vuong'));

  const availableSiteIds = [targetSiteId];

  let data: any = null;
  let insertError: any = null;

  try {
    const res = await supabase
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
        site_id: targetSiteId,
        available_site_ids: availableSiteIds,
      })
      .select()
      .single();
    data = res.data;
    insertError = res.error;
  } catch (e) {
    insertError = e;
  }

  // Fallback nếu cột site_id hoặc available_site_ids chưa có trên database
  if (insertError || !data) {
    const res2 = await supabase
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
    if (res2.error) throw new Error(`Lỗi thêm món ăn: ${res2.error.message}`);
    data = res2.data;
    if (data) {
      data.site_id = targetSiteId;
      data.available_site_ids = availableSiteIds;
    }
  }

  const newItem = mapMenuItem(data);
  newItem.siteId = targetSiteId;
  newItem.availableSiteIds = availableSiteIds;
  const current = getCachedMenu();
  setCachedMenu([newItem, ...current.filter((c) => c.id !== newItem.id)]);
  broadcastSystemEvent('canteen_menu_updated');
  return newItem;
}

export async function bulkCreateMenuItems(
  items: Omit<MenuItem, 'id'>[],
  actor: UserProfile,
  siteId?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  checkSupabase();
  if (!items || items.length === 0) {
    return { success: false, count: 0, error: 'Danh sách món ăn tải lên trống.' };
  }

  const effectiveSite =
    siteId ||
    (actor.role === 'super_admin' ? getSelectedSiteCode() : (actor.siteId || 'hung_vuong'));

  const validRows = items
    .filter((it) => it.name && it.name.trim().length > 0)
    .map((it) => {
      const itemSite = it.siteId || effectiveSite;
      return {
        name: it.name.trim(),
        category: it.category?.trim() || 'Cơm trưa',
        description: it.description?.trim() || '',
        price: Number(it.price) > 0 ? Number(it.price) : 35000,
        image_url: it.imageUrl?.trim() || '',
        prepared_stock: Number(it.preparedStock) >= 0 ? Number(it.preparedStock) : 50,
        current_stock: Number(it.currentStock) >= 0 ? Number(it.currentStock) : (Number(it.preparedStock) || 50),
        is_active: it.isActive !== undefined ? it.isActive : true,
        for_date: it.forDate?.trim() || null,
        site_id: itemSite,
        available_site_ids: [itemSite],
      };
    });

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

export interface CopyMenuOptions {
  sourceSiteId: string;
  targetSiteId: string;
  itemIds?: string[];
  mode?: 'append' | 'replace';
  actor?: UserProfile;
  resetStockToPrepared?: boolean;
}

/**
 * Sao chép thực đơn món ăn từ cơ sở này sang cơ sở khác (hỗ trợ append hoặc replace)
 */
export async function copyMenuBetweenSites(
  options: CopyMenuOptions
): Promise<{ success: boolean; count: number; error?: string }> {
  checkSupabase();
  const { sourceSiteId, targetSiteId, itemIds, mode = 'append', resetStockToPrepared = true } = options;

  if (!sourceSiteId || !targetSiteId) {
    return { success: false, count: 0, error: 'Vui lòng chọn cơ sở nguồn và cơ sở đích.' };
  }
  if (sourceSiteId === targetSiteId) {
    return { success: false, count: 0, error: 'Cơ sở nguồn và cơ sở đích không được trùng nhau.' };
  }

  try {
    // 1. Lấy tất cả món ăn từ cơ sở nguồn
    let query = supabase.from('menu_items').select('*');
    if (sourceSiteId === 'hung_vuong') {
      query = query.or('site_id.eq.hung_vuong,site_id.is.null,available_site_ids.cs.{hung_vuong}');
    } else {
      query = query.or(`site_id.eq.${sourceSiteId},available_site_ids.cs.{${sourceSiteId}}`);
    }

    const { data: sourceData, error: srcErr } = await query;
    if (srcErr) {
      return { success: false, count: 0, error: `Lỗi khi tải thực đơn nguồn: ${srcErr.message}` };
    }

    let sourceItems = (sourceData || []).map(mapMenuItem);
    if (itemIds && itemIds.length > 0) {
      sourceItems = sourceItems.filter((it) => itemIds.includes(it.id));
    }

    if (sourceItems.length === 0) {
      return { success: false, count: 0, error: 'Không tìm thấy món ăn nào từ cơ sở nguồn để sao chép.' };
    }

    // 2. Nếu chế độ 'replace' (thay thế toàn bộ): xóa các món cũ của site đích
    if (mode === 'replace') {
      try {
        let delQuery = supabase.from('menu_items').delete();
        if (targetSiteId === 'hung_vuong') {
          delQuery = delQuery.or('site_id.eq.hung_vuong,site_id.is.null');
        } else {
          delQuery = delQuery.eq('site_id', targetSiteId);
        }
        await delQuery;
      } catch (delErr: any) {
        console.warn('[copyMenuBetweenSites delete old items notice]:', delErr);
      }
    }

    // 2.1 Nếu chế độ 'append': lấy danh sách món hiện có của site đích để tránh trùng lặp
    let existingTargetMap = new Map<string, string>();
    if (mode === 'append') {
      try {
        let targetQuery = supabase.from('menu_items').select('id, name');
        if (targetSiteId === 'hung_vuong') {
          targetQuery = targetQuery.or('site_id.eq.hung_vuong,site_id.is.null');
        } else {
          targetQuery = targetQuery.eq('site_id', targetSiteId);
        }
        const { data: tData } = await targetQuery;
        if (Array.isArray(tData)) {
          tData.forEach((it) => {
            if (it.name) existingTargetMap.set(it.name.trim().toLowerCase(), it.id);
          });
        }
      } catch (tErr) {
        console.warn('[copyMenuBetweenSites target query notice]:', tErr);
      }
    }

    // 3. Chuẩn bị danh sách món mới cho site đích
    let insertedRows: any[] = [];
    const itemsToInsert: any[] = [];

    for (const item of sourceItems) {
      const pStock = Number(item.preparedStock) >= 0 ? Number(item.preparedStock) : 50;
      const cStock = resetStockToPrepared
        ? pStock
        : Math.min(pStock, Number(item.currentStock) >= 0 ? Number(item.currentStock) : pStock);

      const payload = {
        name: item.name.trim(),
        category: item.category?.trim() || 'Cơm trưa',
        description: item.description?.trim() || '',
        price: Number(item.price) > 0 ? Number(item.price) : 35000,
        image_url: item.imageUrl?.trim() || '',
        prepared_stock: pStock,
        current_stock: cStock,
        is_active: item.isActive !== false,
        for_date: item.forDate || null,
        site_id: targetSiteId,
        available_site_ids: [targetSiteId],
      };

      const cleanLowerName = item.name.trim().toLowerCase();
      const existingId = existingTargetMap.get(cleanLowerName);

      if (mode === 'append' && existingId) {
        // Món đã có sẵn tại site đích: cập nhật lại thông tin mới nhất
        try {
          const { data: updatedData } = await supabase
            .from('menu_items')
            .update({
              ...payload,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingId)
            .select()
            .maybeSingle();
          if (updatedData) insertedRows.push(updatedData);
        } catch {}
      } else {
        itemsToInsert.push(payload);
      }
    }

    // 4. Chèn vào bảng menu_items theo batch cho các món mới chưa tồn tại
    const BATCH_SIZE = 50;
    for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
      const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
      const { data: insData, error: insErr } = await supabase
        .from('menu_items')
        .insert(batch)
        .select();

      if (!insErr && insData) {
        insertedRows.push(...insData);
      } else {
        // Fallback bỏ for_date nếu bảng không có cột
        const fallbackBatch = batch.map((r) => {
          const c: any = { ...r };
          delete c.for_date;
          return c;
        });
        const { data: insData2, error: insErr2 } = await supabase
          .from('menu_items')
          .insert(fallbackBatch)
          .select();
        if (!insData2 && insErr2) {
          throw new Error(insErr2?.message || insErr?.message || 'Không thể chèn món ăn mới');
        } else if (insData2) {
          insertedRows.push(...insData2);
        }
      }
    }

    // 5. Cập nhật cache cục bộ & broadcast sự kiện
    const newMappedItems = insertedRows.map(mapMenuItem);
    const existingCache = getCachedMenu();
    let updatedCache: MenuItem[];
    if (mode === 'replace') {
      updatedCache = [
        ...existingCache.filter((m) => m.siteId !== targetSiteId && (targetSiteId !== 'hung_vuong' || m.siteId)),
        ...newMappedItems,
      ];
    } else {
      updatedCache = [...newMappedItems, ...existingCache];
    }
    setCachedMenu(updatedCache);

    broadcastSystemEvent('canteen_menu_updated');

    return {
      success: true,
      count: insertedRows.length || itemsToInsert.length,
    };
  } catch (err: any) {
    console.error('[copyMenuBetweenSites error]:', err);
    return {
      success: false,
      count: 0,
      error: err?.message || 'Lỗi khi sao chép thực đơn giữa các cơ sở',
    };
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
  if (updates.siteId !== undefined) payload.site_id = updates.siteId;
  if (updates.availableSiteIds !== undefined) payload.available_site_ids = updates.availableSiteIds;

  let { error } = await supabase.from('menu_items').update(payload).eq('id', id);
  if (error && error.message?.includes('available_site_ids')) {
    delete payload.available_site_ids;
    const retry = await supabase.from('menu_items').update(payload).eq('id', id);
    error = retry.error;
  }
  if (error) throw new Error(`Lỗi cập nhật món ăn: ${error.message}`);

  const current = getCachedMenu();
  setCachedMenu(current.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  broadcastSystemEvent('canteen_menu_updated');
}

// ============================================================
// ORDERS
// ============================================================

export const GUEST_USER_ID = '00000000-0000-4000-8000-000000000001';

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
  // Multi-site & Guest:
  siteId?: string;
  isGuest?: boolean;
  guestName?: string;
  guestPhone?: string;
  paymentMethod?: PaymentMethod;
}): Promise<{
  success: boolean;
  order_id?: string;
  order_code?: string;
  total_amount?: number;
  new_balance?: number;
  payment_status?: PaymentStatus;
  error?: string;
}> {
  checkSupabase();
  const device = detectCurrentDevice();

  if (!params.items || params.items.length === 0) {
    return { success: false, error: 'Giỏ hàng trống. Vui lòng chọn ít nhất 1 món ăn.' };
  }

  // Kiểm tra mã QR ngoại lệ và giới hạn số lượt đặt nếu đặt ngoài giờ (Chỉ áp dụng cho tài khoản Cán bộ / Giáo viên)
  const cleanToken = params.exceptionToken?.trim();
  let matchedToken: QRExceptionToken | null = null;

  if (!params.isGuest && (params.isExceptionOrder || cleanToken)) {
    if (!cleanToken) {
      return { success: false, error: 'Vui lòng nhập mã QR ngoại lệ để đặt suất ăn ngoài khung giờ.' };
    }

    const cachedTokens = getCachedQRTokens();
    matchedToken = cachedTokens.find((t) => t.token.trim().toUpperCase() === cleanToken.trim().toUpperCase()) || null;

    if (!matchedToken && isSupabaseConfigured && supabase) {
      try {
        const upperToken = cleanToken.trim().toUpperCase();
        const { data: dbToken } = await supabase
          .from('qr_exception_tokens')
          .select('*')
          .or(`token.eq.${upperToken},token.eq.${cleanToken.trim()},token.ilike.${cleanToken.trim()}`)
          .maybeSingle();
        if (dbToken) {
          matchedToken = mapQRToken(dbToken);
        }
      } catch (tErr) {
        console.warn('QR token query note:', tErr);
      }

      // Nếu bảng qr_exception_tokens chưa có (hoặc bị chặn RLS), kiểm tra ngay trong kho lưu trữ system_settings của DB
      if (!matchedToken) {
        try {
          const sysTokens = await getQRTokensFromSystemSettings();
          matchedToken = sysTokens.find((t) => t.token.trim().toUpperCase() === cleanToken.trim().toUpperCase()) || null;
        } catch (sErr) {
          console.warn('QR token query system_settings fallback note:', sErr);
        }
      }
    }

    if (!matchedToken) {
      return {
        success: false,
        error: `Mã QR ngoại lệ "${cleanToken}" không tồn tại trên hệ thống. Vui lòng kiểm tra lại.`,
      };
    }

    // Đưa token hợp lệ vào cache ngay lập tức để đồng bộ đồng thời
    const currentCached = getCachedQRTokens();
    setCachedQRTokens([matchedToken, ...currentCached.filter((t) => t.token.toUpperCase() !== matchedToken!.token.toUpperCase())]);

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

  // 1. Xác thực người dùng hoặc gán bản ghi Guest
  let authUser: any = null;
  let userData: any = null;

  if (params.isGuest) {
    // Khách lẻ vãng lai: Sử dụng bản ghi guest chuyên dụng để đảm bảo Foreign Key DB
    try {
      // 1. Kiểm tra xem đã có user với ID GUEST_USER_ID hoặc email 'guest@canteen.local' trong DB chưa
      const { data: gUser } = await supabase
        .from('users')
        .select('*')
        .or(`id.eq.${GUEST_USER_ID},email.eq.guest@canteen.local`)
        .limit(1)
        .maybeSingle();

      if (gUser && gUser.id) {
        userData = gUser;
      } else {
        // 2. Thử tạo bản ghi guest tối giản (chỉ chứa các cột chắc chắn có trong schema gốc)
        const newGuest = {
          id: GUEST_USER_ID,
          name: params.guestName?.trim() || 'Khách vãng lai',
          email: 'guest@canteen.local',
          role: 'teacher',
          role_title: 'Khách hàng',
          department: 'Khách lẻ Căn tin',
          phone_number: params.guestPhone?.trim() || '',
          wallet_balance: 0,
          monthly_allowance: 0,
          is_active: true,
        };
        const { data: createdGuest } = await supabase
          .from('users')
          .upsert(newGuest, { onConflict: 'email' })
          .select()
          .maybeSingle();

        if (createdGuest && createdGuest.id) {
          userData = createdGuest;
        } else {
          // 3. Nếu không thể chèn do quyền RLS của anon, tìm 1 user bất kỳ có sẵn trong DB để thỏa mãn khoá ngoại
          const { data: anyDbUser } = await supabase.from('users').select('id, name, email').limit(1).maybeSingle();
          if (anyDbUser && anyDbUser.id) {
            userData = { ...newGuest, id: anyDbUser.id };
          } else {
            userData = newGuest;
          }
        }
      }
    } catch {
      try {
        const { data: fallbackUser } = await supabase.from('users').select('id').limit(1).maybeSingle();
        userData = {
          id: fallbackUser?.id || GUEST_USER_ID,
          name: params.guestName?.trim() || 'Khách vãng lai',
          email: 'guest@canteen.local',
          phone_number: params.guestPhone?.trim() || '',
          role: 'teacher',
          wallet_balance: 0,
          is_active: true,
        };
      } catch {
        userData = {
          id: GUEST_USER_ID,
          name: params.guestName?.trim() || 'Khách vãng lai',
          email: 'guest@canteen.local',
          phone_number: params.guestPhone?.trim() || '',
          role: 'teacher',
          wallet_balance: 0,
          is_active: true,
        };
      }
    }
  } else {
    // Luồng Cán bộ / Giáo viên: Kiểm tra Supabase Auth
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !currentUser) {
      return {
        success: false,
        error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục đặt món.',
      };
    }
    authUser = currentUser;

    // 2. Tìm hoặc khởi tạo chính xác bản ghi user trong bảng users của Supabase (Bắt buộc để thỏa mãn Foreign Key)
    try {
      const { data: foundUsers } = await supabase
        .from('users')
        .select('*')
        .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id},email.eq.${authUser.email}`);

      if (foundUsers && foundUsers.length > 0) {
        userData = foundUsers[0];
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
        wallet_balance: cachedProfile?.walletBalance ?? MONTHLY_WALLET_ALLOWANCE,
        monthly_allowance: cachedProfile?.monthlyAllowance ?? MONTHLY_WALLET_ALLOWANCE,
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
    if (userData.is_active === false || userData.is_disabled === true) {
      return {
        success: false,
        error: 'Tài khoản của bạn đang chờ Ban Quản Trị Canteen duyệt hoặc đã bị tạm khóa. Vui lòng liên hệ Quản lý Căn tin để được hỗ trợ.',
      };
    }
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

  const targetSiteId = params.siteId || userData?.site_id || getSelectedSiteCode() || 'hung_vuong';
  const targetIsGuest = Boolean(params.isGuest);
  const targetDate = targetIsGuest ? getTodayStr() : getTomorrowStr();
  const targetGuestName = targetIsGuest ? (params.guestName?.trim() || 'Khách vãng lai') : '';
  const targetGuestPhone = targetIsGuest ? (params.guestPhone?.trim() || '') : '';
  const targetPaymentMethod = targetIsGuest ? (params.paymentMethod || 'cash') : 'wallet';
  const targetPaymentStatus = targetIsGuest ? 'pending' : 'paid';

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
    const itemIsActive = menuItem ? (menuItem.is_active !== false && menuItem.isActive !== false) : true;

    if (!itemIsActive) {
      return {
        success: false,
        error: `Món "${itemName}" hiện đã ngừng bán / không còn hiển thị. Vui lòng bỏ món này khỏi giỏ hàng và thử lại.`,
      };
    }

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
      const dbMatch = dbMenuList.find((d) => d.id === menuItem.id);
      if (dbMatch) {
        realDbId = dbMatch.id;
      }
    }
    // Tra cứu đối soát bằng tên món trong dbMenuList để luôn có UUID chính xác trong database
    if (!realDbId && itemName) {
      const cleanName = itemName.trim().toLowerCase();
      const dbMatchByName =
        dbMenuList.find(
          (d) =>
            d.name &&
            d.name.trim().toLowerCase() === cleanName &&
            (targetSiteId ? (d.site_id === targetSiteId || (d.available_site_ids && d.available_site_ids.includes(targetSiteId))) : true)
        ) ||
        dbMenuList.find((d) => d.name && d.name.trim().toLowerCase() === cleanName);
      if (dbMatchByName && isValidUuid(dbMatchByName.id)) {
        realDbId = dbMatchByName.id;
      }
    }
    if (!realDbId && isValidUuid(requestedItem.menuItemId)) {
      realDbId = requestedItem.menuItemId;
    }

    orderItemsData.push({
      menu_item_id: realDbId || requestedItem.menuItemId,
      real_db_item_id: realDbId,
      name: itemName,
      price: itemPrice,
      quantity: requestedItem.quantity,
      image_url: itemImg,
    });
  }

  // 4. Kiểm tra số dư ví (chỉ áp dụng cán bộ/giáo viên; khách lẻ thanh toán tiền mặt/chuyển khoản)
  const currentWallet = Number(userData.wallet_balance ?? 0);
  if (!params.isGuest && currentWallet < totalAmount) {
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
    site_id: targetSiteId,
    user_id: userData.id,
    user_name: targetIsGuest ? targetGuestName : (userData.name || authUser?.email?.split('@')[0] || 'Cán bộ'),
    user_email: targetIsGuest ? '' : (userData.email || authUser?.email || ''),
    user_phone: targetIsGuest ? targetGuestPhone : (userData.phone_number || ''),
    user_department: targetIsGuest ? 'Khách lẻ Căn tin' : (userData.department || ''),
    is_guest: targetIsGuest,
    guest_name: targetGuestName,
    guest_phone: targetGuestPhone,
    payment_method: targetPaymentMethod,
    payment_status: targetPaymentStatus,
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

        // Xử lý triệt để lỗi invalid input syntax for type uuid (đối với used_qr_token, exception_token_used, v.v.)
        if (
          errMsg.includes('invalid input syntax for type uuid') ||
          errMsg.includes('invalid syntax for type uuid') ||
          errMsg.includes('syntax for type uuid')
        ) {
          console.warn(
            `[placeOrder UUID syntax adaptive]: DB báo lỗi cú pháp UUID (${res.error.message}). Tự động dọn dẹp các trường token non-UUID...`
          );
          if (currentPayload.used_qr_token && !isValidUuid(currentPayload.used_qr_token)) {
            delete currentPayload.used_qr_token;
            continue;
          }
          if (currentPayload.exception_token_used && !isValidUuid(currentPayload.exception_token_used)) {
            delete currentPayload.exception_token_used;
            continue;
          }
        }

        // Xử lý nếu DB báo lỗi cột site_id không tồn tại trong bảng orders
        if (errMsg.includes('column "site_id"') && errMsg.includes('does not exist')) {
          console.warn(`[placeOrder site_id adaptive]: DB báo cột site_id không tồn tại (${res.error.message}). Loại bỏ site_id...`);
          delete currentPayload.site_id;
          continue;
        }

        // Xử lý triệt để lỗi khoá ngoại orders_user_id_fkey
        if (
          errMsg.includes('orders_user_id_fkey') ||
          errMsg.includes('foreign key constraint "orders_user_id_fkey"') ||
          errMsg.includes('violates foreign key constraint') ||
          (errMsg.includes('user_id') && errMsg.includes('foreign key'))
        ) {
          console.warn(
            `[placeOrder foreign key adaptive]: DB báo lỗi khoá ngoại orders_user_id_fkey (${res.error.message}). Tự động tìm user_id hợp lệ trên DB...`
          );
          try {
            // 1. Lấy danh sách ID thực tế có trong bảng users
            const { data: existingUsers } = await supabase.from('users').select('id').limit(10);
            if (existingUsers && existingUsers.length > 0) {
              const candidate = existingUsers.find((u) => u.id && u.id !== currentPayload.user_id) || existingUsers[0];
              if (candidate && candidate.id) {
                console.warn(`[placeOrder foreign key fix]: Chuyển sang user_id="${candidate.id}" có thực trên bảng users và thử lại ngay...`);
                currentPayload.user_id = candidate.id;
                continue;
              }
            }
          } catch (fkErr) {
            console.warn('[placeOrder foreign key lookup note]:', fkErr);
          }

          // 2. Thử tạo khẩn cấp một bản ghi user tối giản vào bảng users
          try {
            const emergencyId = generateUUID();
            const emergencyUser = {
              id: emergencyId,
              email: `guest_${Date.now()}@canteen.local`,
              name: currentPayload.user_name || 'Khách Căn tin',
              role: 'teacher',
              role_title: 'Khách hàng',
              wallet_balance: 0,
              monthly_allowance: 0,
              is_active: true,
            };
            const { data: insUser } = await supabase.from('users').insert(emergencyUser).select().maybeSingle();
            if (insUser && insUser.id) {
              currentPayload.user_id = insUser.id;
              continue;
            }
          } catch {}

          // 3. Nếu bảng orders cho phép NULL ở cột user_id (hoặc đã chạy SQL migration)
          if (currentPayload.user_id !== null) {
            console.warn('[placeOrder foreign key fix]: Thử đặt user_id = null để lưu đơn hàng...');
            currentPayload.user_id = null;
            continue;
          }
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
          // Luôn giữ site_id để phân loại cơ sở chính xác (site_id là text: 'hung_vuong' hoặc 'g_group')
          if (!currentPayload.site_id) {
            currentPayload.site_id = targetSiteId;
          }
          continue;
        }

        // Fallback 2: Loại bỏ target_date, used_qr_token, room_number
        if (attempt === 1) {
          delete currentPayload.target_date;
          delete currentPayload.used_qr_token;
          delete currentPayload.room_number;
          if (!currentPayload.site_id) {
            currentPayload.site_id = targetSiteId;
          }
          continue;
        }

        // Fallback 3: Loại bỏ các trường mở rộng khách lẻ nếu bảng cũ chưa có
        if (attempt === 2) {
          delete currentPayload.is_guest;
          delete currentPayload.guest_name;
          delete currentPayload.guest_phone;
          delete currentPayload.payment_method;
          delete currentPayload.payment_status;
          delete currentPayload.notes;
          if (!currentPayload.site_id) {
            currentPayload.site_id = targetSiteId;
          }
          continue;
        }

        // Fallback 4: Chỉ giữ lại các cột cơ bản nhất tuyệt đối của orders
        if (attempt === 3) {
          currentPayload = {
            id: currentPayload.id,
            order_code: currentPayload.order_code,
            site_id: targetSiteId,
            user_id: currentPayload.user_id,
            user_name: currentPayload.user_name,
            delivery_method: currentPayload.delivery_method,
            pickup_time: currentPayload.pickup_time,
            total_amount: currentPayload.total_amount,
            status: currentPayload.status,
            order_date: currentPayload.order_date,
            note: currentPayload.note,
          };
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
      let dbItem: { id: string; current_stock: number; site_id?: string } | null = null;

      // 8.1 Thử tìm món trong database bằng ID (nếu có UUID hợp lệ)
      if (it.real_db_item_id && isValidUuid(it.real_db_item_id)) {
        const { data: byId } = await supabase
          .from('menu_items')
          .select('id, current_stock, site_id')
          .eq('id', it.real_db_item_id)
          .maybeSingle();
        if (byId) dbItem = byId;
      }

      // 8.2 Nếu chưa tìm thấy theo ID, tìm theo Tên món chính xác và ĐÚNG site_id trong DB
      if (!dbItem && it.name) {
        const cleanName = it.name.trim();
        let queryByName = supabase
          .from('menu_items')
          .select('id, current_stock, site_id')
          .ilike('name', cleanName);
        if (targetSiteId) {
          queryByName = queryByName.eq('site_id', targetSiteId);
        }
        const { data: byName } = await queryByName.limit(1).maybeSingle();
        if (byName) {
          dbItem = byName;
          it.real_db_item_id = byName.id;
        } else {
          // Fallback tìm tên bất kỳ site
          const { data: byNameAny } = await supabase
            .from('menu_items')
            .select('id, current_stock, site_id')
            .ilike('name', cleanName)
            .limit(1)
            .maybeSingle();
          if (byNameAny) {
            dbItem = byNameAny;
            it.real_db_item_id = byNameAny.id;
          }
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

  // 9. Trừ số dư ví của người dùng trong bảng users trên Supabase (chỉ với cán bộ/giáo viên)
  const newBalance = !params.isGuest ? Math.max(0, currentWallet - totalAmount) : undefined;
  if (!params.isGuest && newBalance !== undefined) {
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
        site_id: targetSiteId,
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
    siteId: targetSiteId,
    userId: userData.id,
    userName: targetIsGuest ? targetGuestName : (userData.name || authUser?.email?.split('@')[0] || 'Cán bộ'),
    userPhone: targetIsGuest ? targetGuestPhone : (userData.phone_number || ''),
    userDepartment: targetIsGuest ? 'Khách lẻ Căn tin' : (userData.department || ''),
    isGuest: targetIsGuest,
    guestName: targetGuestName,
    guestPhone: targetGuestPhone,
    paymentMethod: targetPaymentMethod as PaymentMethod,
    paymentStatus: targetPaymentStatus as PaymentStatus,
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
      const userUuid = (userData?.id && isValidUuid(userData.id)) ? userData.id : null;
      try {
        const payload: Record<string, any> = {
          used_count: totalUsedOrders,
          is_used: isFullyUsed,
          used_at: new Date().toISOString(),
          note: updatedNote,
        };
        if (userUuid) {
          payload.used_by = userUuid;
        }
        const { error: updErr } = await supabase
          .from('qr_exception_tokens')
          .update(payload)
          .eq('token', matchedToken.token);

        if (updErr) {
          // Retry without optional used_by/used_at columns
          await supabase
            .from('qr_exception_tokens')
            .update({
              used_count: totalUsedOrders,
              is_used: isFullyUsed,
              note: updatedNote,
            })
            .eq('token', matchedToken.token);
        }
      } catch (e) {
        console.warn('Update qr token status note:', e);
      }

      // Luôn cập nhật trạng thái đồng bộ vào bảng system_settings trong Supabase
      try {
        await patchQRTokenInSystemSettings(matchedToken.token, {
          usedCount: totalUsedOrders,
          isUsed: isFullyUsed,
          usedBy: userData.name || authUser?.email || 'Người dùng',
          usedAt: new Date().toISOString(),
          note: updatedNote,
        });
      } catch (e) {
        console.warn('Update qr token in system_settings note:', e);
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

  if (authUser?.id && authUser.id !== userData.id) {
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
  broadcastSystemEvent('canteen_order_created', { order: localOrder, userId: userData.id, siteId: targetSiteId });
  broadcastSystemEvent('canteen_order_placed', { order: localOrder, userId: userData.id, siteId: targetSiteId });
  broadcastSystemEvent('canteen_new_order_inserted', localOrder);
  if (newBalance !== undefined) {
    broadcastSystemEvent('canteen_wallet_updated', { walletBalance: newBalance, userId: userData.id });
  }
  if (targetIsGuest) {
    broadcastSystemEvent('canteen_guest_order_pending', { order: localOrder, siteId: targetSiteId });
  }
  broadcastSystemEvent('canteen_menu_updated');

  return {
    success: true,
    order_id: generatedId,
    order_code: orderCode,
    total_amount: totalAmount,
    new_balance: newBalance,
    payment_status: targetPaymentStatus as PaymentStatus,
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

    if (order.status === 'preparing') {
      return {
        success: false,
        error: 'Món ăn của bạn đã được chuyển xuống Bếp và đang được chế biến. Không thể hủy đơn ở giai đoạn này. Vui lòng liên hệ trực tiếp Canteen nếu cần hỗ trợ.',
      };
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

    // Phục hồi lại số lượng tồn kho món ăn trong bảng menu_items (ĐẢM BẢO KHÔNG VƯỢT QUÁ PREPARED_STOCK)
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
              .select('id, current_stock, prepared_stock')
              .eq('id', it.menu_item_id)
              .maybeSingle();
            mItem = data;
          }
          if (!mItem && it.name) {
            const { data } = await supabase
              .from('menu_items')
              .select('id, current_stock, prepared_stock')
              .ilike('name', it.name.trim())
              .limit(1)
              .maybeSingle();
            mItem = data;
          }

          if (mItem) {
            const prepStock = mItem.prepared_stock !== null && mItem.prepared_stock !== undefined
              ? Number(mItem.prepared_stock)
              : Number(mItem.current_stock ?? 0);
            const currStock = Number(mItem.current_stock ?? 0);
            const qtyToRestore = Number(it.quantity ?? 1);
            // Giới hạn tồn kho không bao giờ được vượt quá số lượng chuẩn bị ban đầu (prepared_stock)
            const restoredStock = Math.min(prepStock, currStock + qtyToRestore);
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
            const prepStock = m.preparedStock !== null && m.preparedStock !== undefined
              ? Number(m.preparedStock)
              : Number(m.currentStock ?? 0);
            const currStock = Number(m.currentStock ?? 0);
            return { ...m, currentStock: Math.min(prepStock, currStock + Number(matchingIt.quantity ?? 1)) };
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
    if (cachedOrder.status === 'preparing') {
      return {
        success: false,
        error: 'Món ăn của bạn đã được chuyển xuống Bếp và đang được chế biến. Không thể hủy đơn ở giai đoạn này. Vui lòng liên hệ trực tiếp Canteen nếu cần hỗ trợ.',
      };
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

export async function confirmGuestPayment(
  orderId: string,
  actor?: UserProfile
): Promise<{ success: boolean; order?: Order; error?: string }> {
  checkSupabase();
  const cleanId = orderId.trim();
  const now = new Date().toISOString();
  const adminUuid = isUuid(actor?.id) ? actor!.id : null;
  const confirmedByName = actor?.name || 'Quản lý Căn tin';

  // 1. Thử gọi RPC confirm_guest_payment
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('confirm_guest_payment', {
      p_order_id: cleanId,
      p_admin_id: adminUuid,
    });
    if (!rpcErr && rpcRes && (rpcRes.success || rpcRes === true)) {
      console.log('[confirmGuestPayment]: RPC call succeeded');
    }
  } catch (rpcEx) {
    console.warn('[confirmGuestPayment RPC notice]:', rpcEx);
  }

  // 2. Cập nhật trực tiếp bảng orders trên Supabase (Adaptive update - an toàn với kiểu UUID/TEXT của payment_confirmed_by)
  try {
    const updatePayload: Record<string, any> = {
      payment_status: 'paid',
      status: 'confirmed',
      payment_confirmed_at: now,
      updated_at: now,
    };
    if (adminUuid) {
      updatePayload.payment_confirmed_by = adminUuid;
    }

    const runDirectUpdate = async (p: Record<string, any>) => {
      if (isUuid(cleanId)) {
        return await supabase.from('orders').update(p).or(`id.eq.${cleanId},order_code.eq.${cleanId}`);
      } else {
        return await supabase.from('orders').update(p).eq('order_code', cleanId);
      }
    };

    const { error: updErr } = await runDirectUpdate(updatePayload);
    if (updErr) {
      console.warn('[confirmGuestPayment direct update warning, retrying minimal]:', updErr);
      await runDirectUpdate({
        payment_status: 'paid',
        status: 'confirmed',
        updated_at: now,
      });
    }
  } catch (e: any) {
    console.warn('[confirmGuestPayment update DB notice]:', e);
  }

  // 3. Cập nhật cache cục bộ
  let updatedOrder: Order | undefined = undefined;
  try {
    const cached = getCachedOrders();
    const updated = cached.map((o) => {
      if (o.id === cleanId || o.orderCode === cleanId) {
        const patched: Order = {
          ...o,
          paymentStatus: 'paid',
          status: 'confirmed',
          paymentConfirmedAt: now,
          paymentConfirmedBy: confirmedByName,
        };
        updatedOrder = patched;
        return patched;
      }
      return o;
    });
    setCachedOrders(updated);
  } catch {}

  // 4. Broadcast tín hiệu thời gian thực cho khách lẻ và Portal
  broadcastSystemEvent('canteen_payment_confirmed', {
    orderId: cleanId,
    paymentStatus: 'paid',
    status: 'confirmed',
    confirmedBy: confirmedByName,
  });
  broadcastSystemEvent('canteen_order_updated', {
    orderId: cleanId,
    paymentStatus: 'paid',
    status: 'confirmed',
    confirmedBy: confirmedByName,
    order: updatedOrder,
  });
  broadcastSystemEvent('canteen_order_updated', {
    orderId: cleanId,
    paymentStatus: 'paid',
    status: 'confirmed',
    order: updatedOrder,
  });

  return { success: true, order: updatedOrder };
}

export async function rejectGuestPayment(
  orderId: string,
  reason?: string,
  actor?: UserProfile
): Promise<{ success: boolean; error?: string }> {
  checkSupabase();
  const cleanId = orderId.trim();
  const now = new Date().toISOString();
  const rejectReason = reason || 'Từ chối thanh toán';

  // 0. Kiểm tra trạng thái hiện tại của đơn hàng để tránh xử lý lặp / hoàn tồn kho 2 lần
  try {
    let checkQuery = supabase.from('orders').select('id, status, payment_status');
    if (isValidUuid(cleanId)) {
      checkQuery = checkQuery.or(`id.eq.${cleanId},order_code.eq.${cleanId}`);
    } else {
      checkQuery = checkQuery.eq('order_code', cleanId);
    }
    const { data: existingOrder } = await checkQuery.limit(1).maybeSingle();
    if (existingOrder && (existingOrder.status === 'cancelled' || existingOrder.payment_status === 'rejected')) {
      console.info(`[rejectGuestPayment]: Đơn hàng ${cleanId} đã ở trạng thái hủy/từ chối từ trước, không cộng lại tồn kho nữa.`);
      return { success: true };
    }
  } catch (checkEx) {
    console.warn('[rejectGuestPayment check error]:', checkEx);
  }

  // 1. Thử gọi RPC reject_guest_payment (Hàm Postgres đã tự động hoàn tồn kho cho từng món ăn)
  let rpcHandled = false;
  if (isValidUuid(cleanId)) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('reject_guest_payment', {
        p_order_id: cleanId,
        p_reason: rejectReason,
      });
      if (!rpcErr && rpcRes && (rpcRes as any).success !== false) {
        rpcHandled = true;
        console.info(`[rejectGuestPayment]: RPC reject_guest_payment đã xử lý thành công (hoàn tồn kho trên Postgres).`);
      } else if (rpcErr) {
        console.warn('[rejectGuestPayment RPC error]:', rpcErr);
      }
    } catch (rpcEx) {
      console.warn('[rejectGuestPayment RPC notice]:', rpcEx);
    }
  }

  // 2. Nếu RPC không chạy được (hoặc order_id không phải UUID), cập nhật bảng orders và hoàn tồn kho bằng JS Fallback
  if (!rpcHandled) {
    try {
      if (isValidUuid(cleanId)) {
        await supabase
          .from('orders')
          .update({
            payment_status: 'rejected',
            status: 'cancelled',
            cancelled_at: now,
            cancel_reason: rejectReason,
            updated_at: now,
          })
          .or(`id.eq.${cleanId},order_code.eq.${cleanId}`);
      } else {
        await supabase
          .from('orders')
          .update({
            payment_status: 'rejected',
            status: 'cancelled',
            cancelled_at: now,
            cancel_reason: rejectReason,
            updated_at: now,
          })
          .eq('order_code', cleanId);
      }
    } catch (updErr) {
      console.warn('[rejectGuestPayment update DB notice]:', updErr);
    }

    // Phục hồi tồn kho món ăn qua JS KHI VÀ CHỈ KHI RPC chưa hoàn tồn kho trên DB
    try {
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', cleanId);

      if (Array.isArray(items) && items.length > 0) {
        for (const it of items) {
          let mItem: any = null;
          if (it.menu_item_id && isValidUuid(it.menu_item_id)) {
            const { data } = await supabase
              .from('menu_items')
              .select('id, current_stock, prepared_stock')
              .eq('id', it.menu_item_id)
              .maybeSingle();
            mItem = data;
          }
          if (!mItem && it.name) {
            const { data } = await supabase
              .from('menu_items')
              .select('id, current_stock, prepared_stock')
              .ilike('name', it.name.trim())
              .limit(1)
              .maybeSingle();
            mItem = data;
          }

          if (mItem) {
            const prepStock = mItem.prepared_stock !== null && mItem.prepared_stock !== undefined
              ? Number(mItem.prepared_stock)
              : Number(mItem.current_stock ?? 0);
            const currStock = Number(mItem.current_stock ?? 0);
            const qtyToRestore = Number(it.quantity ?? 1);
            // Giới hạn tồn kho không bao giờ được vượt quá số lượng chuẩn bị ban đầu (prepared_stock)
            const restoredStock = Math.min(prepStock, currStock + qtyToRestore);
            await supabase
              .from('menu_items')
              .update({ current_stock: restoredStock, updated_at: now })
              .eq('id', mItem.id);
          }
        }
      }
    } catch (restockErr) {
      console.warn('[rejectGuestPayment fallback restock notice]:', restockErr);
    }
  }

  // 2.5 Bảo vệ tuyệt đối: Đảm bảo tồn kho trên Supabase không bao giờ vượt quá prepared_stock
  try {
    const { data: items } = await supabase
      .from('order_items')
      .select('menu_item_id, name')
      .eq('order_id', cleanId);

    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        let mItem: any = null;
        if (it.menu_item_id && isValidUuid(it.menu_item_id)) {
          const { data } = await supabase
            .from('menu_items')
            .select('id, current_stock, prepared_stock')
            .eq('id', it.menu_item_id)
            .maybeSingle();
          mItem = data;
        }
        if (!mItem && it.name) {
          const { data } = await supabase
            .from('menu_items')
            .select('id, current_stock, prepared_stock')
            .ilike('name', it.name.trim())
            .limit(1)
            .maybeSingle();
          mItem = data;
        }

        if (mItem && mItem.prepared_stock !== null && mItem.prepared_stock !== undefined && Number(mItem.current_stock) > Number(mItem.prepared_stock)) {
          await supabase
            .from('menu_items')
            .update({ current_stock: mItem.prepared_stock, updated_at: now })
            .eq('id', mItem.id);
        }
      }
    }
  } catch {}

  // 3. Cập nhật tồn kho trong cache thực đơn cục bộ (chỉ cộng nếu RPC chưa chạy để tránh cộng đúp)
  if (!rpcHandled) {
    try {
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', cleanId);

      if (Array.isArray(items) && items.length > 0) {
        const currMenu = getCachedMenu();
        const updatedMenu = currMenu.map((m) => {
          const matchingIt = items.find(
            (it) => it.menu_item_id === m.id || (it.name && m.name && it.name.trim().toLowerCase() === m.name.trim().toLowerCase())
          );
          if (matchingIt) {
            const prepStock = m.preparedStock !== null && m.preparedStock !== undefined
              ? Number(m.preparedStock)
              : Number(m.currentStock ?? 0);
            const currStock = Number(m.currentStock ?? 0);
            return { ...m, currentStock: Math.min(prepStock, currStock + Number(matchingIt.quantity ?? 1)) };
          }
          return m;
        });
        setCachedMenu(updatedMenu);
      }
    } catch (cErr) {
      console.warn('[rejectGuestPayment local cache restock note]:', cErr);
    }
  }

  // 4. Cập nhật cache cục bộ
  try {
    const cached = getCachedOrders();
    const updated = cached.map((o) => {
      if (o.id === cleanId || o.orderCode === cleanId) {
        return {
          ...o,
          paymentStatus: 'rejected' as const,
          status: 'cancelled' as const,
          cancelledAt: now,
          cancelReason: rejectReason,
        };
      }
      return o;
    });
    setCachedOrders(updated);
  } catch {}

  // 5. Broadcast sự kiện thời gian thực
  broadcastSystemEvent('canteen_payment_rejected', {
    orderId: cleanId,
    reason: rejectReason,
    paymentStatus: 'rejected',
    status: 'cancelled',
  });
  broadcastSystemEvent('canteen_order_updated', {
    orderId: cleanId,
    paymentStatus: 'rejected',
    status: 'cancelled',
  });
  broadcastSystemEvent('canteen_menu_updated');

  return { success: true };
}

export function getVietQrBankCode(bankName?: string): string {
  if (!bankName) return 'MB';
  const norm = bankName.toLowerCase();
  if (norm.includes('vietcombank') || norm.includes('vcb')) return 'VCB';
  if (norm.includes('techcombank') || norm.includes('tcb')) return 'TCB';
  if (norm.includes('bidv')) return 'BIDV';
  if (norm.includes('vietinbank') || norm.includes('vietin') || norm.includes('ctg') || norm.includes('icb')) return 'CTG';
  if (norm.includes('agribank') || norm.includes('vba')) return 'VBA';
  if (norm.includes('acb')) return 'ACB';
  if (norm.includes('vpbank') || norm.includes('vpb')) return 'VPB';
  if (norm.includes('tpbank') || norm.includes('tpb')) return 'TPB';
  if (norm.includes('sacombank') || norm.includes('stb')) return 'STB';
  if (norm.includes('hdbank') || norm.includes('hdb')) return 'HDB';
  if (norm.includes('vib')) return 'VIB';
  if (norm.includes('shb')) return 'SHB';
  if (norm.includes('msb')) return 'MSB';
  if (norm.includes('ocb')) return 'OCB';
  if (norm.includes('lienviet') || norm.includes('lpb') || norm.includes('lpbank')) return 'LPB';
  if (norm.includes('mb') || norm.includes('quân đội')) return 'MB';
  return 'MB';
}

export function subscribeGuestOrder(
  orderId: string,
  onUpdate: (payload: { paymentStatus: PaymentStatus; status: OrderStatus; order?: Order }) => void
): () => void {
  const cleanId = orderId.trim();
  let isSubActive = true;

  // 1. Lắng nghe broadcast / CustomEvent cục bộ
  const localListener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && (detail.orderId === cleanId || detail.order?.id === cleanId || detail.order?.orderCode === cleanId)) {
      const pStatus = detail.paymentStatus || detail.order?.paymentStatus || 'pending';
      const oStatus = detail.status || detail.order?.status || 'pending';
      const isConfirmed = pStatus === 'paid';
      onUpdate({
        paymentStatus: isConfirmed ? 'paid' : pStatus,
        status: oStatus,
        order: detail.order,
      });
    }
  };

  const channelHandler = (ev: MessageEvent) => {
    if (ev.data && (ev.data.orderId === cleanId || ev.data.payload?.orderId === cleanId)) {
      const data = ev.data.payload || ev.data;
      const pStatus = data.paymentStatus || 'pending';
      const oStatus = data.status || 'pending';
      const isConfirmed = pStatus === 'paid';
      onUpdate({
        paymentStatus: isConfirmed ? 'paid' : pStatus,
        status: oStatus,
        order: data.order,
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('canteen_payment_confirmed', localListener);
    window.addEventListener('canteen_payment_rejected', localListener);
    window.addEventListener('canteen_order_updated', localListener);
  }
  if (broadcastSyncChannel) {
    broadcastSyncChannel.addEventListener('message', channelHandler);
  }

  // 2. Kênh Supabase Realtime cho order này
  let supaChannel: any = null;
  if (isSupabaseConfigured && supabase) {
    try {
      supaChannel = supabase
        .channel(`guest-order-${cleanId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload) => {
            const row = payload.new;
            if (row && (row.id === cleanId || row.order_code === cleanId)) {
              const mapped = mapOrder(row);
              const pStatus = (row.payment_status as PaymentStatus) || 'pending';
              const oStatus = (row.status as OrderStatus) || 'pending';
              const isConfirmed = pStatus === 'paid';
              onUpdate({
                paymentStatus: isConfirmed ? 'paid' : pStatus,
                status: oStatus,
                order: mapped,
              });
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('[subscribeGuestOrder Supabase error]:', e);
    }
  }

  // 3. Fallback chủ động thăm dò (Active Polling) mỗi 1.2s đảm bảo chắc chắn cập nhật ngay cả khi Realtime/Broadcast không qua mạng
  let pollInterval: any = null;

  const pollOrderStatus = async () => {
    if (!isSubActive) return;
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .or(`id.eq.${cleanId},order_code.eq.${cleanId}`)
          .maybeSingle();

        if (!error && data) {
          const pStatus = (data.payment_status as PaymentStatus) || 'pending';
          const oStatus = (data.status as OrderStatus) || 'pending';

          // Chỉ thông báo thành công khi nhân viên admin đã bấm Xác nhận thanh toán (pStatus === 'paid')
          if (pStatus === 'paid') {
            const mapped = mapOrder(data);
            onUpdate({
              paymentStatus: 'paid',
              status: oStatus,
              order: mapped,
            });
            if (pollInterval) clearInterval(pollInterval);
            return;
          }

          if (pStatus === 'rejected' || oStatus === 'cancelled') {
            const mapped = mapOrder(data);
            onUpdate({
              paymentStatus: 'rejected',
              status: 'cancelled',
              order: mapped,
            });
            if (pollInterval) clearInterval(pollInterval);
            return;
          }
        }
      } else {
        const cached = getCachedOrders();
        const found = cached.find((o) => o.id === cleanId || o.orderCode === cleanId);
        if (found) {
          if (found.paymentStatus === 'paid') {
            onUpdate({
              paymentStatus: 'paid',
              status: found.status,
              order: found,
            });
            if (pollInterval) clearInterval(pollInterval);
          } else if (found.paymentStatus === 'rejected' || found.status === 'cancelled') {
            onUpdate({
              paymentStatus: 'rejected',
              status: 'cancelled',
              order: found,
            });
            if (pollInterval) clearInterval(pollInterval);
          }
        }
      }
    } catch (pollErr) {
      console.warn('[subscribeGuestOrder poll note]:', pollErr);
    }
  };

  pollOrderStatus();
  pollInterval = setInterval(pollOrderStatus, 1200);

  return () => {
    isSubActive = false;
    if (pollInterval) {
      clearInterval(pollInterval);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('canteen_payment_confirmed', localListener);
      window.removeEventListener('canteen_payment_rejected', localListener);
      window.removeEventListener('canteen_order_updated', localListener);
    }
    if (broadcastSyncChannel) {
      broadcastSyncChannel.removeEventListener('message', channelHandler);
    }
    if (supaChannel && supabase) {
      try {
        supabase.removeChannel(supaChannel);
      } catch {}
    }
  };
}

export function getCachedOrders(userId?: string, siteId?: string): Order[] {
  try {
    const key = `canteen_orders_cache_${userId || 'all'}`;
    const raw = localStorage.getItem(key);
    let list: Order[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    }
    if (userId && list.length === 0) {
      const allRaw = localStorage.getItem('canteen_orders_cache_all');
      if (allRaw) {
        const allParsed = JSON.parse(allRaw);
        if (Array.isArray(allParsed)) {
          const matching = allParsed.filter((o: Order) => o.userId === userId);
          if (matching.length > 0) {
            list = matching.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
        }
      }
    }
    if (siteId && list.length > 0) {
      return list.filter((o) => {
        if (siteId === 'hung_vuong') return !o.siteId || o.siteId === 'hung_vuong';
        return o.siteId === siteId;
      });
    }
    return list;
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
  siteId?: string;
  paymentStatus?: string;
  isGuest?: boolean;
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
    if (filters?.siteId) {
      if (filters.siteId === 'hung_vuong') {
        if (!filters?.targetDate) {
          query = query.or('site_id.eq.hung_vuong,site_id.is.null');
        } else {
          query = query.eq('site_id', 'hung_vuong');
        }
      } else {
        query = query.eq('site_id', filters.siteId);
      }
    }
    if (filters?.paymentStatus) {
      query = query.eq('payment_status', filters.paymentStatus);
    }
    if (filters?.isGuest !== undefined) {
      query = query.eq('is_guest', filters.isGuest);
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
        // Không ép filter site_id trên SQL ở fallbackQuery để phòng ngừa lỗi cột UUID hoặc cột chưa có trên DB.
        // Javascript sẽ filter siteId chuẩn xác ở bước sau.
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
      const cached = getCachedOrders(filters?.userId, filters?.siteId);
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

      let finalFiltered = combined;
      if (filters?.siteId) {
        finalFiltered = finalFiltered.filter((ord) => {
          if (filters.siteId === 'hung_vuong') {
            return !ord.siteId || ord.siteId === 'hung_vuong';
          }
          return ord.siteId === filters.siteId;
        });
      }
      if (filters?.paymentStatus) {
        finalFiltered = finalFiltered.filter((ord) => ord.paymentStatus === filters.paymentStatus);
      }

      setCachedOrders(finalFiltered, filters?.userId);
      if (!filters?.userId) {
        setCachedOrders(finalFiltered);
      }
      return finalFiltered;
    }

    return getCachedOrders(filters?.userId, filters?.siteId);
  } catch (err: any) {
    console.warn('[getOrders fallback notice - timeout or network]:', err?.message || err);
    return getCachedOrders(filters?.userId, filters?.siteId);
  }
}

/**
 * Tải đầy đủ thông tin một đơn hàng kèm chi tiết món ăn (order_items) từ Supabase.
 * - Giải quyết triệt để race condition khi Realtime INSERT 'orders' bắn sự kiện trước khi bảng 'order_items' hoàn tất lưu.
 * - Có cơ chế thử lại (retry) ngắn cách nhau retryDelayMs (mặc định 400ms, tối đa 3 lần).
 * - Tự động tra cứu bổ sung bảng 'order_items' trực tiếp nếu join ban đầu chưa có items.
 * - Cập nhật đồng bộ cache cục bộ để UI Portal không bị lệch trạng thái.
 */
export async function fetchOrderWithItems(
  orderIdOrCode: string,
  maxRetries: number = 3,
  retryDelayMs: number = 400
): Promise<Order | null> {
  if (!orderIdOrCode) return null;
  checkSupabase();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Thử lấy đơn hàng kèm order_items từ Supabase
      const query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .or(`id.eq.${orderIdOrCode},order_code.eq.${orderIdOrCode}`)
        .maybeSingle();

      const { data, error } = await withQueryTimeout(
        query,
        10000,
        `Timeout fetching order ${orderIdOrCode}`
      );

      if (data && !error) {
        let items = data.order_items;

        // Nếu join chưa kịp trả về order_items, truy vấn trực tiếp bảng order_items
        if (!Array.isArray(items) || items.length === 0) {
          const { data: itemRows } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', data.id);
          if (Array.isArray(itemRows) && itemRows.length > 0) {
            items = itemRows;
            data.order_items = itemRows;
          }
        }

        // Kiểm tra xem đã có danh sách items thực tế chưa
        if (Array.isArray(items) && items.length > 0) {
          const mapped = mapOrder(data);
          if (mapped.items && mapped.items.length > 0) {
            // Cập nhật đơn này vào cache đơn hàng để Portal đồng bộ ngay
            try {
              const currentCache = getCachedOrders();
              const updatedCache = [
                mapped,
                ...currentCache.filter((o) => o.id !== mapped.id && o.orderCode !== mapped.orderCode),
              ];
              setCachedOrders(updatedCache);
            } catch {}

            return mapped;
          }
        }
      }

      // Nếu chưa có items và còn lượt thử lại, chờ một khoảng ngắn
      if (attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, retryDelayMs));
      }
    } catch (err: any) {
      console.warn(`[fetchOrderWithItems] Lần thử ${attempt}/${maxRetries} thất bại:`, err?.message || err);
      if (attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, retryDelayMs));
      }
    }
  }

  // Fallback: Kiểm tra trong cache nội bộ (nếu cùng thiết bị/tab vừa tạo)
  const cachedOrders = getCachedOrders();
  const found = cachedOrders.find(
    (o) => o.id === orderIdOrCode || o.orderCode === orderIdOrCode
  );
  if (found && found.items && found.items.length > 0) {
    return found;
  }

  return null;
}


// Lấy trạng thái mới nhất của 1 đơn hàng trực tiếp từ Supabase (không dùng cache),
// chỉ select đúng cột cần thiết để nhẹ, tránh tốn egress không cần thiết.
export async function getLatestOrderStatus(
  orderId: string
): Promise<{ status: string; cancelledAt?: string } | null> {
  checkSupabase();
  try {
    const { data } = await supabase
      .from('orders')
      .select('status, cancelled_at')
      .eq('id', orderId)
      .maybeSingle();
    if (!data) return null;
    return { status: data.status, cancelledAt: data.cancelled_at };
  } catch (e) {
    console.warn('[getLatestOrderStatus note]:', e);
    return null;
  }
}

// Lấy trạng thái tồn kho + hiển thị mới nhất của 1 món trực tiếp từ Supabase.
export async function getLatestMenuItemState(
  menuItemId: string
): Promise<{ currentStock: number; isActive: boolean } | null> {
  checkSupabase();
  try {
    const { data } = await supabase
      .from('menu_items')
      .select('current_stock, is_active')
      .eq('id', menuItemId)
      .maybeSingle();
    if (!data) return null;
    return { currentStock: Number(data.current_stock ?? 0), isActive: data.is_active !== false };
  } catch (e) {
    console.warn('[getLatestMenuItemState note]:', e);
    return null;
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  actor: UserProfile
): Promise<{ success: boolean; error?: string }> {
  checkSupabase();

  // Kiểm tra trạng thái mới nhất trước khi ghi đè, tránh xung đột với hành động của khách hàng
  const latest = await getLatestOrderStatus(orderId);
  if (latest) {
    if (latest.status === 'cancelled') {
      return {
        success: false,
        error: 'Đơn hàng này vừa bị khách hàng hủy. Không thể chuyển sang trạng thái này nữa. Danh sách đơn sẽ được tự động làm mới.',
      };
    }
    if (latest.status === 'completed' && status !== 'completed') {
      return {
        success: false,
        error: 'Đơn hàng này đã ở trạng thái Hoàn thành, không thể chuyển ngược lại trạng thái trước đó.',
      };
    }
  }

  const isConfirming = ['confirmed', 'preparing', 'ready', 'completed'].includes(status);
  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    status,
    updated_at: nowIso,
  };
  if (isConfirming) {
    updatePayload.payment_status = 'paid';
    updatePayload.payment_confirmed_at = nowIso;
    // CRITICAL: Cột payment_confirmed_by trên Postgres có thể là UUID hoặc TEXT.
    // Nếu actor?.id là UUID hợp lệ thì gán actor.id. Tuyệt đối không truyền chuỗi tên như "Admin Canteen"
    // vào cột UUID để tránh lỗi Postgres: invalid input syntax for type uuid: "Admin Canteen"
    if (isUuid(actor?.id)) {
      updatePayload.payment_confirmed_by = actor.id;
    }
  }

  const runRemoteUpdate = async (payload: Record<string, any>) => {
    if (isUuid(orderId)) {
      return await supabase
        .from('orders')
        .update(payload)
        .or(`id.eq.${orderId},order_code.eq.${orderId}`);
    } else {
      return await supabase
        .from('orders')
        .update(payload)
        .eq('order_code', orderId);
    }
  };

  try {
    const { error: updErr } = await runRemoteUpdate(updatePayload);
    if (updErr) {
      console.warn('Update order status remote error, retrying with fallback payload:', updErr);
      // Fallback 1: Bỏ payment_confirmed_by và payment_confirmed_at để tránh lỗi syntax UUID hoặc thiếu cột
      const fallbackPayload: Record<string, any> = {
        status,
        updated_at: nowIso,
      };
      if (isConfirming) {
        fallbackPayload.payment_status = 'paid';
      }
      const retry1 = await runRemoteUpdate(fallbackPayload);
      if (retry1.error) {
        // Fallback 2: Chỉ cập nhật duy nhất status và updated_at
        const retry2 = await runRemoteUpdate({ status, updated_at: nowIso });
        if (retry2.error) {
          return { success: false, error: 'Không thể cập nhật trạng thái đơn hàng: ' + retry2.error.message };
        }
      }
    }
  } catch (e: any) {
    console.warn('Update order status remote note:', e);
    return { success: false, error: 'Không thể cập nhật trạng thái đơn hàng. Vui lòng thử lại.' };
  }

  // Cập nhật trạng thái trong cache cục bộ
  try {
    const all = getCachedOrders();
    const updatedAll = all.map((o) =>
      o.id === orderId || o.orderCode === orderId
        ? {
            ...o,
            status: status as any,
            ...(isConfirming ? { paymentStatus: 'paid' as const } : {}),
          }
        : o
    );
    setCachedOrders(updatedAll);
  } catch {}

  // Phát tín hiệu broadcast cập nhật trạng thái đơn tức thì toàn hệ thống
  broadcastSystemEvent('canteen_order_updated', {
    orderId,
    status,
    paymentStatus: isConfirming ? 'paid' : undefined,
  });
  if (isConfirming) {
    broadcastSystemEvent('canteen_payment_confirmed', { orderId, paymentStatus: 'paid', status });
  }
  return { success: true };
}

// ============================================================
// QR TOKENS - DUAL PERSISTENCE (qr_exception_tokens + system_settings)
// ============================================================

export const SYSTEM_QR_TOKENS_KEY = 'canteen_qr_exception_tokens';

/**
 * Lấy danh sách token ngoại lệ được lưu trữ an toàn trong bảng system_settings của Supabase
 */
export async function getQRTokensFromSystemSettings(siteId?: string): Promise<QRExceptionToken[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SYSTEM_QR_TOKENS_KEY)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.value)) {
      return [];
    }

    let tokens: QRExceptionToken[] = data.value.map((item: any) => mapQRToken(item));
    if (siteId) {
      tokens = tokens.filter((t) =>
        siteId === 'hung_vuong' ? !t.siteId || t.siteId === 'hung_vuong' : t.siteId === siteId
      );
    }
    return tokens;
  } catch (e) {
    console.warn('[getQRTokensFromSystemSettings error]:', e);
    return [];
  }
}

/**
 * Lưu / cập nhật mã QR vào bảng system_settings trong Supabase (Database persistence an toàn 100%)
 */
export async function saveQRTokenToSystemSettings(token: QRExceptionToken): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SYSTEM_QR_TOKENS_KEY)
      .maybeSingle();

    const existing: any[] = (data && Array.isArray(data.value)) ? data.value : [];
    const normalizedToken = token.token.trim().toUpperCase();
    const filtered = existing.filter((item: any) => String(item.token || '').trim().toUpperCase() !== normalizedToken);

    const dbPayload = {
      id: token.id,
      token: token.token,
      site_id: token.siteId || 'hung_vuong',
      note: token.note || '',
      quantity: Number(token.quantity) || 1,
      used_count: Number(token.usedCount) || 0,
      is_used: Boolean(token.isUsed),
      is_disabled: Boolean(token.isDisabled),
      expires_at: token.expiresAt,
      created_by: token.createdBy || null,
      created_by_name: token.createdByName || 'Admin Căn tin',
      created_at: token.createdAt || new Date().toISOString(),
      used_by: token.usedBy || null,
      used_at: token.usedAt || null,
    };

    const updatedList = [dbPayload, ...filtered];

    await supabase
      .from('system_settings')
      .upsert(
        {
          key: SYSTEM_QR_TOKENS_KEY,
          value: updatedList,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    console.info(`[saveQRTokenToSystemSettings] Successfully persisted token "${token.token}" to Supabase system_settings.`);
  } catch (e) {
    console.warn('[saveQRTokenToSystemSettings error]:', e);
  }
}

/**
 * Cập nhật trạng thái hoặc lượt sử dụng mã QR trong system_settings
 */
export async function patchQRTokenInSystemSettings(
  tokenString: string,
  patch: Partial<QRExceptionToken> & Record<string, any>
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SYSTEM_QR_TOKENS_KEY)
      .maybeSingle();

    if (!data || !Array.isArray(data.value)) return;

    const cleanToken = tokenString.trim().toUpperCase();
    let updated = false;

    const newList = data.value.map((item: any) => {
      if (String(item.token || '').trim().toUpperCase() === cleanToken) {
        updated = true;
        return {
          ...item,
          ...(patch.usedCount !== undefined ? { used_count: patch.usedCount } : {}),
          ...(patch.isUsed !== undefined ? { is_used: patch.isUsed } : {}),
          ...(patch.isDisabled !== undefined ? { is_disabled: patch.isDisabled } : {}),
          ...(patch.usedBy !== undefined ? { used_by: patch.usedBy } : {}),
          ...(patch.usedAt !== undefined ? { used_at: patch.usedAt } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          updated_at: new Date().toISOString(),
        };
      }
      return item;
    });

    if (updated) {
      await supabase
        .from('system_settings')
        .upsert(
          {
            key: SYSTEM_QR_TOKENS_KEY,
            value: newList,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );
    }
  } catch (e) {
    console.warn('[patchQRTokenInSystemSettings error]:', e);
  }
}

/**
 * Xóa mã QR khỏi system_settings
 */
export async function deleteQRTokenFromSystemSettings(tokenString: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SYSTEM_QR_TOKENS_KEY)
      .maybeSingle();

    if (!data || !Array.isArray(data.value)) return;

    const cleanToken = tokenString.trim().toUpperCase();
    const filtered = data.value.filter((item: any) => String(item.token || '').trim().toUpperCase() !== cleanToken);

    await supabase
      .from('system_settings')
      .upsert(
        {
          key: SYSTEM_QR_TOKENS_KEY,
          value: filtered,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
  } catch (e) {
    console.warn('[deleteQRTokenFromSystemSettings error]:', e);
  }
}

export async function createQRToken(
  actor: UserProfile,
  note?: string,
  expiresInMinutes = 30,
  quantity = 1,
  siteId?: string
): Promise<QRExceptionToken> {
  checkSupabase();
  const targetSiteId =
    actor.role === 'super_admin'
      ? (siteId || 'hung_vuong')
      : (actor.siteId || siteId || 'hung_vuong');

  const token = `QR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  const cleanUserNote = note ? note.replace(/\[Số lượng:\s*\d+\s*(suất|lượt)\]\s*/gi, '').trim() : '';
  const formattedNote = cleanUserNote ? `[Số lượng: ${quantity} lượt] ${cleanUserNote}` : `[Số lượng: ${quantity} lượt]`;

  // CHỈ gán created_by nếu là UUID hợp lệ, tránh lỗi PostgreSQL "invalid input syntax for type uuid"
  const rawCreatorId = actor.authUserId || actor.id;
  const creatorId = (rawCreatorId && isValidUuid(rawCreatorId)) ? rawCreatorId : null;

  let insertedData: any = null;

  // 1. Thử insert trực tiếp vào bảng qr_exception_tokens trong Supabase DB
  const fullPayload: Record<string, any> = {
    token,
    expires_at: expiresAt,
    note: formattedNote,
    quantity,
    used_count: 0,
    is_used: false,
    is_disabled: false,
    site_id: targetSiteId,
    created_by_name: actor.name || 'Admin Căn tin',
  };
  if (creatorId) {
    fullPayload.created_by = creatorId;
  }

  try {
    let { data, error } = await supabase
      .from('qr_exception_tokens')
      .insert(fullPayload)
      .select()
      .maybeSingle();

    if (!error && data) {
      insertedData = data;
      console.info(`[createQRToken] Đã lưu thành công mã QR ${token} vào bảng qr_exception_tokens trên Supabase DB.`);
    } else {
      if (error) {
        console.warn('[createQRToken attempt 1 failed]:', error.message);
      }

      // Attempt 2: Without created_by (if FK constraint fails on created_by)
      if (fullPayload.created_by) {
        const payloadNoCreator = { ...fullPayload };
        delete payloadNoCreator.created_by;
        const retry1 = await supabase
          .from('qr_exception_tokens')
          .insert(payloadNoCreator)
          .select()
          .maybeSingle();

        if (!retry1.error && retry1.data) {
          insertedData = retry1.data;
          console.info(`[createQRToken] Đã lưu thành công mã QR ${token} (attempt 2) vào bảng qr_exception_tokens.`);
        } else if (retry1.error) {
          console.warn('[createQRToken attempt 2 failed]:', retry1.error.message);
        }
      }

      // Attempt 3: If still no insertedData, try legacy/minimal schema
      if (!insertedData) {
        const payloadClean = {
          token,
          expires_at: expiresAt,
          note: formattedNote,
          quantity,
          used_count: 0,
          is_used: false,
          is_disabled: false,
          site_id: targetSiteId,
        };
        const retry2 = await supabase
          .from('qr_exception_tokens')
          .insert(payloadClean)
          .select()
          .maybeSingle();

        if (!retry2.error && retry2.data) {
          insertedData = retry2.data;
          console.info(`[createQRToken] Đã lưu thành công mã QR ${token} (attempt 3) vào bảng qr_exception_tokens.`);
        } else if (retry2.error) {
          console.warn('[createQRToken attempt 3 failed]:', retry2.error.message);
        }
      }
    }
  } catch (err: any) {
    console.warn('[createQRToken table insert exception]:', err?.message || err);
  }

  // 2. Khởi tạo đối tượng token chuẩn
  const tokenRecordId = insertedData?.id || generateUUID();
  const tokenCreatedAt = insertedData?.created_at || new Date().toISOString();

  const newToken: QRExceptionToken = {
    id: tokenRecordId,
    token,
    siteId: targetSiteId,
    note: formattedNote,
    quantity,
    usedCount: 0,
    isUsed: false,
    isDisabled: false,
    expiresAt,
    createdBy: creatorId || undefined,
    createdByName: actor.name || 'Admin Căn tin',
    createdAt: tokenCreatedAt,
  };

  // 3. ĐỒNG BỘ LƯU TRỮ VÀO BẢNG system_settings CỦA SUPABASE DATABASE (Cam kết 100% lưu vào DB)
  await saveQRTokenToSystemSettings(newToken);

  // 4. Cập nhật cache local & phát sự kiện toàn hệ thống
  const cached = getCachedQRTokens();
  setCachedQRTokens([newToken, ...cached.filter((t) => t.token.toUpperCase() !== newToken.token.toUpperCase())]);
  broadcastSystemEvent('canteen_qr_token_updated', { token: newToken.token, quantity, usedCount: 0, isUsed: false });
  broadcastSystemEvent('canteen_sync', { eventType: 'qr_token_created', token: newToken });
  return newToken;
}

export async function getQRTokens(siteId?: string): Promise<QRExceptionToken[]> {
  checkSupabase();
  try {
    const allOrders = getCachedOrders();
    const existingCached = getCachedQRTokens();

    // 1. Lấy đồng thời từ cả bảng qr_exception_tokens VÀ system_settings trong Supabase
    const [tableRes, settingsTokens] = await Promise.all([
      (async () => {
        try {
          let query = supabase
            .from('qr_exception_tokens')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

          if (siteId) {
            if (siteId === 'hung_vuong') {
              query = query.or('site_id.eq.hung_vuong,site_id.is.null');
            } else {
              query = query.eq('site_id', siteId);
            }
          }
          const { data, error } = await withQueryTimeout(
            query,
            8000,
            'Timeout fetch qr_exception_tokens'
          );
          if (!error && Array.isArray(data)) {
            return data.map(mapQRToken);
          }
        } catch {}
        return [];
      })(),
      getQRTokensFromSystemSettings(siteId),
    ]);

    // 2. Gộp danh sách từ 2 nguồn DB cùng cache
    const tokenMap = new Map<string, QRExceptionToken>();

    // Nguồn 1: table qr_exception_tokens
    for (const t of tableRes) {
      tokenMap.set(t.token.toUpperCase(), t);
    }
    // Nguồn 2: system_settings (bảo đảm an toàn ngay cả khi bảng kia bị RLS)
    for (const st of settingsTokens) {
      const key = st.token.toUpperCase();
      if (!tokenMap.has(key)) {
        tokenMap.set(key, st);
      } else {
        const existing = tokenMap.get(key)!;
        tokenMap.set(key, {
          ...existing,
          quantity: st.quantity || existing.quantity,
          usedCount: Math.max(st.usedCount || 0, existing.usedCount || 0),
          isDisabled: st.isDisabled !== undefined ? st.isDisabled : existing.isDisabled,
          siteId: st.siteId || existing.siteId,
          note: st.note || existing.note,
        });
      }
    }
    // Nguồn 3: cache client
    for (const ct of existingCached) {
      const key = ct.token.toUpperCase();
      if (!tokenMap.has(key)) {
        tokenMap.set(key, ct);
      }
    }

    let list = Array.from(tokenMap.values()).map((tokenObj) => {
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

    if (siteId) {
      list = list.filter((t) => (siteId === 'hung_vuong' ? !t.siteId || t.siteId === 'hung_vuong' : t.siteId === siteId));
    }

    // Sắp xếp theo thứ tự mới nhất
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setCachedQRTokens(list);
    return list;
  } catch (err) {
    console.warn('[getQRTokens error]:', err);
    let cached = getCachedQRTokens();
    if (siteId) {
      cached = cached.filter((t) => (siteId === 'hung_vuong' ? !t.siteId || t.siteId === 'hung_vuong' : t.siteId === siteId));
    }
    return cached;
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

    // Luôn đồng bộ vào bảng system_settings trong Supabase
    await patchQRTokenInSystemSettings(cleanToken, { isDisabled });
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

    // Xóa khỏi bảng system_settings trong Supabase
    await deleteQRTokenFromSystemSettings(cleanToken);
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
  broadcastSystemEvent('canteen_time_gate_updated', cfg);

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

// ============================================================
// CẤU HÌNH TỰ ĐỘNG IN BILL KHI CÓ ĐƠN HÀNG MỚI (AUTO-PRINT)
// ============================================================

export const AUTO_PRINT_STORAGE_KEY = 'canteen_auto_print_enabled';

export function getCustomAutoPrintConfig(): AutoPrintConfig {
  try {
    const saved = localStorage.getItem(AUTO_PRINT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.enabled === 'boolean') return parsed;
    }
  } catch {}
  return { enabled: false };
}

export async function fetchAutoPrintConfig(): Promise<AutoPrintConfig> {
  try {
    if (isSupabaseConfigured && supabase) {
      let matchedRow: any = null;

      try {
        const { data: sData, error: sErr } = await supabase
          .from('settings')
          .select('*');
        if (!sErr && Array.isArray(sData) && sData.length > 0) {
          matchedRow = sData.find(
            (r) => r.key === 'auto_print_enabled' || r.key === 'auto_print'
          );
        }
      } catch (err) {
        console.warn('Fetch auto print from settings notice:', err);
      }

      if (!matchedRow) {
        try {
          const { data: sysData, error: sysErr } = await supabase
            .from('system_settings')
            .select('*');
          if (!sysErr && Array.isArray(sysData) && sysData.length > 0) {
            matchedRow = sysData.find(
              (r) => r.key === 'auto_print_enabled' || r.key === 'auto_print'
            );
          }
        } catch (err) {
          console.warn('Fetch auto print from system_settings notice:', err);
        }
      }

      if (matchedRow?.value) {
        let val = matchedRow.value;
        if (typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch {}
        }
        const enabled = Boolean(val.enabled);
        const cfg: AutoPrintConfig = {
          enabled,
          updatedBy: val.updatedBy || val.updated_by || 'Admin',
          updatedAt: val.updatedAt || val.updated_at || new Date().toISOString(),
        };

        const oldCfg = getCustomAutoPrintConfig();
        if (oldCfg.enabled !== cfg.enabled || oldCfg.updatedAt !== cfg.updatedAt) {
          localStorage.setItem(AUTO_PRINT_STORAGE_KEY, JSON.stringify(cfg));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_auto_print_updated', { detail: cfg }));
          }
        }
        return cfg;
      }
    }
  } catch (e) {
    console.warn('Fetch auto print config notice:', e);
  }
  return getCustomAutoPrintConfig();
}

export async function setAutoPrintEnabled(
  enabled: boolean,
  actor?: UserProfile
): Promise<void> {
  const cfg: AutoPrintConfig = {
    enabled,
    updatedBy: actor?.name || 'Admin',
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(AUTO_PRINT_STORAGE_KEY, JSON.stringify(cfg));
  broadcastSystemEvent('canteen_auto_print_updated', cfg);

  if (isSupabaseConfigured && supabase) {
    const payload = {
      enabled,
      updated_by: actor?.name || 'Admin',
      updated_at: new Date().toISOString(),
    };

    try {
      await Promise.allSettled([
        supabase.from('settings').upsert({
          key: 'auto_print_enabled',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('settings').upsert({
          key: 'auto_print',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('system_settings').upsert({
          key: 'auto_print_enabled',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('system_settings').upsert({
          key: 'auto_print',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
      ]);
    } catch (e) {
      console.warn('Sync auto print config to supabase warning:', e);
    }
  }
}

// ============================================================
// CẤU HÌNH ĐA MÁY IN POS CHO QUẦY THU NGÂN & BẾP (PRINTER CONFIG)
// ============================================================

export const PRINTER_CONFIG_STORAGE_KEY = 'canteen_printer_config';

export function getCustomPrinterConfig(): PrinterConfig {
  try {
    const saved = localStorage.getItem(PRINTER_CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return {
          tongPrinterName: parsed.tongPrinterName || parsed.tong_printer || '',
          comPrinterName: parsed.comPrinterName || parsed.com_printer || '',
          nuocPrinterName: parsed.nuocPrinterName || parsed.nuoc_printer || '',
        };
      }
    }
  } catch {}
  return {
    tongPrinterName: '',
    comPrinterName: '',
    nuocPrinterName: '',
  };
}

export async function fetchPrinterConfig(): Promise<PrinterConfig> {
  try {
    if (isSupabaseConfigured && supabase) {
      let matchedRow: any = null;

      try {
        const { data: sData, error: sErr } = await supabase
          .from('settings')
          .select('*');
        if (!sErr && Array.isArray(sData) && sData.length > 0) {
          matchedRow = sData.find(
            (r) => r.key === 'printer_config' || r.key === 'pos_printers'
          );
        }
      } catch (err) {
        console.warn('Fetch printer config from settings notice:', err);
      }

      if (!matchedRow) {
        try {
          const { data: sysData, error: sysErr } = await supabase
            .from('system_settings')
            .select('*');
          if (!sysErr && Array.isArray(sysData) && sysData.length > 0) {
            matchedRow = sysData.find(
              (r) => r.key === 'printer_config' || r.key === 'pos_printers'
            );
          }
        } catch (err) {
          console.warn('Fetch printer config from system_settings notice:', err);
        }
      }

      if (matchedRow?.value) {
        let val = matchedRow.value;
        if (typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch {}
        }

        const cfg: PrinterConfig = {
          tongPrinterName: val.tongPrinterName || val.tong_printer || '',
          comPrinterName: val.comPrinterName || val.com_printer || '',
          nuocPrinterName: val.nuocPrinterName || val.nuoc_printer || '',
        };

        const oldCfg = getCustomPrinterConfig();
        const hasChanged =
          oldCfg.tongPrinterName !== cfg.tongPrinterName ||
          oldCfg.comPrinterName !== cfg.comPrinterName ||
          oldCfg.nuocPrinterName !== cfg.nuocPrinterName;

        if (hasChanged) {
          localStorage.setItem(PRINTER_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_printer_config_updated', { detail: cfg }));
          }
        }
        return cfg;
      }
    }
  } catch (e) {
    console.warn('Fetch printer config notice:', e);
  }
  return getCustomPrinterConfig();
}

export async function setPrinterConfig(
  config: PrinterConfig,
  actor?: UserProfile
): Promise<void> {
  const cleanCfg: PrinterConfig = {
    tongPrinterName: (config.tongPrinterName || '').trim(),
    comPrinterName: (config.comPrinterName || '').trim(),
    nuocPrinterName: (config.nuocPrinterName || '').trim(),
  };

  localStorage.setItem(PRINTER_CONFIG_STORAGE_KEY, JSON.stringify(cleanCfg));
  broadcastSystemEvent('canteen_printer_config_updated', cleanCfg);

  if (isSupabaseConfigured && supabase) {
    const payload = {
      ...cleanCfg,
      updated_by: actor?.name || 'Admin',
      updated_at: new Date().toISOString(),
    };

    try {
      await Promise.allSettled([
        supabase.from('settings').upsert({
          key: 'printer_config',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('settings').upsert({
          key: 'pos_printers',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('system_settings').upsert({
          key: 'printer_config',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
        supabase.from('system_settings').upsert({
          key: 'pos_printers',
          value: payload,
          updated_at: new Date().toISOString(),
        }),
      ]);
    } catch (e) {
      console.warn('Sync printer config to supabase warning:', e);
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
      if (payload.table === 'system_settings') {
        changedTables.add('qr_exception_tokens');
      }
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
        fetchAutoPrintConfig().catch(() => {});
        fetchPrinterConfig().catch(() => {});
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
      if (ev.data.type === 'canteen_new_order_inserted' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('canteen_new_order_inserted', { detail: ev.data.payload || ev.data })
        );
      }
      if (ev.data.type === 'canteen_auto_print_updated' && typeof window !== 'undefined') {
        const autoCfg: AutoPrintConfig = ev.data.cfg || {
          enabled: Boolean(ev.data.enabled),
          updatedBy: ev.data.updatedBy || 'Admin',
          updatedAt: ev.data.updatedAt || new Date().toISOString(),
        };
        window.dispatchEvent(
          new CustomEvent('canteen_auto_print_updated', { detail: autoCfg })
        );
      }
      if (ev.data.type === 'canteen_printer_config_updated' && typeof window !== 'undefined') {
        const pCfg: PrinterConfig = ev.data.config || {
          tongPrinterName: ev.data.tongPrinterName || '',
          comPrinterName: ev.data.comPrinterName || '',
          nuocPrinterName: ev.data.nuocPrinterName || '',
        };
        window.dispatchEvent(
          new CustomEvent('canteen_printer_config_updated', { detail: pCfg })
        );
      }
      if (ev.data.type === 'canteen_site_updated' && typeof window !== 'undefined') {
        if (ev.data.site) {
          const current = getCachedSites();
          const updated = current.map((s) => (s.code === ev.data.siteCode ? ev.data.site : s));
          setCachedSites(updated);
        }
        window.dispatchEvent(
          new CustomEvent('canteen_site_updated', { detail: ev.data })
        );
      }
      triggerDebounced(ev.data);
    }
  };

  const EVENT_NAMES = [
    'canteen_order_created',
    'canteen_order_placed',
    'canteen_order_updated',
    'canteen_order_cancelled',
    'canteen_new_order_inserted',
    'canteen_menu_updated',
    'canteen_wallet_updated',
    'canteen_user_status_changed',
    'canteen_time_gate_updated',
    'canteen_auto_print_updated',
    'canteen_printer_config_updated',
    'canteen_qr_token_updated',
    'canteen_site_updated',
    'canteen_site_changed',
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

    // Dùng chung tên kênh canteen-global-sync để tất cả thiết bị và client đều nhận được broadcast
    const channelName = 'canteen-global-sync';
    const channel = supabase
      .channel(channelName, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('canteen_new_order_inserted', { detail: payload.new }));
          window.dispatchEvent(new CustomEvent('canteen_order_created', { detail: { order: payload.new } }));
        }
        if (broadcastSyncChannel) {
          broadcastSyncChannel.postMessage({ type: 'canteen_new_order_inserted', payload: payload.new });
        }
        triggerDebounced(payload);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('canteen_order_updated', { detail: payload.new }));
          if (payload.new?.payment_status === 'paid') {
            window.dispatchEvent(new CustomEvent('canteen_payment_confirmed', { detail: payload.new }));
          }
        }
        if (broadcastSyncChannel) {
          broadcastSyncChannel.postMessage({ type: 'canteen_order_updated', payload: payload.new });
          if (payload.new?.payment_status === 'paid') {
            broadcastSyncChannel.postMessage({ type: 'canteen_payment_confirmed', payload: payload.new });
          }
        }
        triggerDebounced(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_exception_tokens' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (p) => triggerDebounced(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, (p) => {
        getSites().then((s) => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_site_updated', { detail: { sites: s } }));
          }
        }).catch(() => {});
        triggerDebounced(p);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, (p) => {
        getSites().then((s) => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_site_updated', { detail: { sites: s } }));
          }
        }).catch(() => {});
        triggerDebounced(p);
      })
      .on('broadcast', { event: 'canteen_sync' }, (p) => {
        const payload = p?.payload || p;
        if (payload?.type === 'canteen_new_order_inserted' || payload?.type === 'canteen_order_created' || payload?.type === 'canteen_order_placed') {
          const ord = payload.order || payload.payload || payload;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_new_order_inserted', { detail: ord }));
            window.dispatchEvent(new CustomEvent('canteen_order_created', { detail: payload }));
          }
        }
        if (payload?.type === 'canteen_payment_confirmed' || payload?.type === 'canteen_order_updated') {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_order_updated', { detail: payload }));
            window.dispatchEvent(new CustomEvent('canteen_payment_confirmed', { detail: payload }));
          }
        }
        if (payload?.type === 'canteen_site_updated') {
          if (payload?.site) {
            const current = getCachedSites();
            const updated = current.map((s) => (s.code === payload.siteCode ? payload.site : s));
            setCachedSites(updated);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('canteen_site_updated', { detail: payload }));
          }
        }
        triggerDebounced(payload);
      })
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
    siteId: row.site_id || undefined,
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
  const rawSite = row.site_id ? String(row.site_id).toLowerCase().trim() : '';
  const siteId =
    (rawSite === 'hung_vuong' || rawSite === 'g_group')
      ? rawSite
      : (Array.isArray(row.available_site_ids) && row.available_site_ids.length === 1 && (row.available_site_ids[0] === 'hung_vuong' || row.available_site_ids[0] === 'g_group')
        ? row.available_site_ids[0]
        : 'hung_vuong');
  const availableSiteIds =
    Array.isArray(row.available_site_ids) && row.available_site_ids.length > 0
      ? row.available_site_ids.filter((s: any) => s === 'hung_vuong' || s === 'g_group')
      : [siteId];

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
    siteId,
    availableSiteIds,
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

// ============================================================
// ĐÁNH DẤU TRẠNG THÁI IN BILL (TỔNG / CƠM / NƯỚC)
// ============================================================

export type BillType = 'tong' | 'com' | 'nuoc';

/**
 * Kiểm tra xem đơn hàng cần những loại bill nào (Tổng, Cơm, Nước)
 */
export function getOrderBillRequirements(order: Order, menuList: MenuItem[] = []): {
  hasTotal: boolean;
  hasFood: boolean;
  hasDrink: boolean;
} {
  const tickets = getOrderTickets(order, menuList);
  return {
    hasTotal: true,
    hasFood: tickets.some((t) => t.ticketType === 'food'),
    hasDrink: tickets.some((t) => t.ticketType === 'drink'),
  };
}

/**
 * Kiểm tra xem một đơn hàng đã được in đủ tất cả các bill cần thiết hay chưa
 */
export function isOrderFullyPrinted(order: Order, menuList: MenuItem[] = []): boolean {
  if (!order.printedTongAt) return false;
  const { hasFood, hasDrink } = getOrderBillRequirements(order, menuList);
  if (hasFood && !order.printedComAt) return false;
  if (hasDrink && !order.printedNuocAt) return false;
  return true;
}

/**
 * Đánh dấu một loại bill của đơn hàng đã được in thành công
 */
export async function markBillPrinted(orderId: string, billType: BillType): Promise<void> {
  const column = { tong: 'printed_tong_at', com: 'printed_com_at', nuoc: 'printed_nuoc_at' }[billType];
  const fieldKey = { tong: 'printedTongAt', com: 'printedComAt', nuoc: 'printedNuocAt' }[billType] as keyof Order;
  const now = new Date().toISOString();

  // 1. Cập nhật cache cục bộ ngay lập tức để UI phản hồi tức thì
  try {
    const all = getCachedOrders();
    const updated = all.map((o) => (o.id === orderId ? { ...o, [fieldKey]: now } : o));
    setCachedOrders(updated);
  } catch {}

  // 2. Broadcast sự kiện đa tab & custom event
  broadcastSystemEvent('canteen_order_updated', { orderId, billType, [fieldKey]: now });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('canteen_order_updated', { detail: { orderId, billType, [fieldKey]: now } })
    );
  }

  // 3. Ghi vào bảng orders trên Supabase (nếu cấu hình)
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('orders').update({ [column]: now }).eq('id', orderId);
    } catch (e) {
      console.warn(`[markBillPrinted] Note updating ${column}:`, e);
    }
  }
}

/**
 * Hủy đánh dấu đã in (chuyển về chưa in) cho một loại bill
 */
export async function unmarkBillPrinted(orderId: string, billType: BillType): Promise<void> {
  const column = { tong: 'printed_tong_at', com: 'printed_com_at', nuoc: 'printed_nuoc_at' }[billType];
  const fieldKey = { tong: 'printedTongAt', com: 'printedComAt', nuoc: 'printedNuocAt' }[billType] as keyof Order;

  // 1. Cập nhật cache cục bộ
  try {
    const all = getCachedOrders();
    const updated = all.map((o) => (o.id === orderId ? { ...o, [fieldKey]: undefined } : o));
    setCachedOrders(updated);
  } catch {}

  // 2. Broadcast sự kiện đa tab & custom event
  broadcastSystemEvent('canteen_order_updated', { orderId, billType, [fieldKey]: null });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('canteen_order_updated', { detail: { orderId, billType, [fieldKey]: null } })
    );
  }

  // 3. Ghi vào Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('orders').update({ [column]: null }).eq('id', orderId);
    } catch (e) {
      console.warn(`[unmarkBillPrinted] Note updating ${column}:`, e);
    }
  }
}

export function mapOrder(row: any): Order {
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
    orderCode: row.order_code || row.orderCode || row.id,
    userId: row.user_id || row.userId,
    userName: row.user_name || row.userName || '',
    userPhone: row.user_phone || row.userPhone || '',
    userDepartment: row.user_department || row.userDepartment || '',
    items: mappedItems,
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    deliveryMethod: row.delivery_method || row.deliveryMethod || 'dine_in',
    roomNumber: row.room_number || row.roomNumber || '',
    pickupTime: row.pickup_time || row.pickupTime || '11:30',
    targetDate: row.target_date || row.targetDate || row.meal_date || row.order_date || '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    status: row.status || 'confirmed',
    cancellationDeadline: row.cancellation_deadline || row.cancellationDeadline || '16:00',
    cancelledAt: row.cancelled_at || row.cancelledAt,
    cancelReason: row.cancel_reason || row.cancelReason,
    printedTongAt: row.printed_tong_at || row.printedTongAt,
    printedComAt: row.printed_com_at || row.printedComAt,
    printedNuocAt: row.printed_nuoc_at || row.printedNuocAt,
    note: finalNote,
    notes: finalNote,
    isExceptionOrder: Boolean(row.is_exception_order || row.isExceptionOrder || row.used_qr_token || row.exceptionTokenUsed),
    exceptionTokenUsed: row.exception_token_used || row.exceptionTokenUsed || row.used_qr_token || '',
    deviceInfo: row.device_info || row.deviceInfo,
    siteId: row.site_id || row.siteId || 'hung_vuong',
    isGuest: Boolean(row.is_guest !== undefined ? row.is_guest : row.isGuest),
    guestName: row.guest_name || row.guestName || '',
    guestPhone: row.guest_phone || row.guestPhone || '',
    paymentMethod: row.payment_method || row.paymentMethod || ((row.is_guest || row.isGuest) ? 'cash' : 'wallet'),
    paymentStatus: row.payment_status || row.paymentStatus || ((row.is_guest || row.isGuest) ? 'pending' : 'paid'),
    paymentConfirmedAt: row.payment_confirmed_at || row.paymentConfirmedAt,
    paymentConfirmedBy: row.payment_confirmed_by || row.paymentConfirmedBy,
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
    siteId: row.site_id || undefined,
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
