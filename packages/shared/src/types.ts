export type UserRole = 'teacher' | 'admin' | 'data_entry' | 'executive';

export interface UserProfile {
  id: string;
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
  createdAt?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: 'Cơm trưa' | 'Bún / Phở' | 'Món Chay' | 'Đồ uống / Tráng miệng';
  description: string;
  price: number;
  imageUrl: string;
  preparedStock: number;
  currentStock: number;
  isActive: boolean;
  forDate: string; // YYYY-MM-DD
}

export type DeliveryMethod = 'dine_in' | 'room_delivery';

export type OrderStatus = 'confirmed' | 'preparing' | 'completed' | 'cancelled';

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
  userId: string;
  userName: string;
  userPhone: string;
  userDepartment: string;
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
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  createdByName: string;
  isUsed: boolean;
  usedBy?: string;
  usedAt?: string;
  note?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action:
    | 'STOCK_UPDATE'
    | 'MENU_CREATE'
    | 'MENU_UPDATE'
    | 'ORDER_PLACED'
    | 'ORDER_CANCELLED'
    | 'QR_TOKEN_GENERATED'
    | 'QR_TOKEN_USED'
    | 'WALLET_UPDATE'
    | 'USER_CREATE'
    | 'USER_APPROVED'
    | 'USER_ROLE_CHANGED'
    | 'TIMEGATE_OVERRIDE'
    | 'WALLET_RESET_ALL';
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  details: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
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
  userId: string;
  amount: number;
  type: 'order' | 'refund' | 'allowance' | 'manual';
  referenceId?: string;
  balanceAfter?: number;
  note?: string;
  createdBy?: string;
  createdAt: string;
}
