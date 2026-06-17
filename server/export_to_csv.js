/**
 * export_to_csv.js — ส่งออกข้อมูลดิบในระบบไปยังไฟล์ CSV (เปิดด้วย Excel ภาษาไทยได้)
 * รัน: node export_to_csv.js
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// ฟังก์ชันช่วยเขียนไฟล์ CSV แบบมี UTF-8 BOM สำหรับ Excel ภาษาไทย
function saveCsv(filename, headers, rows) {
  const bom = '\ufeff'; // Byte Order Mark สำหรับ Excel
  const csvContent = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map(row => row.map(v => {
      if (v === null || v === undefined) return '""';
      const str = String(v);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const exportDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir);
  }

  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, bom + csvContent, 'utf8');
  console.log(`✅ บันทึกไฟล์: ${filePath}`);
}

async function main() {
  console.log('📊 เริ่มต้นการส่งออกข้อมูลดิบ...');

  // 1. ส่งออกตาราง User (ผู้ประกอบการ)
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });
  const userHeaders = ['ID', 'Email', 'ชื่อ', 'นามสกุล', 'ชื่อกิจการ', 'ประเภทกิจการ', 'เลขบัตรประชาชน', 'เบอร์โทร', 'ที่อยู่', 'จังหวัด', 'สถานะบัญชี', 'บทบาท', 'หมายเหตุ Admin', 'วันที่สมัคร', 'เข้าระบบล่าสุด'];
  const userRows = users.map(u => [
    u.id, u.email, u.firstName, u.lastName, u.businessName, u.businessType,
    u.idCard || '', u.phone, u.address || '', u.province, u.status, u.role,
    u.adminNote || '', u.createdAt.toISOString(), u.lastLogin ? u.lastLogin.toISOString() : ''
  ]);
  saveCsv('users_export.csv', userHeaders, userRows);

  // 2. ส่งออกตาราง Activity (ประวัติการใช้งาน)
  const activities = await prisma.activity.findMany({
    orderBy: { createdAt: 'desc' }
  });
  const actHeaders = ['ID', 'User ID', 'การกระทำ', 'อีเมล', 'ชื่อกิจการ', 'รายละเอียด', 'วันเวลา'];
  const actRows = activities.map(a => [
    a.id, a.userId || '', a.action, a.email || '', a.businessName || '', a.detail || '', a.createdAt.toISOString()
  ]);
  saveCsv('activities_export.csv', actHeaders, actRows);

  // 3. ส่งออกตาราง Feedback (ความพึงพอใจ)
  const feedbacks = await prisma.feedback.findMany({
    orderBy: { createdAt: 'desc' }
  });
  const fbHeaders = ['ID', 'User ID', 'ชื่อผู้ประเมิน', 'ข้อมูลติดต่อ', 'ผลิตภัณฑ์', 'คะแนนความพึงพอใจ', 'ข้อเสนอแนะเพิ่มเติม', 'วันเวลา'];
  const fbRows = feedbacks.map(f => [
    f.id, f.userId || '', f.name || '', f.contact || '', f.product || '', f.rating || 0, f.comment || '', f.createdAt.toISOString()
  ]);
  saveCsv('feedback_export.csv', fbHeaders, fbRows);

  // 4. ส่งออกตาราง Label (ประวัติฉลากที่ระบบวิเคราะห์)
  const labels = await prisma.label.findMany({
    orderBy: { createdAt: 'desc' }
  });
  const labelHeaders = ['ID', 'User ID', 'ชื่อผลิตภัณฑ์', 'ประเภทผลิตภัณฑ์', 'ผู้ผลิต', 'คะแนนผลวิเคราะห์', 'มีสารต้องห้าม', 'วันเวลาวิเคราะห์'];
  const labelRows = labels.map(l => [
    l.id, l.userId || '', l.productName, l.productType || '', l.manufacturer || '', l.score || 0, l.hasBanned ? 'มี' : 'ไม่มี', l.createdAt.toISOString()
  ]);
  saveCsv('labels_export.csv', labelHeaders, labelRows);

  console.log('🎉 ส่งออกข้อมูลทั้งหมดเสร็จสิ้น!');
}

main()
  .catch(e => {
    console.error('❌ Error during CSV export:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
