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
    wallet_balance NUMERIC NOT NULL DEFAULT 1040000,
    monthly_allowance NUMERIC NOT NULL DEFAULT 1040000,
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

-- Bổ sung cột quản lý tài khoản cho bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

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
-- CẤU HÌNH ROW LEVEL SECURITY (RLS) PHÂN QUYỀN TOÀN DIỆN CHO PRODUCTION
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

ALTER TABLE qr_exception_tokens DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All qr_tokens" ON qr_exception_tokens;
DROP POLICY IF EXISTS "Public read qr_tokens" ON qr_exception_tokens;
DROP POLICY IF EXISTS "All write qr_tokens" ON qr_exception_tokens;
DROP POLICY IF EXISTS "Enable read access for all users" ON qr_exception_tokens;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON qr_exception_tokens;
CREATE POLICY "All qr_tokens" ON qr_exception_tokens FOR ALL TO public USING (true) WITH CHECK (true);

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
('giaovien.toan@canteen.edu.vn', 'Cô Nguyễn Mai Anh', 'teacher', 'Giáo viên Toán', 'Phòng 204 Nhà B', 1040000, 1040000, true)
ON CONFLICT (email) DO UPDATE SET
  wallet_balance = EXCLUDED.wallet_balance,
  is_active = true;

-- ========================================================
-- RESET VÍ HÀNG THÁNG CHO GIÁO VIÊN (PG_CRON)
-- ========================================================
-- Kích hoạt pg_cron nếu chưa có
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Hàm reset ví hàng tháng cho toàn bộ giáo viên (role = 'teacher')
CREATE OR REPLACE FUNCTION reset_monthly_wallets()
RETURNS void AS $$
DECLARE
  target_amount NUMERIC := 1040000;
  affected RECORD;
BEGIN
  FOR affected IN
    SELECT id, wallet_balance FROM users WHERE role = 'teacher'
  LOOP
    -- Ghi lịch sử TRƯỚC khi reset, để báo cáo biết được số dư còn lại cuối tháng trước khi bị reset
    INSERT INTO wallet_transactions (user_id, amount, type, balance_after, note, created_at)
    VALUES (
      affected.id,
      target_amount - affected.wallet_balance,
      'monthly_reset',
      target_amount,
      'Tự động reset ví đầu tháng — số dư cuối tháng trước: ' || affected.wallet_balance || 'đ',
      now()
    );

    -- Reset về đúng mức ví tháng mới
    UPDATE users
    SET wallet_balance = target_amount,
        monthly_allowance = target_amount,
        updated_at = now()
    WHERE id = affected.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Lên lịch chạy đúng 00:05 ngày 1 mỗi tháng (giờ UTC — tương đương 07:05 giờ Việt Nam)
SELECT cron.schedule(
  'monthly-wallet-reset',
  '5 0 1 * *',
  $$SELECT reset_monthly_wallets();$$
);

-- ========================================================
-- PHẦN MỞ RỘNG: ĐA SITE (HÙNG VƯƠNG & G-GROUP) VÀ ĐẶT MÓN KHÁCH LẺ
-- ========================================================

-- 0. GỠ BỎ TẤT CẢ KHÓA NGOẠI CŨ LIÊN QUAN ĐẾN site_id, payment_confirmed_by VÀ BẢNG sites TRƯỚC TIÊN
-- (Khắc phục triệt để lỗi ERROR 42804: foreign key constraint cannot be implemented khi chuyển đổi cột từ UUID sang TEXT)
DO $$
DECLARE
  fk RECORD;
