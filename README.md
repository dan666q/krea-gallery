# Krea.ai Infinity Gallery - Technical & Design Specification

Tài liệu thiết kế hệ thống và định hướng kỹ thuật cho dự án **Krea.ai Infinity Gallery** - Ứng dụng SPA hiển thị thư viện ảnh quy mô lớn (>10.000 ảnh) từ Krea.ai sử dụng công nghệ Infinite Scroll và Inertial Smooth Scrolling.

---

## 1. Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ | Mục đích |
| :--- | :--- | :--- |
| **Framework** | React + TypeScript + Vite | Khung ứng dụng chính, quản lý state và compile hiệu năng cao |
| **Styling** | Vanilla CSS | Tối ưu hiệu năng render, tùy biến hiệu ứng Glassmorphism & Animations |
| **Smooth Scroll** | Lenis (by Studio Freight) | Tạo độ trượt quán tính (momentum scroll) mượt mà cho toàn trang |
| **Infinite Scroll** | `react-infinite-scroll-component` | Tự động phát hiện điểm cuối trang để tải thêm dữ liệu phân trang |
| **API Proxy** | Vercel Serverless Functions | Che giấu session cookie, bypass CORS và bảo mật dữ liệu ở backend |
| **Deployment** | Vercel | Hosting và tích hợp CI/CD tự động |

---

## 2. Hệ Thống Thiết Kế (Design System)

Ứng dụng hướng tới trải nghiệm thị giác cao cấp (Premium UI/UX) lấy cảm hứng từ các trang web thiết kế nghệ thuật đương đại:

### 2.1. Bảng Màu & Typography (Theme & Fonts)
*   **Theme:** Deep Dark Mode.
    *   Màu nền chính: `#09090b` (Zinc 950)
    *   Màu nền thẻ/modal: `#18181b` (Zinc 900) với viền `#27272a` (Zinc 800)
    *   Màu chữ: `#ffffff` (Primary) và `#a1a1aa` (Muted Zinc 400)
*   **Typography:** Tải trực tiếp từ Google Fonts.
    *   Tiêu đề chính: `Outfit` (đậm, tracking-tight, hiện đại)
    *   Nội dung & Prompt: `Inter` (rõ ràng, dễ đọc ở kích thước nhỏ)

### 2.2. Lưới Ảnh Tự Do (Responsive Masonry Grid)
*   Sử dụng thuộc tính CSS `columns` để chia lưới ảnh tự động giãn theo chiều dọc (tránh cắt xén tỷ lệ ảnh):
    *   Mobile: 2 cột (`columns-2`)
    *   Tablet/MD: 3 cột (`md:columns-3`)
    *   Laptop/LG: 4 cột (`lg:columns-4`)
    *   Màn hình lớn: 5-6 cột (`xl:columns-5 2xl:columns-6`)
    *   Khoảng cách giữa các thẻ: `gap-4`
*   Thuộc tính `break-inside: avoid` được áp dụng cho từng thẻ ảnh để ngăn việc thẻ bị chia cắt khi chuyển cột.

### 2.3. Hiệu Ứng Chuyển Động (Micro-animations & Glassmorphism)
*   **Card Hover:** Phóng to nhẹ (`scale-[1.03]`), tăng độ bóng mờ (`shadow-2xl`) và tăng độ sáng nhẹ để làm nổi bật ảnh đang rê chuột.
*   **Popup Modal Blur:** Nền của modal sử dụng hiệu ứng kính mờ `backdrop-filter: blur(12px)` kết hợp với lớp phủ tối màu `bg-black/95`.
*   **Loading Placeholder:** Sử dụng hiệu ứng xung động (Pulse Animation) tạo khung xương xám (Skeleton Loader) khi ảnh đang được tải từ server.
*   **Custom Scrollbar:** Thiết kế thanh cuộn mỏng, bo góc tròn đồng bộ với tông màu tối của hệ thống.

---

## 3. Đặc Tả Dữ Liệu & API (Data Specifications)

### 3.1. Cấu Trúc Khối Dữ Liệu Ảnh (`KreaImage` Interface)
```typescript
interface KreaImage {
  id: string;                    // UUID định danh ảnh
  image_url: string;             // Đường dẫn URL CDN của ảnh (.png)
  prompt?: string;               // Câu lệnh prompt dùng để generate
  width?: number;                // Chiều rộng
  height?: number;               // Chiều cao
}
```

### 3.2. Luồng Gọi API Proxy
*   Ứng dụng Frontend gọi tới endpoint nội bộ: `/api/k2-feed?itemOffset=X&limit=Y`
*   Hệ thống Serverless Function của Vercel (nằm tại `/api/k2-feed.ts`) tiếp nhận yêu cầu, tự động đọc biến môi trường `KREA_SESSION_COOKIE` và chuyển tiếp request có đính kèm Cookie cùng User-Agent giả lập trình duyệt tới API gốc của Krea:
    `https://www.krea.ai/api/k2-feed`

---

## 4. Lộ Trình Triển Khai Theo Giai Đoạn (Phased Roadmap)

