#!/bin/bash
# MagnetTracker Launcher
# Opens the app in your default browser with a local HTTP server

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8765

echo "🚀 启动磁力追踪器..."

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "✅ 服务器已在运行，直接打开浏览器..."
else
  echo "📡 启动本地服务器 (端口 $PORT)..."
  python3 -m http.server $PORT --directory "$APP_DIR" >/dev/null 2>&1 &
  SERVER_PID=$!
  echo "   PID: $SERVER_PID"
  sleep 1
fi

echo "🌐 打开浏览器..."
open "http://localhost:$PORT/index.html"
echo ""
echo "✨ 磁力追踪器已启动！访问: http://localhost:$PORT"
echo "   按 Ctrl+C 关闭服务器（如需关闭）"
