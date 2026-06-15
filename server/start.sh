#!/bin/bash
# =====================================================
# start.sh — เปิดระบบ Smart Cosme Backend
# สำนักงานสาธารณสุขจังหวัดศรีสะเกษ
# =====================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        🏥 Smart Cosme — สสจ.ศรีสะเกษ             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ตรวจสอบว่า node_modules มีอยู่
if [ ! -d "node_modules" ]; then
  echo "📦 กำลังติดตั้ง dependencies..."
  npm install
fi

# สร้างฐานข้อมูล (ถ้ายังไม่มี)
if [ ! -f "data/cosme.db" ]; then
  echo "🗄️  กำลังสร้างฐานข้อมูล..."
  mkdir -p data
  npx prisma db push --accept-data-loss
  echo "🌱 กำลังสร้างข้อมูลเริ่มต้น (Admin)..."
  node seed.js
fi

# เปิด Prisma Studio ใน background (Admin Database Viewer)
echo "🔍 เปิด Prisma Studio (ดูฐานข้อมูล)..."
npx prisma studio &
STUDIO_PID=$!

sleep 2

# เปิด API Server
echo "🚀 เปิด API Server..."
echo ""
node server.js &
SERVER_PID=$!

sleep 1

# เปิดเบราว์เซอร์
echo "🌐 เปิดหน้าเว็บ..."
open "http://localhost:5555"        # Prisma Studio
open "../login.html"                # หน้าแอพ

echo ""
echo "✅ ระบบพร้อมใช้งาน!"
echo "   📊 Prisma Studio : http://localhost:5555"
echo "   🔌 API Server    : http://localhost:3001"
echo "   📋 กด Ctrl+C เพื่อหยุดระบบ"
echo ""

# รอและจัดการปิดระบบ
trap "echo ''; echo '🛑 กำลังปิดระบบ...'; kill $STUDIO_PID $SERVER_PID 2>/dev/null; exit" INT TERM
wait
