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
  getCachedUserProfile,
  setCachedUserProfile,
  getUsers,
  getCachedUsers,
  setCachedUsers,
  updateUserWallet,
  getMenu,
  getAllMenuItems,
  getCachedMenu,
  setCachedMenu,
  DEFAULT_MENU_ITEMS,
  seedMenuToSupabase,
  createMenuItem,
  updateMenuItem,
  placeOrder,
  cancelOrder,
  getOrders,
  getCachedOrders,
  setCachedOrders,
  updateOrderStatus,
  createUserByAdmin,
  approveUserAndFundWallet,
  fileToBase64,
  getCustomTimeGateConfig,
  fetchTimeGateConfig,
  setCustomTimeGateConfig,
  createQRToken,
  getQRTokens,
  getCachedQRTokens,
  setCachedQRTokens,
  getTimeGateStatus,
  subscribeRealtime,
  withQueryTimeout,
  parseItemsFromNote,
  isValidUuid,
  generateUUID,
} from './services/canteenApi';

// Utils
export { detectCurrentDevice } from './utils/deviceDetector';
export type { DeviceInfo } from './utils/deviceDetector';
export { getTomorrowStr, getTodayStr, formatVnd } from './utils/date';
