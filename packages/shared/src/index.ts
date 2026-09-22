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
export { supabase } from './lib/supabase';

// API
export {
  login,
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