BEGIN
  -- 1. Xoá các constraint tên cố định thường gặp nếu có
  BEGIN ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_confirmed_by_fkey; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE users DROP CONSTRAINT IF EXISTS users_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE qr_exception_tokens DROP CONSTRAINT IF EXISTS qr_exception_tokens_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;

  -- 2. Quét động mọi foreign key ràng buộc cột site_id hoặc payment_confirmed_by
  FOR fk IN (
    SELECT tc.table_schema, tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (
        kcu.column_name IN ('site_id', 'payment_confirmed_by')
        OR tc.constraint_name ILIKE '%site_id%'
        OR tc.constraint_name ILIKE '%payment_confirmed_by%'
      )
  ) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I CASCADE', fk.table_schema, fk.table_name, fk.constraint_name);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;

  -- 3. Quét động mọi foreign key tham chiếu tới bảng sites
  FOR fk IN (
    SELECT tc.table_schema, tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'sites'
  ) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I CASCADE', fk.table_schema, fk.table_name, fk.constraint_name);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- 1. Bảng Sites (Cơ sở Căn tin)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sites') THEN
    -- Đảm bảo có cột code
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'sites' AND column_name = 'code'
    ) THEN
      ALTER TABLE sites ADD COLUMN code TEXT;
    END IF;

    -- Nếu cột id đang là kiểu UUID, chuyển sang TEXT an toàn
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'sites' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN
      ALTER TABLE sites ALTER COLUMN id DROP DEFAULT;
      ALTER TABLE sites ALTER COLUMN id TYPE TEXT USING COALESCE(code, id::text);
    END IF;
  ELSE
    -- Tạo mới bảng sites với id kiểu TEXT
    CREATE TABLE sites (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        bank_name TEXT DEFAULT '',
        bank_account_no TEXT DEFAULT '',
        bank_account_name TEXT DEFAULT '',
        bank_qr_image_url TEXT DEFAULT '',
        bank_account_info JSONB DEFAULT '{}'::jsonb,
        features JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;
END $$;

-- Bổ sung đầy đủ các cột trên bảng sites nếu chưa có
ALTER TABLE sites ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS bank_account_no TEXT DEFAULT '';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS bank_account_name TEXT DEFAULT '';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS bank_qr_image_url TEXT DEFAULT '';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS bank_account_info JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE sites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Đảm bảo constraint UNIQUE cho cột code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_code_key'
  ) THEN
    ALTER TABLE sites ADD CONSTRAINT sites_code_key UNIQUE (code);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Bật RLS và Public Policies cho bảng sites
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read sites" ON sites;
CREATE POLICY "Public read sites" ON sites FOR SELECT USING (true);
DROP POLICY IF EXISTS "All write sites" ON sites;
CREATE POLICY "All write sites" ON sites FOR ALL USING (true) WITH CHECK (true);

-- 2. Thêm cột site_id và các trường khách lẻ trên các bảng nghiệp vụ
-- Chuyển đổi an toàn cột site_id và payment_confirmed_by từ UUID sang TEXT nếu trước đó đã bị tạo kiểu UUID trên database
DO $$
BEGIN
  -- orders.site_id
  BEGIN ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'site_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE orders ALTER COLUMN site_id DROP DEFAULT;
    ALTER TABLE orders ALTER COLUMN site_id TYPE TEXT USING site_id::text;
    ALTER TABLE orders ALTER COLUMN site_id SET DEFAULT 'hung_vuong';
  END IF;

  -- orders.payment_confirmed_by
  BEGIN ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_confirmed_by_fkey; EXCEPTION WHEN others THEN NULL; END;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'payment_confirmed_by' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE orders ALTER COLUMN payment_confirmed_by DROP DEFAULT;
    ALTER TABLE orders ALTER COLUMN payment_confirmed_by TYPE TEXT USING payment_confirmed_by::text;
    ALTER TABLE orders ALTER COLUMN payment_confirmed_by SET DEFAULT '';
  END IF;

  -- users.site_id
  BEGIN ALTER TABLE users DROP CONSTRAINT IF EXISTS users_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'site_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE users ALTER COLUMN site_id DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN site_id TYPE TEXT USING site_id::text;
    ALTER TABLE users ALTER COLUMN site_id SET DEFAULT 'hung_vuong';
  END IF;

  -- menu_items.site_id
  BEGIN ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'menu_items' AND column_name = 'site_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE menu_items ALTER COLUMN site_id DROP DEFAULT;
    ALTER TABLE menu_items ALTER COLUMN site_id TYPE TEXT USING site_id::text;
  END IF;

  -- menu_items.available_site_ids (chuyển đổi từ uuid[] sang text[] nếu trước đó bị tạo kiểu uuid[])
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'menu_items' 
      AND column_name = 'available_site_ids' 
      AND udt_name <> '_text'
  ) THEN
    ALTER TABLE menu_items ALTER COLUMN available_site_ids DROP DEFAULT;
    ALTER TABLE menu_items ALTER COLUMN available_site_ids TYPE TEXT[] USING ARRAY['hung_vuong', 'g_group']::text[];
    ALTER TABLE menu_items ALTER COLUMN available_site_ids SET DEFAULT ARRAY['hung_vuong', 'g_group']::text[];
  END IF;

  -- qr_exception_tokens.site_id
  BEGIN ALTER TABLE qr_exception_tokens DROP CONSTRAINT IF EXISTS qr_exception_tokens_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'qr_exception_tokens' AND column_name = 'site_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE qr_exception_tokens ALTER COLUMN site_id DROP DEFAULT;
    ALTER TABLE qr_exception_tokens ALTER COLUMN site_id TYPE TEXT USING site_id::text;
    ALTER TABLE qr_exception_tokens ALTER COLUMN site_id SET DEFAULT 'hung_vuong';
  END IF;

  -- wallet_transactions.site_id
  BEGIN ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_site_id_fkey; EXCEPTION WHEN others THEN NULL; END;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_transactions' AND column_name = 'site_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE wallet_transactions ALTER COLUMN site_id DROP DEFAULT;
    ALTER TABLE wallet_transactions ALTER COLUMN site_id TYPE TEXT USING site_id::text;
    ALTER TABLE wallet_transactions ALTER COLUMN site_id SET DEFAULT 'hung_vuong';
  END IF;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS site_id TEXT DEFAULT 'hung_vuong';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_name TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_phone TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'wallet';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT DEFAULT '';

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS available_site_ids TEXT[] DEFAULT ARRAY['hung_vuong', 'g_group']::text[];
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS site_id TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS site_id TEXT DEFAULT 'hung_vuong';
ALTER TABLE qr_exception_tokens ADD COLUMN IF NOT EXISTS site_id TEXT DEFAULT 'hung_vuong';
ALTER TABLE qr_exception_tokens ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE qr_exception_tokens ADD COLUMN IF NOT EXISTS used_count INTEGER DEFAULT 0;
ALTER TABLE qr_exception_tokens ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT false;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS site_id TEXT DEFAULT 'hung_vuong';

