# Krea.ai Infinity Gallery - R2 & D1 Architecture

Tài liệu thiết kế hệ thống và định hướng kỹ thuật cho dự án **Krea.ai Infinity Gallery** - Ứng dụng hiển thị thư viện ảnh quy mô lớn (>10.000 ảnh) tự động cào từ Krea.ai. Dự án sử dụng kiến trúc **Cloudflare R2 + D1**, tối ưu tuyệt đối hiệu năng hiển thị trên giao diện và đảm bảo **chi phí băng thông (Egress) 0 đồng**.

---

## 1. Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ | Mục đích |
| :--- | :--- | :--- |
| **Framework** | Next.js 16 (App Router) + TypeScript | Khung ứng dụng chính, API route handlers, Serverless Backend. |
| **Database** | Cloudflare D1 (SQLite ở Edge) | Lưu trữ siêu tốc metadata của hàng vạn bức ảnh (ID, URL, prompt, màu sắc). |
| **Storage** | Cloudflare R2 (S3-compatible) | Lưu trữ file ảnh vật lý (`.png`), phục vụ ảnh tốc độ cao qua CDN với **0đ Egress**. |
| **Styling** | Vanilla CSS + Tailwind | Tùy biến UI, hiệu ứng Glassmorphism & Animations. |
| **Tối ưu UI** | CSS Virtual Rendering | Kỹ thuật `content-visibility: auto` giúp DOM không bị quá tải khi cuộn hàng ngàn ảnh. |
| **Automation** | Vercel Cron Jobs | (Tùy chọn) Kích hoạt luồng cào ảnh ngầm định kỳ mỗi 6 tiếng. |

---

## 2. Dòng Chảy Dữ Liệu: Từ Cào Ảnh Đến Giao Diện (Data Pipeline Flow)

Hệ thống được thiết kế hoàn toàn tự chủ, chia làm hai luồng (Flow) rõ rệt: Luồng thu thập (Backend) và Luồng hiển thị (Frontend).

### 2.1. Luồng Thu Thập & Xử Lý Dữ Liệu (Backend Scraper)
Luồng này chịu trách nhiệm "vét" ảnh từ Krea.ai về làm tài sản sở hữu riêng trên Cloudflare.
Có thể chạy bằng **Vercel Cron** (120 ảnh/lần) hoặc chạy thủ công bằng **Local Seed Script** (hàng ngàn ảnh/lần).

**Trình tự các bước diễn ra:**
1. **Kích hoạt:** Lịch tự động Cron hoặc Người dùng kích hoạt file script cục bộ.
2. **Lấy Data:** Hệ thống gửi GET Request (kèm Cookie mạo danh) lên Krea.ai và nhận về danh sách JSON chứa metadata.
3. **Vòng lặp Xử lý (Chạy song song 5 ảnh/lần):**
   - **Check DB:** Truy vấn Cloudflare D1 xem `krea_id` đã tồn tại chưa?
   - **Nếu ĐÃ CÓ:** Bỏ qua ảnh này để chống lặp dữ liệu.
   - **Nếu CHƯA CÓ:**
     - Tải file ảnh gốc (nhị phân buffer) từ máy chủ Krea.
     - Upload ảnh này lên Cloudflare R2 Bucket (`krea-gallery`).
     - Insert dữ liệu (Đường link R2 Public mới, Prompt, Kích thước, Màu nền) vào Cloudflare D1.
4. **Hoàn tất:** Báo cáo lại tổng số lượng ảnh đã đồng bộ thành công và số ảnh bị bỏ qua.

### 2.2. Luồng Trình Diễn Giao Diện (Frontend Flow)
Luồng này phục vụ hàng triệu người dùng truy cập web xem ảnh, đọc dữ liệu hoàn toàn từ Cloudflare (không dính dáng tới Krea.ai nữa).

**Trình tự tải giao diện:**
1. **Trình duyệt (Người dùng)** cuộn trang xuống dưới cùng màn hình.
2. Trình duyệt tự động gọi API phân trang nội bộ: `/api/images?page=X&limit=40`.
3. **Next.js API** tiếp nhận và gửi câu truy vấn (Query `OFFSET/LIMIT`) vào **Cloudflare D1**.
4. **Cloudflare D1** trả về cục dữ liệu siêu nhẹ (chỉ chứa R2 URL và các đoạn text Prompts).
5. **Next.js API** đóng gói JSON và gửi ngược về cho Trình duyệt.
6. Trình duyệt render các thẻ `<Image>`, sau đó trực tiếp tải file ảnh vật lý từ **Cloudflare R2 CDN** với tốc độ chớp nhoáng (Miễn phí Egress 100%).

---

## 3. Kiến Trúc Frontend & Trải Nghiệm Mượt Mà (Smooth Infinite Scroll)

Để render một Masonry Grid (lưới ảnh tự do kiểu Pinterest) với hàng vạn tấm ảnh mà trình duyệt không bị giật lag, dự án kết hợp các phương thức sau:

### 3.1. Phương thức Cuộn Vô Tận (Incremental Infinite Fetching)
- Sử dụng `IntersectionObserver` kết hợp cơ chế **đoán trước (Pixel Prediction)**: Kích hoạt tải dữ liệu khi người dùng còn cách đáy màn hình đúng **2500px** (`rootMargin: '2500px'`). Nhờ tải ngầm (Silent Prefetch) từ trước, người dùng không bao giờ phải chờ vòng quay Loading.
- Khi cuộn cực nhanh, hệ thống sẽ tự động ghép nhiều luồng tải (parallel fetch) để lấy trước dữ liệu.

