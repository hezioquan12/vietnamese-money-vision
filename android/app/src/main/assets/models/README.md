# Vị trí đặt file mô hình YOLO26 TFLite

Đặt file mô hình đã lượng tử hóa (Quantized INT8) vào thư mục này với tên quy ước:
`yolo26_money_quant.tflite`

Đường dẫn đầy đủ:
`android/app/src/main/assets/models/yolo26_money_quant.tflite`

### Cấu hình mô hình:
- Input Tensor: `[1, 640, 640, 3]` (RGB float32 hoặc uint8/int8)
- Output Tensor: `[1, 13, 8400]`
- Thứ tự 9 nhãn:
  - 0: `1000`
  - 1: `10000`
  - 2: `100000`
  - 3: `2000`
  - 4: `20000`
  - 5: `200000`
  - 6: `5000`
  - 7: `50000`
  - 8: `500000`