-- Chuẩn hóa dữ liệu site_id về mã site hợp lệ
UPDATE orders SET site_id = 'hung_vuong' WHERE site_id IS NULL OR site_id = '' OR site_id NOT IN ('hung_vuong', 'g_group');
UPDATE users SET site_id = 'hung_vuong' WHERE site_id IS NULL OR site_id = '' OR site_id NOT IN ('hung_vuong', 'g_group');

-- 3. Cấu hình linh hoạt khoá ngoại orders_user_id_fkey & bản ghi Khách lẻ
-- Cho phép orders.user_id có thể là NULL để khách lẻ hoặc đơn vãng lai không bao giờ bị chặn bởi khoá ngoại
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
  ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  -- Tạo user guest với ID cố định nếu chưa có
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = '00000000-0000-4000-8000-000000000001') THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'guest@canteen.local') THEN
      INSERT INTO users (id, email, name, role, role_title, department, wallet_balance, monthly_allowance, is_active, site_id)
      VALUES (
        '00000000-0000-4000-8000-000000000001',
        'guest@canteen.local',
        'Khách Vãng Lai Căn Tin',
        'teacher',
        'Khách hàng',
        'Khách lẻ vãng lai',
        0,
        0,
        true,
        'g_group'
      );
    ELSE
      UPDATE users SET is_active = true WHERE email = 'guest@canteen.local';
    END IF;
  ELSE
    UPDATE users SET is_active = true WHERE id = '00000000-0000-4000-8000-000000000001';
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 4. Seed dữ liệu 2 Site mặc định
INSERT INTO sites (id, code, name, description, bank_name, bank_account_no, bank_account_name, bank_qr_image_url, bank_account_info, features)
VALUES
(
    'hung_vuong',
    'hung_vuong',
    'Đại học Hùng Vương',
    'Cơ sở Đại học Hùng Vương — Dành cho Giáo viên & Cán bộ nhân viên',
    '',
    '',
    '',
    '',
    '{}'::jsonb,
    '{"qrException": true, "staffTab": true, "wallet": true, "timeGate": true, "guestOrder": false}'::jsonb
),
(
    'g_group',
    'g_group',
    'Canteen G-Group',
    'Cơ sở Canteen G-Group — Phục vụ Cán bộ và Khách hàng lẻ',
    'MB Bank (Quân Đội)',
    '999988886666',
    'CANTEEN G-GROUP',
    'https://img.vietqr.io/image/MB-999988886666-compact2.png',
    '{"bankName": "MB Bank (Ngân hàng TMCP Quân Đội)", "accountNumber": "999988886666", "accountHolder": "CANTEEN G-GROUP", "qrImageUrl": "https://img.vietqr.io/image/MB-999988886666-compact2.png", "instructionNote": "Vui lòng ghi đúng nội dung chuyển khoản kèm mã đơn hàng để hệ thống tự động nhận diện thanh toán."}'::jsonb,
    '{"qrException": false, "staffTab": false, "wallet": false, "timeGate": false, "guestOrder": true}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
    id = EXCLUDED.id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    bank_name = EXCLUDED.bank_name,
    bank_account_no = EXCLUDED.bank_account_no,
    bank_account_name = EXCLUDED.bank_account_name,
    bank_qr_image_url = EXCLUDED.bank_qr_image_url,
    bank_account_info = EXCLUDED.bank_account_info,
    features = EXCLUDED.features;

-- Thêm lại khoá ngoại mềm an toàn trỏ tới sites(id) nếu có nhu cầu
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_site_id_fkey') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 5. Cập nhật menu_items hiện có cho phép bán trên cả 2 site
DO $$
BEGIN
  -- Đảm bảo cột available_site_ids mang kiểu TEXT[] an toàn
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'menu_items' 
      AND column_name = 'available_site_ids' 
      AND udt_name <> '_text'
  ) THEN
    ALTER TABLE menu_items ALTER COLUMN available_site_ids DROP DEFAULT;
    ALTER TABLE menu_items ALTER COLUMN available_site_ids TYPE TEXT[] USING ARRAY['hung_vuong', 'g_group']::text[];
    ALTER TABLE menu_items ALTER COLUMN available_site_ids SET DEFAULT ARRAY['hung_vuong', 'g_group']::text[];
  END IF;

  UPDATE menu_items 
  SET available_site_ids = ARRAY['hung_vuong', 'g_group']::text[] 
  WHERE available_site_ids IS NULL;
