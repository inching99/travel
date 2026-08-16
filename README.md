# 🚗 自驾路书 RoadBook — PWA

自驾旅行线路规划工具 · 手机本地运行 · 无服务器

## 功能

- **行程规划**：搜索添加想去的地点 → 智能排序（最近邻 + 2-opt）→ 腾讯地图驾车路线逐段计算
- **停留时间预估**：按地点类型（景区/博物馆/餐厅…）基础时长 + 热度修正，可手动微调
- **时间表**：几点出发、几点到达、停留多久、几点离开，一目了然
- **自驾建议**：超长单段提示服务区休息、一日行程过载预警、晚到景点提醒
- **停车检索**：每个停留点一键检索周边停车场，支持跳转高德/腾讯导航
- **旅行日记**：文字 + 照片（最多3张）+ 定位 + 标签，按行程归档
- **分享**：日记/行程一键生成分享长图，保存或系统分享给朋友
- **数据安全**：全部本地 IndexedDB 存储，支持 JSON 导出/导入备份

## 使用

### 手机（推荐：iPhone Safari）

1. 电脑启动本地服务（或使用线上地址）：
   ```bash
   cd roadbook-pwa && python3 -m http.server 8765
   ```
2. 手机 Safari 打开 `http://<电脑IP>:8765` → 分享 → **添加到主屏幕**

### 首次使用必做

到 [lbs.qq.com](https://lbs.qq.com)（腾讯位置服务）注册 → 控制台创建应用 → 添加 Key（勾选 **WebServiceAPI** 和 **Web端(JS API)**）→ 在 App「设置」页填入 Key。

## 技术

纯静态 PWA：原生 JS + IndexedDB + 腾讯位置服务（JS API GL + WebServiceAPI JSONP）+ Service Worker 离线缓存。

## 部署

任意静态托管：GitHub Pages / Netlify / Vercel / Cloudflare Pages。