### Phase 1: Setup Môi Trường & Cấu Hình Cốt Lõi (Khởi đầu)
*   **Mục tiêu:** Khởi tạo project React-TS hoàn chỉnh và chạy thử dev server.
*   **Các bước thực hiện:**
    1.  Khởi tạo project bằng lệnh Vite CLI `npm create vite@latest ./ -- --template react-ts`.
    2.  Cài đặt các gói dependencies cần thiết (`react-infinite-scroll-component`, `lenis`, và `@vercel/node` cho dev serverless).
    3.  Thiết lập file `vite.config.ts` để cấu hình proxy local kèm tự động chèn Cookie bảo mật.
    4.  Tạo file `.env` trống làm chỗ nhập Cookie cá nhân ở máy local.

### Phase 2: Xây Dựng Backend Proxy (Serverless API)
*   **Mục tiêu:** Tạo API trung gian cho Vercel chạy không cần đăng nhập ở client.
*   **Các bước thực hiện:**
    1.  Tạo thư mục `api/` ở root dự án.
    2.  Xây dựng file `api/k2-feed.ts` Node.js serverless handler để chuyển tiếp request kèm thêm cookie từ biến môi trường.
    3.  Cấu hình `tsconfig.json` tương thích để build cả frontend và backend serverless.

### Phase 3: Phát Triển Giao Diện Tĩnh & Lưới Masonry (Core UI & Scroll)
*   **Mục tiêu:** Hiển thị lưới ảnh Masonry cuộn mượt mà có Infinite Scroll.
*   **Các bước thực hiện:**
    1.  Tạo file `index.html` tích hợp Google Fonts (`Outfit`, `Inter`).
    2.  Thiết lập `src/index.css` chứa cấu trúc Grid, Custom scrollbar và cấu hình cho Lenis.
    3.  Cấu hình **Lenis Smooth Scroll** trong component `App.tsx` bằng vòng lặp vẽ khung hình `requestAnimationFrame`.
    4.  Viết logic `fetchImages()` liên tục và lọc trùng lặp với `Set`.
    5.  Bọc ảnh bằng thẻ `<a>` cấu hình thông minh để hỗ trợ tính năng "Open Link in New Tab" nguyên bản.

### Phase 4: Hoàn Thiện Tương Tác Nâng Cao (Popup Modal, Search & Download)
*   **Mục tiêu:** Hoàn thành trải nghiệm Modal Popup Side-by-Side, sao chép prompt, tải ảnh trực tiếp và bộ lọc tìm kiếm.
*   **Các bước thực hiện:**
    1.  Xây dựng giao diện Modal Popup Side-by-Side mờ nền (backdrop blur).
    2.  Tích hợp tính năng sao chép Prompt nhanh (Copy to Clipboard).
    3.  Viết hàm tải ảnh chuyên dụng sử dụng `fetch(url) -> blob -> download` để tải trực tiếp ảnh xuống máy khách mà không bị chặn CORS.
    4.  Thêm input search dạng glassmorphic ở Header để lọc ảnh real-time theo prompt tại máy khách.
    5.  Thêm nút floating "Back to Top" hoạt họa mượt mà.

---

## 5. Hạn Chế & Hướng Giải Quyết (Limitations & Solutions)

> [!WARNING]
> **Hạn chế của giải pháp cào dữ liệu trực tiếp:**
> 1. **Phụ thuộc Session:** Yêu cầu một tài khoản Krea đăng nhập để lấy Cookie. Nếu Cookie hết hạn hoặc thiếu, API của Krea sẽ chặn request.
> 2. **Rủi ro API nội bộ:** API `/api/k2-feed` có thể thay đổi định dạng bất cứ lúc nào, khiến frontend bị lỗi phân tích cú pháp.
> 3. **Ràng buộc Điều khoản (TOS):** Việc phân phối ứng dụng cào dữ liệu công khai có thể vi phạm điều khoản của nhà cung cấp.

### Định hướng giải quyết dài hạn (Production-ready):

*   **Giải pháp 1: Lưu trữ Caching qua Database (Khuyên dùng cho sản phẩm thật)**
    *   *Cách làm:* Viết một công cụ cào dữ liệu định kỳ (Cron job) chạy trên server để tải trước danh sách ảnh của Krea về lưu vào cơ sở dữ liệu riêng (PostgreSQL, Supabase, MongoDB).
    *   *Kết quả:* SPA sẽ gọi dữ liệu từ DB cá nhân. Hệ thống độc lập hoàn toàn với Krea, tốc độ tải nhanh gấp 10 lần, hỗ trợ lọc trùng lặp và tìm kiếm toàn văn (Full-text search) cực mạnh.
*   **Giải pháp 2: API Proxy Bảo Mật (Đang triển khai)**
    *   *Cách làm:* Sử dụng Serverless Function ở backend để ẩn cookie xác thực khỏi client-side, tránh lộ thông tin cá nhân.
*   **Giải pháp 3: Bộ Dữ Liệu Tĩnh (Dành cho bản Demo nhanh)**
    *   *Cách làm:* Đóng gói sẵn 1 file JSON chứa 5.000+ bản ghi ảnh tĩnh kèm prompt đã được tải về từ trước.
    *   *Kết quả:* Trang web hoạt động ổn định 100%, không cần kết nối API ngoài, tải tức thời và an toàn tuyệt đối.