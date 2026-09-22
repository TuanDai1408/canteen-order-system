# Hệ thống Đặt suất ăn Canteen (Monorepo)

## Cấu trúc

- `apps/order` – Webapp đặt món (giáo viên)
- `apps/portal` – Portal quản lý
- `packages/shared` – Types + Supabase API dùng chung

## Deploy Vercel (quan trọng)

### Project Order
1. Root Directory = `apps/order`
2. Framework = Vite
3. Install Command = `npm install` (hoặc để trống)
4. Build Command = `npm run build`
5. Output Directory = `dist`
6. Node.js = 20.x
7. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Project Portal
Giống trên, Root Directory = `apps/portal`

## Local

```bash
npm install
cd apps/order && npm run dev
cd apps/portal && npm run dev
```
