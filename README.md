# Thanh Lý Từ Đến

Website thanh lý dùng Next.js, React, Tailwind CSS và Supabase. Các trang quản lý
sản phẩm đang dùng Supabase Auth; widget chat dùng API server-side cho khách và
RLS cho hộp thư nhân viên.

## Chạy ứng dụng

Yêu cầu Node.js và npm tương thích với Next.js 16. Cài dependencies rồi chạy:

```powershell
npm install
Copy-Item .env.example .env.local
```

Mở `.env.local` trong editor trên máy của bạn và điền giá trị thật theo mục
[Cấu hình Supabase](#cấu-hình-supabase). Không gửi các giá trị này qua chat, issue
hoặc commit file `.env.local`.

```powershell
npm run dev
```

Mở http://localhost:3000. Để kiểm tra build, dùng `npm run build`. Supabase
client chỉ được khởi tạo khi một thao tác thực sự dùng nó; build có thể hoàn tất
khi chưa có credentials, nhưng các thao tác đăng nhập/quản lý và API chat sẽ cần
env Supabase tương ứng lúc chạy. Các biến server-only không được thêm tiền tố
`NEXT_PUBLIC_`.

## Cấu hình Supabase

### Lấy giá trị từ dự án Supabase hiện có

1. Mở đúng dự án trong Supabase Dashboard.
2. Vào **Project Settings → API Keys** (một số giao diện cũ ghi **Settings → API**).
3. Lấy **Project URL** và **anon/public key** của chính dự án đó:
   - `NEXT_PUBLIC_SUPABASE_URL`: Project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: legacy `anon` key hoặc publishable key.
4. Chỉ cho backend, đặt `SUPABASE_SERVICE_ROLE_KEY` bằng legacy `service_role`
   key. Đây là key có quyền cao, không được đặt trong biến `NEXT_PUBLIC_*`, gửi
   lên Git hoặc đưa vào trình duyệt.
5. Tạo `CHAT_RATE_LIMIT_SECRET` riêng cho ứng dụng, tối thiểu 32 ký tự. Có thể
   sinh cục bộ bằng PowerShell:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Chép kết quả trực tiếp vào `.env.local`; không gửi nó trong cuộc trò chuyện.
6. Lưu file, dừng rồi chạy lại `npm run dev` để Next.js đọc lại biến môi trường.

Để bật AI, đặt `GROQ_API_KEY` và `GROQ_MODEL` trong `.env.local`. Lấy API key từ
tài khoản Groq của bạn; không gửi key qua chat hoặc đưa vào Git. Model mẫu là
`openai/gpt-oss-120b`; Groq hiện tính phí theo token cho model này (tài liệu ghi
$0.15/1M token đầu vào và $0.60/1M token đầu ra). Không gửi tin nhắn AI thử nếu
bạn chưa chấp nhận mức phí và đã kiểm tra giới hạn chi tiêu trong tài khoản.
Build và kiểm thử mã không gọi API sinh nội dung. Chat nhân viên cũng cần backend
Supabase đã có migration chat.

### Dùng Supabase local

Supabase CLI và Docker-compatible runtime cần được cài riêng. CLI không có sẵn
trong dependencies của dự án này. Tạo cấu hình cục bộ bằng `npx supabase init`,
sau đó mới có thể chạy `npx supabase start`. Lấy URL và keys local bằng
`npx supabase status -o env` và đưa chúng vào `.env.local`.

**Lưu ý quan trọng về schema:** repository có các migration lịch sử sửa bảng
`public.products`, nhưng không chứa migration nền tạo bảng đó. Vì vậy, trên một
Supabase hoàn toàn mới, `supabase start`/`supabase db reset` có thể dừng ở các
migration cũ trước khi tới chat. Không xóa hoặc bỏ qua migration cũ để lách lỗi.
Trước khi chạy toàn bộ migrations local, cần có baseline schema đã xác minh của
dự án (ví dụ migration schema đã được chủ dự án rà soát). Nếu chưa có baseline,
hãy chỉ chạy thử trên database disposable đã nạp schema phù hợp, hoặc chuẩn bị
staging tách biệt có backup và schema đã xác minh.

Khi local Supabase đã có schema nền đúng và migrations đã apply thành công:

```powershell
npx supabase test db
npm run test:chat-security
```

Test pgTAP tại `supabase/tests/chat_rls.test.sql` phải chạy trên local/disposable
database. Chưa có kết quả RLS test trong workspace này. Không dùng
`supabase db reset --linked`; lệnh đó nhắm tới database remote đã link và có thể
xóa dữ liệu remote.

### Staging

Chỉ dùng Supabase project riêng cho staging; kiểm tra project ref và dashboard
trước mọi thao tác CLI. Lấy env values từ chính project staging và đặt local vào
`.env.local` để app local kết nối staging nếu cần. Không bật deployment key hoặc
service-role key trong frontend. Trước khi apply migration, xác minh schema nền,
đọc SQL, backup staging, rồi dùng quy trình deploy migration đã được nhóm dự án
phê duyệt. Không chạy test trên production.

## Hướng dẫn hệ thống chat

Chi tiết flow API, RLS, guest token, model Groq, giới hạn và checklist staging
nằm trong [`supabase/CHAT_SECURITY_DESIGN.md`](supabase/CHAT_SECURITY_DESIGN.md).

### Tạo nhân viên chat an toàn

1. Người quản trị tạo/invite tài khoản nhân viên trong Supabase Dashboard →
   Authentication → Users. Không tạo mật khẩu mặc định trong mã nguồn.
2. Xác minh đúng UUID tài khoản, đúng project (local hoặc staging), và migration
   chat đã chạy ở môi trường đó.
3. Người có quyền quản trị DB thêm UUID này vào `public.chat_staff` với
   `is_active = true`; không cấp `service_role` cho nhân viên. Tắt quyền bằng
   cách đặt `is_active = false` khi cần. Ghi nhận thao tác theo quy trình nội bộ.
   Ví dụ sau chỉ chạy thủ công trong đúng local/staging project, sau khi xác
   nhận email và UUID trong Dashboard:

   ```sql
   INSERT INTO public.chat_staff (user_id, is_active)
   SELECT id, true FROM auth.users WHERE email = 'staff@example.com'
   ON CONFLICT (user_id) DO UPDATE SET is_active = EXCLUDED.is_active;
   ```

   Xác nhận câu lệnh tác động đúng một user; nếu không có dòng nào hoặc có vấn
   đề với UUID thì dừng và xác minh trước khi tiếp tục. Để thu hồi quyền, dùng
   UUID đã xác minh trong cùng project:

   ```sql
   UPDATE public.chat_staff SET is_active = false
   WHERE user_id = '00000000-0000-4000-8000-000000000000'::uuid;
   ```
4. Nhân viên đăng nhập tại `/quanly/login`, sau đó mở `/quanly/tin-nhan`. RLS
   vẫn là lớp kiểm soát cuối cùng dù giao diện có kiểm tra membership.

### Kiểm thử trao đổi tin nhắn

1. Sau khi Supabase, schema, env và proxy/IP đã cấu hình, mở website trong cửa sổ
   khách và chọn **Nhân viên tư vấn**. Gửi một tin nhắn kiểm thử không chứa dữ liệu
   cá nhân.
2. Đăng nhập với tài khoản được allow-list, mở `/quanly/tin-nhan`, nhận hội thoại
   trong hàng chờ và gửi trả lời.
3. Quay lại cửa sổ khách. Widget polling mỗi 5 giây; xác nhận tin trả lời xuất
   hiện. Thử thêm đóng/mở hội thoại và đảm bảo một tài khoản nhân viên khác không
   đọc được hội thoại đã phân công.
4. Thử **Trợ lý AI** riêng sau khi model sẵn sàng, rồi bấm **Gặp nhân viên tư vấn**
   để xác nhận cùng conversation và lịch sử được giữ nguyên.

Chưa cấu hình backend thì API cố ý từ chối thay vì giả lập gửi tin. Phiên khách
được lưu để tiếp tục trong cùng tab; token nằm trong cookie HttpOnly theo từng
hội thoại, không được lưu trong JavaScript storage.

## Kiểm tra mã

```powershell
npm run lint
npx tsc --noEmit
npm run test:chat-security
npm run build
git diff --check
```

Lint hiện có thể báo các cảnh báo `<img>` cũ ở trang quản lý sản phẩm. Build
không cần credentials sau khi khởi tạo Supabase được trì hoãn; để đăng nhập,
quản lý và sử dụng API chat, `.env.local` vẫn phải có các giá trị phù hợp.
