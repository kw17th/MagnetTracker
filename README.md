# 🧲 MagnetTracker (磁力追更器)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)

**MagnetTracker** 是一款专为追更设计的轻量级磁力链接聚合与追踪工具。它能够自动抓取指定资源页面的最新磁力链接，并精准记录您的阅读/复制状态，确保您每次看到的都是“最新更新”。

![MagnetTracker Preview](https://raw.githubusercontent.com/kw17th/MagnetTracker/main/screenshot_demo.png) *(注：请将截图上传后替换此链接)*

## ✨ 核心特性

- **🚀 追更状态追踪**：自动记录已复制的磁力链接。预览区域**仅显示自上次复制以来新增加的内容**，避免重复筛选。
- **🔍 智能清晰度筛选**：内置 1080p、2160p (4K)、720p 过滤引擎，支持一键批量复制特定清晰度的所有新提取链接。
- **🛠️ 乱码自动修复**：深度优化抓取引擎，支持 `GBK/GB2312` 编码自动识别处理，完美解决老牌资源站（如 6v520）的中文乱码问题。
- **📋 一键批量操作**：支持单条复制、卡片全部复制、以及全局“复制所有最新”功能。
- **💎 极简美学 UI**：采用深色毛玻璃视觉风格，响应式设计，适配各种屏幕尺寸。
- **🔒 隐私与持久化**：数据完全存储在本地 `localStorage`，无需后端服务器，隐私安全。

## 🛠️ 技术栈

- **Frontend**: Vanilla JS (ES6+), HTML5, CSS3 (Modern Flex/Grid)
- **Scraping**: Client-side Fetch + CORS Proxy (Smart Decoding)
- **Styling**: Custom CSS with Glassmorphism & Animations

## 🚀 快速开始

### 1. 克隆/下载
```bash
git clone https://github.com/kw17th/MagnetTracker.git
cd MagnetTracker
```

### 2. 启动应用
由于浏览器跨域策略限制，建议通过本地服务器运行。您可以直接运行脚本：
```bash
bash launch.sh
```
或者使用 python 快速启动：
```bash
python3 -m http.server 8765
```
然后在浏览器访问 `http://localhost:8765`。

## 📖 使用指南

1. **添加链接**：输入资源站点（如 xl720, 6v520 等）的详情页 URL。
2. **筛选清晰度**：在顶部下拉框选择您需要的视频规格。
3. **批量复制**：点击“复制所有最新”，App 会自动将符合条件的磁链复制到剪贴板，并将它们标记为已读（从预览中消失）。
4. **刷新状态**：随时点击刷新按钮获取网站的最新变动。

## 🤝 贡献说明
欢迎提交 Issue 或 Pull Request 来改进爬虫逻辑或 UI 设计。

## 📄 开源协议
[MIT License](LICENSE)
