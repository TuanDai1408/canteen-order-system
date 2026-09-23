# Hệ thống Quản lý & Đặt Suất ăn Canteen Học Đường (Monorepo)

Hệ thống chuyên nghiệp phục vụ đặt suất ăn trưa và quản lý vận hành căn tin trường học, kết nối trực tiếp với Supabase Cloud.

## Cấu trúc dự án

- `apps/order` – Ứng dụng đặt món dành cho Cán bộ & Giáo viên (Cổng thời gian, Ví suất ăn, Đặt trước ngày mai, Mã QR ngoại lệ).
- `apps/portal` – Portal dành cho Quản lý Căn tin, Bếp trưởng & Ban Giám hiệu (Điều phối bếp, Quản lý thực đơn, Duyệt tài khoản cán bộ, Cấp hạn mức ví).
- `packages/shared` – Thư viện dùng chung (Types, Supabase Client, Caching, Resilience helpers).

---

## 🚀 Hướng dẫn Kết nối Dữ liệu Supabase Thật

Tất cả bảng dữ liệu, cấu hình quyền RLS (Row Level Security) và 10 món ăn thực tế đã được chuẩn bị sẵn tại file **`supabase_setup.sql`** ở thư mục gốc:

1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/dashboard) -> Chọn project của bạn.
2. Vào mục **SQL Editor** ở thanh menu bên trái.
3. Mở file `supabase_setup.sql` trong dự án, copy toàn bộ nội dung và dán vào SQL Editor.
4. Nhấn **Run** (Chạy).
   - Đã loại bỏ hoàn toàn chức năng & bảng `audit_logs` (Nhật ký hệ thống).
   - Tự động nạp sẵn 10 món ăn đặc sắc kèm hình ảnh và giá niêm yết.
   - Kích hoạt phân quyền đọc/ghi mượt mà, sẵn sàng kiểm thử.
   - Tài khoản `trantuandai2508@gmail.com` được nạp sẵn quyền Admin và hạn mức ví 2.000.000đ.

---

## ⚡ Kiểm thử ứng dụng

### Chạy cả 2 ứng dụng cùng lúc:
```bash
# Cài đặt thư viện
npm install

# Build kiểm tra
npm run build

# Khởi chạy App Đặt Món (Order) - Port 3000
npm run dev -w order

# Khởi chạy App Quản Trị (Portal) - Port 3001
npm run dev -w portal
```

---

## 📦 Xuất bản lên GitHub (Publish to GitHub)

Khi đã kiểm thử hoàn tất, chạy các lệnh sau để đẩy mã nguồn lên kho lưu trữ GitHub của bạn:

```bash
# 1. Khởi tạo Git repository (nếu chưa có)
git init

# 2. Thêm tất cả các file
git add .

# 3. Commit thay đổi
git commit -m "feat: hoàn thiện hệ thống canteen học đường, tối ưu tốc độ và kết nối supabase thật"

# 4. Đổi tên nhánh chính thành main
git branch -M main

# 5. Liên kết tới repository GitHub của bạn
git remote add origin https://github.com/<tai-khoan-cua-ban>/<ten-repo>.git

# 6. Push lên GitHub
git push -u origin main
```

---

## 🌐 Deploy lên Vercel

### Project Order (App Đặt món)
1. Import repository từ GitHub vào Vercel.
2. Thiết lập **Root Directory** = `apps/order`
3. Framework Preset = `Vite`
4. Build Command = `npm run build`
5. Output Directory = `dist`
6. Thêm Environment Variables:
   - `VITE_SUPABASE_URL`: URL Supabase của bạn
   - `VITE_SUPABASE_ANON_KEY`: Anon Key của bạn

### Project Portal (Quản trị & Bếp)
1. Thêm một Project mới trên Vercel từ cùng repository GitHub.
2. Thiết lập **Root Directory** = `apps/portal`
3. Thêm các biến môi trường tương tự như trên.

