# 🧲 MagnetTracker (磁力追更器)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)

**MagnetTracker** 是一款专为追更设计的轻量级磁力链接聚合与追踪工具。它能够自动抓取指定资源页面的最新磁力链接，并精准记录您的阅读/复制状态，确保您每次看到的都是“最新更新”。

![MagnetTracker Preview](https://raw.githubusercontent.com/kw17th/MagnetTracker/main/screenshot_demo.png)

## ✨ 核心特性

### 🚀 高效追踪 (Efficiency)
- **右键一键追踪**：支持两种右键菜单模式，可以对着选中的**超链接**右键加入 Tracker 库，也可以直接在**页面任意空白处**右键将当前网页链接加入。完美适配资源搜索结果页。
- **一键直连 Synology Download Station**：支持在界面顶部原生配置内网或公开的 NAS API 地址（如 `http://192.168.7.11:5000/`）凭证安全保存在本地。
  - **单点与批量推送**：为每一条最新磁力链接提供“推送到 NAS”交互按钮；也提供全局级别的一键批量智能推送，支持跳过已处理项目。
  - **不受证书限制**：自定配置支持从 HTTP 端口进入 NAS，绕过 Chrome 苛刻的自签名 HTTPS 证书限制。
- **追更状态识别**：自动对比并记录已处理（已复制/已推送）的磁力链接。预览区**仅显示新内容**，彻底告别重复筛选。
- **一键获取与过滤**：支持指定提取所有未复制的链接、卡片全量提取，结合智能多维过滤引擎（1080p、2160p (4K)、720p 等）。

### 🧠 智能自动化 (Intelligence)
- **定时自动刷新**：设定每天 **07:00, 12:00, 18:00** 三个黄金档期。在对应时间点后的第一次打开插件时即刻自动刷新，获取最新资源。
- **环境自适应抓取**：
  - **扩展模式**：原生 **Direct Fetch** 技术，无视跨域限制，直连源站，速度快如闪电。
  - **网页模式**：智能 CORS 代理切换引擎，确保在任何环境下都能成功抓取。
- **万能编码兼容**：完美支持 `GBK/GB2312` 编码（如 6v520 等老牌站点），拒绝乱码。

### 💎 极致体验 (Experience)
- **Premium 设计美学**：基于 **Glassmorphism (毛玻璃)** 的现代视觉风格。插件界面宽度优化至 **800px**，提供宽敞的单行操作布局。
- **全场景适配**：
  - **多主题切换**：白天/夜间/跟随环境三档模式。全新设计的单行 Header 布局，兼顾美观与效率。
  - **多端一致性**：支持 Chrome 扩展弹窗与全屏标签页模式，数据与体验完美同步。

### 🔒 可靠性与隐私 (Reliability)
- **账号级静默云同步**：通过 `chrome.storage.sync` 自动同步追踪列表与复制状态。**无需手动备份/导入**，重装插件或更换设备时数据会自动恢复。
- **本地缓存加速**：通过 `local` 存储进行资源缓存，确保在断网或弱网环境下依然能秒开插件。
- **隐私第一**：所有数据均存储在您的本地或加密的同步空间中，无需第三方服务器。

## 🛠️ 技术栈

- **Frontend**: Vanilla JS (ES6+), HTML5, CSS3 (Modern Flex/Grid)
- **Scraping**: Client-side Fetch + CORS Proxy (Smart Decoding)
- **Styling**: Custom CSS with Glassmorphism & Animations
- **Storage**: Chrome Extensions Storage API / LocalStorage

## 🚀 快速开始

### 1. 克隆/下载
```bash
git clone https://github.com/kw17th/MagnetTracker.git
cd MagnetTracker
```

#### 方案 A：Chrome 插件（推荐 🌟）
1. 在 Chrome 地址栏输入 `chrome://extensions/`。
2. 开启右上角的 **“开发者模式”**。
3. 点击 **“加载已解压的扩展程序”**。
4. 选择本项目中的 **根目录**。

#### 方案 B：本地网页版
```bash
bash launch.sh
```
访问 `http://localhost:8000` 即可。

## 📝 开源协议
本项目基于 [MIT License](LICENSE) 协议开源。
