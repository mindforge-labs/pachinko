# Nocturne Nova — Tech Stack to Gemini Prompt

Ứng dụng Next.js cho phép roll ba reel **Frontend / Backend framework / Database**, tự ghép backend framework với một runtime tương thích, chọn có hoặc không có Authentication, rồi sinh một system prompt để copy sang Gemini. Người dùng cũng có thể nhấn **ASK GEMINI** để backend gọi Gemini API và nhận implementation guide trực tiếp. Prompt yêu cầu Gemini dùng đầy đủ cả framework và runtime đã roll để thiết kế hệ thống Student Management CRUD hoàn chỉnh bằng CLI trên Linux/macOS và Windows, đồng thời đóng gói bằng Dockerfile và `docker-compose.yml`.

Chế độ sinh/copy prompt không cần API key. API key chỉ được đọc ở Next.js server khi dùng chế độ gọi Gemini trực tiếp và không bao giờ được gửi xuống browser.

## Flow sử dụng

1. Nhấn **START**, sau đó dừng ba reel FE / backend framework / DB hoặc chờ tự dừng.
2. Xem frontend, cặp backend framework + runtime và database trong popup.
3. Tick **Include authentication** nếu phiên bản đầu cần đăng nhập, phân quyền `ADMIN` / `STAFF` và bảo vệ write API.
4. Chọn một trong hai cách:
   - **GENERATE PROMPT** → **COPY PROMPT** để tự paste vào Gemini.
   - **ASK GEMINI** để backend gửi cùng prompt sang Gemini và hiển thị guide ngay trong popup.
5. Prompt và guide đều có nút copy riêng.

Prompt luôn yêu cầu:

- Student CRUD gồm create, list/search/sort/pagination, detail, update và delete.
- Schema, validation, migration, seed, REST contract, error envelope và health check.
- Kiến trúc module dễ mở rộng với courses, classes, attendance, grades, imports và background jobs.
- Hướng dẫn copy-paste hoàn toàn bằng Bash và PowerShell 7+, không phụ thuộc GUI/IDE.
- Source/config đầy đủ, test, `.env.example`, Dockerfile multi-stage và Docker Compose.
- Nếu không tick auth, giữ extension point nhưng không thêm fake auth/dependency thừa.

## Chạy local

