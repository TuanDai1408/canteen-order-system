-- ========================================================
-- CANTEEN HỌC ĐƯỜNG - SUPABASE SCHEMA & SEED DATA
-- Chạy đoạn mã này trong Supabase Dashboard -> SQL Editor
-- ========================================================

-- 1. Xóa bảng Nhật ký hệ thống cũ (nếu có)
DROP TABLE IF EXISTS audit_logs CASCADE;

-- 2. Bảng thực đơn món ăn (menu_items)
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Cơm trưa',
    description TEXT DEFAULT '',
    price NUMERIC NOT NULL DEFAULT 35000,
    image_url TEXT DEFAULT '',
    prepared_stock INTEGER NOT NULL DEFAULT 50,
    current_stock INTEGER NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT true,
    for_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Bảng hồ sơ cán bộ & ví (users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    role_title TEXT DEFAULT 'Giáo viên',
    department TEXT DEFAULT 'Tổ Chuyên Môn',
    phone_number TEXT DEFAULT '',
    default_room TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    wallet_balance NUMERIC NOT NULL DEFAULT 1000000,
    monthly_allowance NUMERIC NOT NULL DEFAULT 1000000,
    last_wallet_reset_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Bảng đơn hàng (orders)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL DEFAULT '',
    user_phone TEXT DEFAULT '',
    user_department TEXT DEFAULT '',
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_date DATE DEFAULT CURRENT_DATE,
    delivery_method TEXT NOT NULL DEFAULT 'dine_in',
    room_number TEXT DEFAULT '',
    pickup_time TEXT NOT NULL DEFAULT '11:30',
    total_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmed',
    used_qr_token TEXT,
    is_exception_order BOOLEAN NOT NULL DEFAULT false,
    exception_token_used TEXT,
    device_info JSONB,
    note TEXT DEFAULT '',
    cancellation_deadline TEXT DEFAULT '16:00',
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Đảm bảo các cột mở rộng luôn có mặt trên bảng orders nếu bảng đã tồn tại từ trước
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meal_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_email TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_phone TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_department TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_exception_order BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exception_token_used TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS used_qr_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS device_info JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_deadline TEXT DEFAULT '16:00';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 5. Bảng chi tiết món trong đơn (order_items)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    image_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Đảm bảo các cột trên order_items luôn có mặt đầy đủ
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL;

-- 6. Bảng mã QR ngoại lệ (qr_exception_tokens)
CREATE TABLE IF NOT EXISTS qr_exception_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    created_by UUID,
    created_by_name TEXT DEFAULT '',
    is_used BOOLEAN NOT NULL DEFAULT false,
    used_by UUID,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Bảng cài đặt hệ thống & khung giờ đặt món
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Bảng biến động số dư ví (wallet_transactions)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL DEFAULT 'order',
    reference_id TEXT,
    balance_after NUMERIC,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================================
-- CẤU HÌNH ROW LEVEL SECURITY (RLS) CHO PHÉP ĐỌC / GHI ĐỂ TEST
-- ========================================================
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_exception_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Tạo policies cho phép cả anon và authenticated truy cập
DROP POLICY IF EXISTS "Public read menu_items" ON menu_items;
CREATE POLICY "Public read menu_items" ON menu_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "All write menu_items" ON menu_items;
CREATE POLICY "All write menu_items" ON menu_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read users" ON users;
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "All write users" ON users;
CREATE POLICY "All write users" ON users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read orders" ON orders;
CREATE POLICY "Public read orders" ON orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "All write orders" ON orders;
CREATE POLICY "All write orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read order_items" ON order_items;
CREATE POLICY "Public read order_items" ON order_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "All write order_items" ON order_items;
CREATE POLICY "All write order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "All qr_tokens" ON qr_exception_tokens;
CREATE POLICY "All qr_tokens" ON qr_exception_tokens FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "All settings" ON settings;
CREATE POLICY "All settings" ON settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "All system_settings" ON system_settings;
CREATE POLICY "All system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "All wallet_transactions" ON wallet_transactions;
CREATE POLICY "All wallet_transactions" ON wallet_transactions FOR ALL USING (true) WITH CHECK (true);

-- Bật Realtime cho tất cả các bảng cần thiết
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE menu_items, orders, order_items, users, settings, system_settings, qr_exception_tokens;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;

-- ========================================================
-- SEED DATA THẬT: THỰC ĐƠN MÓN ĂN CHUẨN
-- ========================================================
DELETE FROM menu_items;

INSERT INTO menu_items (name, category, description, price, image_url, prepared_stock, current_stock, is_active)
VALUES
('Cơm sườn nướng mật ong', 'Cơm trưa', 'Sườn cốt lết ướp sốt mật ong đậm đà nướng than hoa, kèm chả trứng hấp, đồ chua giòn rụm và canh rau má thịt bằm thanh mát.', 35000, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80', 60, 60, true),
('Cơm gà xối mỡ giòn bì', 'Cơm trưa', 'Đùi gà góc tư chiên xối mỡ da giòn rụm, cơm rang hạt sen dẻo thơm, dưa leo tươi mát và nước mắm tỏi ớt chua ngọt chuẩn vị.', 35000, 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop&q=80', 50, 50, true),
('Cơm cá hồi kho tiêu', 'Cơm trưa', 'Cá hồi Na Uy phi lê kho tiêu đen cay nồng, nước sốt sánh mịn đậm đà, kèm bông cải xanh luộc và canh mồng tơi tôm tươi.', 40000, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop&q=80', 40, 40, true),
('Phở bò tái lăn đặc biệt', 'Bún / Phở', 'Bánh phở tươi mềm mướt, thịt bò bắp hoa xào lăn tỏi thơm lừng, nước dùng hầm xương tủy bò 12 tiếng cùng quế hồi thơm ngọt.', 40000, 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=600&auto=format&fit=crop&q=80', 45, 45, true),
('Bún bò Huế chả cua', 'Bún / Phở', 'Bún sợi to xứ Huế, bắp bò hoa thơm mềm, giò heo giòn sần sật, chả cua biển và nước dùng ruốc sả thơm nức mũi.', 38000, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&auto=format&fit=crop&q=80', 40, 40, true),
('Bún chả giò thịt nướng', 'Bún / Phở', 'Thịt ba chỉ nướng than thơm lừng, chả giò tôm thịt rế vàng giòn, đậu phộng rang giã dập cùng nước mắm chua ngọt thanh tao.', 35000, 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=600&auto=format&fit=crop&q=80', 50, 50, true),
('Cơm chiên hoàng bào chay', 'Món Chay', 'Cơm chiên hạt ngọc hạt sen Huế, nấm hương xào thơm, đậu hũ non chiên giòn, cà rốt, bắp ngọt và dầu mè thơm nức.', 30000, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80', 30, 30, true),
('Hủ tiếu Nam Vang chay', 'Món Chay', 'Hủ tiếu dai Sa Đéc, nấm đùi gà, chả lụa chay, hoành thánh chiên giòn, nước dùng ninh củ cải ngọt tự nhiên không bột ngọt.', 30000, 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop&q=80', 25, 25, true),
('Trà đào cam sả hạt chia', 'Đồ uống / Tráng miệng', 'Trà đen Ceylon ủ lạnh đậm vị, đào ngâm giòn ngọt, nước cam tươi thanh mát và hạt chia hữu cơ bổ dưỡng.', 18000, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80', 80, 80, true),
('Nước ép cam tươi nguyên chất', 'Đồ uống / Tráng miệng', '100% cam sành vắt tươi nguyên chất không thêm đường hoá học, giàu vitamin C tăng cường đề kháng.', 22000, 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80', 60, 60, true);

-- ========================================================
-- SEED DATA THẬT: CÀI ĐẶT KHUNG GIỜ NHẬN ĐƠN
-- ========================================================
INSERT INTO settings (key, value)
VALUES
('time_gate_config', '{"openTime": "06:00", "closeTime": "22:00", "note": "Khung giờ đặt món mở rộng phục vụ thử nghiệm"}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO system_settings (key, value)
VALUES
('time_gate_config', '{"openTime": "06:00", "closeTime": "22:00", "note": "Khung giờ đặt món mở rộng phục vụ thử nghiệm"}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ========================================================
-- SEED DATA THẬT: TÀI KHOẢN ADMIN THỬ NGHIỆM
-- ========================================================
INSERT INTO users (email, name, role, role_title, default_room, wallet_balance, monthly_allowance, is_active)
VALUES
('trantuandai2508@gmail.com', 'Trần Tuấn Đại (Quản trị)', 'admin', 'Quản trị viên Căn tin', 'Văn phòng Căn tin', 2000000, 2000000, true),
('admin@canteen.edu.vn', 'Quản trị viên Canteen', 'admin', 'Quản lý Căn tin', 'Phòng Quản lý A101', 2000000, 2000000, true),
('bep@canteen.edu.vn', 'Bếp Trưởng Nguyễn Văn Tâm', 'executive', 'Bếp trưởng Điều phối', 'Khu Bếp Chính', 1500000, 1500000, true),
('giaovien.toan@canteen.edu.vn', 'Cô Nguyễn Mai Anh', 'teacher', 'Giáo viên Toán', 'Phòng 204 Nhà B', 1000000, 1000000, true)
ON CONFLICT (email) DO UPDATE SET
  wallet_balance = EXCLUDED.wallet_balance,
  is_active = true;
