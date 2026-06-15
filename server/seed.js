/**
 * seed.js — สร้างบัญชี Admin เริ่มต้น
 * รัน: node seed.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 กำลังสร้างข้อมูลเริ่มต้น...');

  // สร้าง Admin account
  const hash = await bcrypt.hash('admin2025', 12);
  const admin = await prisma.user.upsert({
    where:  { email: 'admin@smartcosme.th' },
    update: {},
    create: {
      email:        'admin@smartcosme.th',
      firstName:    'ผู้ดูแล',
      lastName:     'ระบบ',
      businessName: 'สำนักงานสาธารณสุขจังหวัดศรีสะเกษ',
      businessType: '-',
      phone:        '045123456',
      province:     'ศรีสะเกษ',
      address:      'สำนักงานสาธารณสุขจังหวัดศรีสะเกษ',
      passwordHash: hash,
      status:       'approved',
      role:         'admin',
      adminNote:    'บัญชีผู้ดูแลระบบเริ่มต้น',
    }
  });
  console.log('✅ สร้าง Admin สำเร็จ:', admin.email);

  // สร้าง Activity เริ่มต้น
  await prisma.activity.create({
    data: {
      userId:  admin.id,
      action:  'system_init',
      email:   admin.email,
      detail:  'ระบบเริ่มต้นพร้อมใช้งาน',
    }
  });

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║         ข้อมูลเข้าสู่ระบบ Admin       ║');
  console.log('╠══════════════════════════════════════╣');
  console.log('║  อีเมล    : admin@smartcosme.th      ║');
  console.log('║  รหัสผ่าน : admin2025                ║');
  console.log('║  ⚠️  เปลี่ยนรหัสผ่านหลังเข้าระบบครั้งแรก  ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  await prisma.$disconnect();
}

seed().catch(e => {
  console.error('❌ Seed Error:', e);
  process.exit(1);
});
