export type UserRole = 'teacher' | 'admin' | 'super_admin' | 'data_entry' | 'executive';

export type SiteCode = 'all' | 'hung_vuong' | 'g_group';

export interface SiteFeatures {
  qrException: boolean;
  staffTab: boolean;
  wallet: boolean;
  timeGate: boolean;
  guestOrder: boolean;
}

export interface BankAccountInfo {
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  qrImageUrl?: string;
  instructionNote?: string;
}

export interface Site {
  id: string;
  code: SiteCode;
  name: string;
  description?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  bankQrImageUrl?: string;
  bankAccountInfo?: BankAccountInfo;
  features: SiteFeatures;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  authUserId?: string;
  siteId?: string;
  name: string;
  role: UserRole;
  roleTitle: string;
  department: string;
  phoneNumber: string;
  email?: string;
  avatarUrl?: string;
  defaultRoom?: string;
  walletBalance: number;
  monthlyAllowance: number;
  lastWalletResetDate?: string;
  isActive?: boolean;
  isDisabled?: boolean;
  disabledAt?: string;
  createdAt?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  preparedStock: number;
  currentStock: number;
  isActive: boolean;
  forDate?: string; // YYYY-MM-DD
  siteId?: string;
  availableSiteIds?: string[]; // Danh sách site được bán món này (vd: ['hung_vuong', 'g_group'])
}

export type DeliveryMethod = 'dine_in' | 'room_delivery';

export type OrderStatus = 'confirmed' | 'preparing' | 'completed' | 'cancelled';

export type PaymentMethod = 'wallet' | 'cash' | 'bank_transfer';

export type PaymentStatus = 'paid' | 'pending' | 'rejected';

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export interface Order {
  id: string;
  orderCode: string;
  siteId?: string;
  userId: string;
  userName: string;
  userPhone: string;
  userDepartment: string;
  isGuest?: boolean;
  guestName?: string;
  guestPhone?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paymentConfirmedAt?: string;
  paymentConfirmedBy?: string;
  items: OrderItem[];
  totalAmount: number;
  deliveryMethod: DeliveryMethod;
  roomNumber?: string;
  pickupTime: string;
  targetDate: string;
  createdAt: string;
  status: OrderStatus;
  cancellationDeadline: string;
  cancelledAt?: string;
  cancelReason?: string;
  printedTongAt?: string;
  printedComAt?: string;
  printedNuocAt?: string;
  note?: string;
  notes?: string;
  isExceptionOrder?: boolean;
  exceptionTokenUsed?: string;
  deviceInfo?: {
    userAgent: string;
    friendlyDevice: string;
    browser: string;
    os: string;
    ipAddress: string;
  };
}

export interface QRExceptionToken {
  token: string;
  siteId?: string;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  createdByName: string;
  isUsed: boolean;
  isDisabled?: boolean;
  usedBy?: string;
  usedAt?: string;
  note?: string;
  quantity?: number;
  usedCount?: number;
}

export interface TimeGateStatus {
  isOpen: boolean;
  currentHour: number;
  currentMinute: number;
  message: string;
  opensAt: string;
  closesAt: string;
  remainingMinutes?: number;
}

export interface WalletTransaction {
  id: string;
  siteId?: string;
  userId: string;
  amount: number;
  type: 'order' | 'refund' | 'allowance' | 'manual' | 'monthly_reset' | string;
  referenceId?: string;
  balanceAfter?: number;
  note?: string;
  createdBy?: string;
  createdAt: string;
}

export interface PrinterConfig {
  tongPrinterName: string;
  comPrinterName: string;
  nuocPrinterName: string;
}

export interface AutoPrintConfig {
  enabled: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

export type BillType = 'tong' | 'com' | 'nuoc';
