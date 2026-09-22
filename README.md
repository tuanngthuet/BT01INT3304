# Oẳn Tù Tì v2 (OTTv2) - Bàn Cờ 9x9 Chiến Thuật

Dự án trò chơi cờ chiến thuật Oẳn Tù Tì v2 (Đấm - Lá - Kéo) trên bàn cờ 9x9.

## Điểm Nổi Bật Sau Khi Cập Nhật
- **Đã xóa bỏ hoàn toàn chế độ AI**: Tập trung vào trải nghiệm đối kháng giữa người với người (Local và Online).
- **Gỡ bỏ Server Socket.IO & WebRTC PeerJS**: Không còn phụ thuộc vào backend server trung gian hay signaling phức tạp.
- **Tích hợp `playhtml`**: Hệ thống phòng chơi trực tuyến nhiều người thời gian thực dựa trên PartyKit & Yjs CRDT, hoạt động trực tiếp trên trình duyệt (serverless).

---

## Cấu Trúc Thư Mục
```
BT01INT3304-sua_vi_tri_quan_co/
├── index.html        # Giao diện chính bàn cờ 9x9 (Chơi Local & Online playhtml)
├── playfull.html     # Giao diện phòng thi đấu tích hợp khung chat trực tiếp
├── game.js           # Engine luật chơi cờ, kiểm tra ăn quân, di chuyển 8 hướng, điều kiện thắng
├── online.js         # Quản lý kết nối phòng chơi, phân vai và đồng bộ nước đi qua playhtml
├── style.css         # Toàn bộ giao diện, bàn cờ, hiệu ứng âm thanh và modal
├── server.js         # Máy chủ tĩnh siêu nhẹ (zero-dependency) hỗ trợ chạy local
└── package.json      # Cấu hình dự án
```

---

## Cách Khởi Chạy

### Cách 1: Sử dụng Python (Đơn giản nhất, không cần cài thư viện)
```bash
python -m http.server 3000
```
Sau đó mở trình duyệt:
- Bản chính: [http://localhost:3000](http://localhost:3000)
- Bản Hub: [http://localhost:3000/playfull](http://localhost:3000/playfull)

### Cách 2: Sử dụng Node.js
```bash
node server.js
```

### Cách 3: Chạy trực tiếp hoặc Host trên Static Web (GitHub Pages / Vercel)
Vì `playhtml` hoạt động hoàn toàn ở phía client và kết nối qua cloud, bạn có thể triển khai toàn bộ thư mục lên bất kỳ nền tảng lưu trữ web tĩnh nào mà không cần cấu hình backend server.

---

## Hướng Dẫn Chơi Online qua playhtml

1. **Người chơi 1 (Host / Xanh)**:
   - Bấm vào nút **🌐 Chơi Online**.
   - Bấm **Tạo phòng ngay 🚀**.
   - Hệ thống sẽ sinh mã phòng (ví dụ: `ott-1234`) và link trực tiếp. Bấm **Sao chép** để gửi cho bạn bè.

2. **Người chơi 2 (Khách / Đỏ)**:
   - Mở link do người chơi 1 gửi (hoặc bấm **🌐 Chơi Online** -> tab **Vào phòng có sẵn** -> dán mã phòng).
   - Hệ thống tự động kết nối hai người vào cùng bàn đấu.

3. **Luật Chơi Nhanh**:
   - Mỗi quân di chuyển 1 ô theo 8 hướng (như Vua cờ vua).
   - Ăn quân: Đấm ăn Kéo, Kéo ăn Lá, Lá ăn Đấm. Hai quân cùng loại chỉ chặn đường nhau.
   - Chiến thắng: Ăn sạch 1 loại quân của đối phương HOẶC đưa quân vào căn cứ đối thủ (P1 vào `i9`, P2 vào `a1`).