### 3.2. Cấu Trúc CSS Virtual Rendering (Bảo vệ CPU/RAM)
- Việc giữ hàng ngàn thẻ `<img>` trên HTML DOM sẽ làm máy tính yếu bị treo. 
- Dự án áp dụng thủ thuật CSS tối tân:
  ```css
  .image-card-wrapper {
    content-visibility: auto; 
    contain-intrinsic-size: 0 420px;
  }
  ```
- **Tác dụng:** Trình duyệt sẽ lờ đi (không paint, không tính toán layout) tất cả các ảnh nằm ngoài màn hình hiện tại, nhưng thanh cuộn (scrollbar) không bị co giật nhờ khai báo `contain-intrinsic-size` mồi.

### 3.3. Xử Lý Trùng Lặp Hiển Thị (UI Deduplication)
- Nếu vừa cuộn vừa có đợt cào ảnh mới (Database bị đẩy xuống 1 trang), API phân trang bằng `OFFSET` sẽ vô tình trả về các ảnh cũ đã xem.
- **Giải pháp:** Sử dụng `useRef<Set<string>>` lưu trữ bộ nhớ đệm (seen IDs) trên Frontend. Mọi ảnh tải về sẽ bị filter qua lưới lọc này trước khi đẩy vào mảng hiển thị.

### 3.4. Hiệu Ứng Nền (Dominant Color Placeholder)
- Thay vì dùng hiệu ứng loading vạch sáng chớp nháy (Shimmer) nhàm chán, hệ thống khi cào ảnh đã lưu kèm mã màu chủ đạo của bức ảnh (`color`).
- Khi ảnh đang tải từ R2, thẻ bao bọc (wrapper) sẽ hiện màu mờ này, mang lại cảm giác cực kỳ nghệ thuật và tinh tế.

### 3.5. Ảnh Tương Tự (Hybrid Krea Proxy)
- Riêng phần "Ảnh tương tự" (khi bấm vào chi tiết 1 ảnh), hệ thống không lưu ảnh trong R2 mà làm một luồng Proxy API (`/api/k2-similar/route.ts`) gọi ngược về Krea.ai.
- Lý do: Thuật toán tìm kiếm ảnh tương tự (Vector Embeddings) nằm ở Krea. Việc lưu lại toàn bộ ảnh tương tự sẽ làm phình to kho R2 một cách vô ích. Chúng ta chỉ "mượn" API của Krea để hiển thị tạm thời.

---

## 4. Chống Lặp Lại Dữ Liệu (3-Layer Deduplication)

Hệ thống Backend sở hữu 3 lớp bảo vệ chống lặp ảnh nghiêm ngặt:
1. **Frontend (Set UI):** Gạt bỏ ảnh trùng trên giao diện bằng `seenIds.current.has(id)`.
2. **Backend (Scraper):** Truy vấn `SELECT id FROM krea_images WHERE krea_id = ? LIMIT 1` trước khi tải file (Bảo vệ băng thông và tiền bạc).
3. **Database (Schema):** Cột `krea_id` được khóa cứng bằng thuộc tính `UNIQUE NOT NULL` ở mức cơ sở dữ liệu (Bảo vệ tính toàn vẹn cuối cùng).

---

## 5. Quản Lý Cơ Sở Dữ Liệu (Cloudflare D1 Schema)

Bảng `krea_images`:
```sql
CREATE TABLE krea_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  krea_id TEXT UNIQUE NOT NULL,      -- ID gốc của Krea để chống trùng
  image_url TEXT NOT NULL,           -- URL R2 Public (Ví dụ: https://pub-xxx.r2.dev/images/xyz.png)
  krea_url TEXT NOT NULL,            -- URL gốc (Lưu làm backup)
  prompt TEXT,                       -- Lời nhắc AI tạo ảnh
  width INTEGER,                     
  height INTEGER,
  color TEXT,                        -- Màu chủ đạo (Dominant color) dùng làm nền tải
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_synced_at ON krea_images(synced_at DESC);
```

---

## 6. Hướng Dẫn Cài Đặt (Setup Instructions)

Yêu cầu 9 biến môi trường thiết yếu trong file `.env` (Cần cung cấp ở Local và dán vào Vercel Settings):

```bash
# 1. Krea Cookie (Để giả lập trình duyệt, vượt bảo mật cào ảnh)
KREA_SESSION_COOKIE="krea-canary=never; ..."

# 2. R2 Configuration
R2_ACCOUNT_ID="your_account_id"
R2_ACCESS_KEY_ID="your_r2_access_key"
R2_SECRET_ACCESS_KEY="your_r2_secret_key"
R2_BUCKET_NAME="krea-gallery"
R2_PUBLIC_URL="https://pub-xyz.r2.dev"

# 3. D1 Configuration
D1_ACCOUNT_ID="your_account_id"
D1_DATABASE_ID="your_db_uuid"
D1_API_TOKEN="your_cf_api_token"

# 4. Security
CRON_SECRET="your-secure-random-string"
```

> ⚠️ **Bảo Mật Seed Script:** File cào tốc độ cao `app/api/seed/route.ts` đã được tích hợp kiểm tra khóa `CRON_SECRET`. Nếu muốn trigger bằng tay (kể cả trên máy tính nhà hay gọi Postman lên Vercel), bắt buộc phải gắn Header: `Authorization: Bearer <CRON_SECRET>`.