Yêu cầu: [Bun 1.3.14+](https://bun.sh/) và Node.js 20+ (Next.js runtime/tooling).

### Linux/macOS (Bash)

```bash
git clone <repository-url> pachinko
cd pachinko
bun install --frozen-lockfile
bun run dev
```

Mở `http://localhost:3000`.

Trong development, maintainer có thể mở `http://localhost:3000/techstack-manager` để quản lý matrix. Route này chủ động trả `404` trong production.

Để bật **ASK GEMINI**, tạo `.env.local` tại thư mục gốc:

```env
GEMINI_API_KEY=your_server_side_api_key
GEMINI_MODEL=gemini-3.5-flash
```

Sau khi sửa `.env.local`, restart `bun run dev`. Không đặt tên biến là `NEXT_PUBLIC_GEMINI_API_KEY` và không commit `.env.local`.

### Windows (PowerShell 7+)

```powershell
git clone <repository-url> pachinko
Set-Location pachinko
bun install --frozen-lockfile
bun run dev
```

Mở `http://localhost:3000`.

## Chạy bằng Docker Compose

Docker Compose dùng port `3000` mặc định và có health check.

Copy `.env.example` thành `.env`, sau đó điền `GEMINI_API_KEY` nếu muốn bật direct mode. Có thể để trống key nếu chỉ dùng generate/copy prompt.

### Linux/macOS (Bash)

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f pachinko
```

Dừng service:

```bash
docker compose down
```

### Windows (PowerShell 7+)

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f pachinko
```

Dừng service:

```powershell
docker compose down
```

Để đổi port host, sửa `APP_PORT` trong `.env`, ví dụ `APP_PORT=8080`.

## Prompt API

`POST /api/gemini-prompt`

Request:

```json
{
  "symbols": ["react", "express", "postgresql"],
  "backendRuntime": "bun",
  "authentication": true
}
```

Ba `symbols` luôn theo thứ tự frontend, backend framework, database và phải có đúng role trong matrix. `backendRuntime` phải có role `backend-runtime` và nằm trong compatibility list của framework ở `symbols[1]`. Response trả về `prompt`, stack đã chuẩn hóa và options; phần tử backend có runtime lồng bên trong:

```json
{
  "prompt": "…",
  "stack": [
    { "layer": "fe", "id": "react", "name": "React" },
    {
      "layer": "be",
      "id": "express",
      "name": "Express",
      "runtime": { "id": "bun", "name": "Bun" }
    },
    { "layer": "db", "id": "postgresql", "name": "Postgres" }
  ],
  "options": { "authentication": true }
}
```

API trả `400` nếu JSON, số lượng reel, kiểu auth, role, technology id hoặc framework/runtime pair không hợp lệ.

`POST /api/gemini-guide` nhận cùng request. Route này dựng cùng system prompt, gọi Gemini bằng `GEMINI_API_KEY` ở server và trả về `guide`, `prompt`, `model`, `finishReason`, stack và options. Nếu chưa cấu hình key, API trả `503` nhưng `/api/gemini-prompt` vẫn hoạt động bình thường.

### Gọi API bằng Bash

```bash
curl --fail-with-body \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"symbols":["react","express","postgresql"],"backendRuntime":"bun","authentication":true}' \
  http://localhost:3000/api/gemini-prompt
```

### Gọi API bằng PowerShell

```powershell
$body = @{
  symbols = @('react', 'express', 'postgresql')
  backendRuntime = 'bun'
  authentication = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:3000/api/gemini-prompt' `
  -ContentType 'application/json' `
  -Body $body
```

## Scripts

```bash
bun run dev
bun run build
bun run start
bun run test
bun run sync:devicons
```

## Quản lý tech-stack matrix

Nguồn cấu hình được review và commit tại `src/techstack-matrix.json`. Devicon chỉ cung cấp catalog metadata và SVG; `roles` trong matrix mới quyết định công nghệ nào xuất hiện trong sản phẩm. Bốn role cố định là `frontend`, `backend-framework`, `backend-runtime` và `database`. Một entry có thể có nhiều role, ví dụ Next.js vừa là frontend vừa là backend framework, nhưng chỉ có một source entry.

Workflow maintenance:

1. Chạy `bun run dev` và mở `/techstack-manager`.
2. Search toàn bộ catalog Devicon, lọc theo source/role/unassigned/compatibility error, rồi gán một hoặc nhiều role.
3. Với mỗi `backend-framework`, chọn ít nhất một entry đang có role `backend-runtime`.
4. Có thể thêm custom entry bằng stable lowercase id, display name, short label, HTTPS documentation URL, HTTPS source homepage và icon URL.
5. Import JSON để review/chỉnh tiếp, hoặc **Reset committed** để bỏ draft. Draft schema v1 được lưu riêng trong `localStorage` của browser.
6. Sửa hết error rồi chọn **Validate and export**. Warning không block export; output được sort theo id, role và compatibility để diff ổn định. Copy/download JSON và thay nội dung `src/techstack-matrix.json` qua quy trình review bình thường.

Custom `docsUrl` và source `homepage` bắt buộc là HTTPS. `iconUrl` có thể là HTTPS hoặc root-relative như `/devicons/custom.svg`; protocol-relative URL (`//…`) không hợp lệ. Browser manager không ghi trực tiếp vào repository hay production. Devicon display/source metadata chỉ đọc trong editor; role và compatibility thuộc product matrix.

Các lỗi như schema không hỗ trợ, id trùng/sai format, source Devicon mất, pool role rỗng, framework không có runtime, edge orphan/disabled/sai role, hoặc custom URL/source sai sẽ block export. Warning gồm runtime chưa được dùng, entry chưa có role và version Devicon không khớp.

## Cấu trúc chính

```text
app/
├── api/gemini-guide/route.ts   # Server-side Gemini API proxy
├── api/gemini-prompt/route.ts  # Next.js backend: validate stack + tạo prompt
├── components/                  # Client runtime và nền đồ họa
├── layout.tsx
└── page.tsx
src/
├── gemini-prompt.ts             # Prompt template thuần, dễ test/mở rộng
├── prompt-request.ts            # Validate/canonicalize request dùng chung
├── techstack-matrix.json        # Product-owned roles và compatibility
├── techstack-matrix.ts          # Schema, validation và deterministic export
├── techstack.ts                 # Resolve matrix thành reel/runtime pool
├── spin-controller.ts           # State machine cho ba reel
├── app.ts                       # UI events, fetch API và clipboard
└── pachinko-markup.ts           # Cabinet/popup markup
app/techstack-manager/            # Development-only browser matrix editor
Dockerfile
docker-compose.yml
```

## Kiểm tra trước khi deploy

```bash
bun run test
bun run build
docker compose build
docker compose up -d
docker compose ps
```

Image production chạy Next.js standalone bằng user không phải root. Gemini key được inject lúc chạy container, không nằm trong image hay source.

## Bảo mật và chi phí Gemini

- Key chỉ tồn tại trong `process.env.GEMINI_API_KEY` ở backend và được gửi qua header `x-goog-api-key`.
- Không commit `.env`, `.env.local` hoặc ghi key trực tiếp vào source.
- Nếu deploy public, nên đặt authentication/rate limiting phía trước `/api/gemini-guide` để tránh người khác tiêu thụ quota của bạn.
- Cấu hình billing alert và restriction cho key. Google khuyến nghị dùng auth key mới thay vì standard key không giới hạn.