END $$;

-- 6. RPC: Xác nhận thanh toán khách lẻ (confirm_guest_payment)
CREATE OR REPLACE FUNCTION confirm_guest_payment(p_order_id UUID, p_admin_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    UPDATE orders
    SET payment_status = 'paid',
        status = 'confirmed',
        payment_confirmed_at = now(),
        payment_confirmed_by = COALESCE(p_admin_id, 'Quản lý Căn tin'),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'payment_status', 'paid');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Từ chối thanh toán khách lẻ & hoàn lại tồn kho (reject_guest_payment)
CREATE OR REPLACE FUNCTION reject_guest_payment(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    item RECORD;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    -- Nếu đơn đã hủy hoặc từ chối trước đó, không hoàn tồn kho lần 2 (chống hoàn lặp)
    IF v_order.status = 'cancelled' OR v_order.payment_status = 'rejected' THEN
        RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'payment_status', 'rejected', 'already_handled', true);
    END IF;

    -- Hoàn lại tồn kho cho từng món ăn VÀ ĐẢM BẢO KHÔNG VƯỢT QUÁ SỐ LƯỢNG CHUẨN BỊ BAN ĐẦU (prepared_stock)
    FOR item IN SELECT menu_item_id, quantity FROM order_items WHERE order_id = p_order_id LOOP
        IF item.menu_item_id IS NOT NULL THEN
            UPDATE menu_items
            SET current_stock = LEAST(COALESCE(prepared_stock, current_stock), current_stock + item.quantity),
                updated_at = now()
            WHERE id = item.menu_item_id;
        END IF;
    END LOOP;

    -- Cập nhật đơn thành rejected / cancelled
    UPDATE orders
    SET payment_status = 'rejected',
        status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(p_reason, 'Nhân viên từ chối thanh toán'),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'payment_status', 'rejected');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Thêm sites vào Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE sites;
  EXCEPTION
    WHEN others THEN NULL;
  END;
END $$;

