# Nocturne Nova — Showcase Pachislot Tương Tác

Một máy pachislot nguyên bản, thuần HTML/CSS/JavaScript, không dùng framework. Dự án tái hiện cảm giác phần cứng pachislot thật (bố cục ba cuộn quay, nút start đỏ, ba nút stop trắng, khu vực coin trang trí) nhưng chỉ mang tính **trình diễn tương tác** — không có cược, tín dụng, tiền thưởng hay bất kỳ cơ chế cờ bạc nào.

## Tính năng

- Bố cục dọc tỉ lệ **2:3**, hiển thị trọn vẹn thân máy và co giãn theo màn hình.
- Render kết hợp: HTML ngữ nghĩa cho điều khiển, CSS cho khung/chrome/ánh sáng/đổ bóng, SVG nội tuyến cho biểu tượng cuộn quay, huy hiệu vàng, hoa văn xoắn và đồ họa màn hình.
- Tông màu nguyên bản đen — vàng — tím than.
- Nút start đỏ khởi động cả ba cuộn; mỗi nút stop trắng dừng đúng cuộn tương ứng.
- Cuộn chưa dừng sẽ tự dừng theo các mốc thời gian lệch nhau (staggered timeouts).
- Hiệu ứng động cho đèn, cuộn quay, màn hình trên, phản hồi nút bấm và hoa văn trang trí.
- Âm thanh tổng hợp bằng Web Audio (không dùng file media), kèm nút tắt tiếng có lưu trạng thái.
- Chuyển đổi giữa nền arcade tối giản và nền trình diễn tách biệt.
- Điều khiển bằng bàn phím và nhãn hỗ trợ trợ năng.
- Tôn trọng `prefers-reduced-motion`.

## Yêu cầu

- Node.js >= 18 (chỉ cần cho việc phục vụ local và chạy test).
- Trình duyệt hiện đại: Chrome, Safari, Firefox, Edge (desktop và mobile).

## Chạy demo

Dự án dùng ES modules nên **cần phục vụ qua HTTP** (mở trực tiếp bằng `file://` sẽ bị trình duyệt chặn module). Đã có sẵn server tĩnh không phụ thuộc gói ngoài:

```bash
npm start
```

Sau đó mở trình duyệt tại địa chỉ được in ra:

```
http://127.0.0.1:4173/
```

Có thể đổi cổng hoặc host bằng biến môi trường:

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

## Cách sử dụng

- **Chuột / cảm ứng:** bấm nút **START** để quay, bấm **1 / 2 / 3** để dừng từng cuộn.
- **Bàn phím:** `Enter` hoặc `Space` để bắt đầu; các phím `1`, `2`, `3` để dừng cuộn tương ứng.
- **Nút SOUND:** bật/tắt âm thanh (trạng thái được lưu qua các lần tải lại).
- **Nút SCENE:** chuyển giữa nền `ARCADE` và nền tách biệt `SOLO`.

Cuộn nào không được dừng thủ công sẽ tự dừng sau một khoảng thời gian. Khi cả ba cuộn dừng, máy phát hiệu ứng hoàn tất rồi trở về trạng thái sẵn sàng.

## Kiểm thử

Bộ test viết bằng Vitest với môi trường jsdom:

```bash
npm test
```

Phạm vi test:

- `tests/spin-controller.test.js` — máy trạng thái quay: khởi động từ idle, chặn start trùng lặp, dừng tự động lệch nhau, gán biểu tượng cuối, dọn timeout, quay về idle, xử lý dừng thủ công/tự động xen kẽ.
- `tests/app.test.js` — cấu trúc DOM/nhãn trợ năng, chuỗi tương tác chuột + bàn phím, lưu trạng thái tắt tiếng và nền.
- `tests/audio-engine.test.js` — khởi tạo AudioContext trễ, ánh xạ sự kiện sang âm thanh, tắt tiếng, khôi phục tùy chọn, fallback an toàn khi Web Audio không khả dụng.

## Cấu trúc dự án

```
pachinko/
├── index.html              # Trang chính: cabinet ngữ nghĩa + SVG nội tuyến
├── styles.css              # Toàn bộ khung máy, ánh sáng, responsive, reduced-motion
├── server.js               # Server tĩnh zero-dependency để phục vụ demo
├── vitest.config.js        # Cấu hình Vitest (môi trường jsdom)
├── package.json
├── src/
│   ├── app.js              # Kết nối UI: input, sự kiện controller, tùy chọn, vòng đời
│   ├── spin-controller.js  # Máy trạng thái quay độc lập framework (có thể test tất định)
│   └── audio-engine.js     # Công cụ âm thanh Web Audio tổng hợp + tắt tiếng bền vững
└── tests/
    ├── app.test.js
    ├── spin-controller.test.js
    └── audio-engine.test.js
```

## Kiến trúc

- **`SpinController`** là máy trạng thái thuần túy (`idle` → `spinning` → `settling` → `idle`), mỗi cuộn có trạng thái và timeout riêng. Đồng hồ (`schedule`/`cancel`) và bộ chọn biểu tượng được tiêm vào để test tất định. Việc chọn biểu tượng chỉ mang tính hình ảnh.
- **`app.js`** định tuyến input chuột/bàn phím qua một lớp lệnh duy nhất, điều khiển các lớp trình bày CSS dựa trên **sự kiện của controller** (không dựa vào timer rời rạc), đồng thời quản lý lưu tùy chọn và dọn dẹp khi trang bị ẩn.
- **`AudioEngine`** tạo `AudioContext` trễ sau tương tác đầu tiên của người dùng, sinh âm bằng oscillator/noise qua một `GainNode` chính, và fallback an toàn khi trình duyệt không hỗ trợ Web Audio.

## Ghi chú

- `styles.css` nạp font từ Google Fonts qua `@import`. Nếu không có mạng, giao diện vẫn hoạt động và tự động dùng font hệ thống (`system-ui`).
- Đây là sản phẩm nghệ thuật tương tác — **không có cược, tín dụng, giải thưởng hay mô phỏng cờ bạc**.
