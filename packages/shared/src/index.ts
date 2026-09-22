// Types
export type {
  UserRole,
  UserProfile,
  MenuItem,
  DeliveryMethod,
  OrderStatus,
  OrderItem,
  Order,
  QRExceptionToken,
  AuditLog,
  TimeGateStatus,
  WalletTransaction,
} from './types';

// Supabase client
export { supabase, isSupabaseConfigured } from './lib/supabase';

// API
export {
  login,
  signUp,
  logout,
  getSession,
  getCurrentUserProfile,
  getUsers,
  updateUserWallet,
  getMenu,
  getAllMenuItems,
  createMenuItem,
  updateMenuItem,
  placeOrder,
  cancelOrder,
  getOrders,
  updateOrderStatus,
  createUserByAdmin,
  fileToBase64,
  getCustomTimeGateConfig,
  setCustomTimeGateConfig,
  createQRToken,
  getQRTokens,
  getAuditLogs,
  getTimeGateStatus,
  subscribeRealtime,
} from './services/canteenApi';

// Utils
export { detectCurrentDevice } from './utils/deviceDetector';
export type { DeviceInfo } from './utils/deviceDetector';
export { getTomorrowStr, getTodayStr, formatVnd } from './utils/date';
