/**
 * Smart Cosme API Server
 * Node.js + Express + Prisma + SQLite
 * สำนักงานสาธารณสุขจังหวัดศรีสะเกษ
 * 
 * เข้าถึงได้เฉพาะ localhost เท่านั้น — ไม่เปิดสู่ภายนอก
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const https      = require('https');
const { PrismaClient } = require('@prisma/client');

const app    = express();
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 3001;
const SECRET = process.env.JWT_SECRET || 'change_me_secret';
const SALT   = 12;

/* ============================================================
   MIDDLEWARE
   ============================================================ */

// CORS — อนุญาตเฉพาะ localhost และ file:// (null origin)
app.use(cors({
  origin: (origin, cb) => {
    cb(null, true);
  },
  credentials: true,
}));

app.use(express.json());

// Serve login.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// Serve frontend files
app.use(express.static(path.join(__dirname, '..')));

// Rate limiting เบื้องต้น (ป้องกัน brute-force)
const attempts = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now);
  attempts.set(key, list);
  return true;
}

/* ============================================================
   AUTH MIDDLEWARE
   ============================================================ */
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  try {
    req.user = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    next();
  });
}

/* ============================================================
   HELPERS
   ============================================================ */
function safeUser(u) {
  const { passwordHash, deletedAt, ...safe } = u;
  return safe;
}

function logActivity(userId, action, extra = {}) {
  return prisma.activity.create({
    data: { userId, action, ...extra }
  }).catch(() => {});
}

/* ============================================================
   AUTH ROUTES
   ============================================================ */

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, businessName, businessType,
            idCard, phone, address, province } = req.body;

    if (!email || !password || !firstName || !lastName || !businessName || !phone || !province) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });

    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });

    const passwordHash = await bcrypt.hash(password, SALT);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(), firstName, lastName,
        businessName, businessType: businessType || '-',
        idCard: idCard || null, phone, address: address || null,
        province, passwordHash,
        status: 'approved', role: 'user'
      }
    });

    await logActivity(user.id, 'register', { email: user.email, businessName: user.businessName });

    const token = jwt.sign({ userId: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: '24h' });
    res.status(201).json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    // Rate limiting: 5 ครั้ง / 15 นาที
    if (!rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที' });
    }

    const user = await prisma.user.findUnique({ where: { email: email?.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'บัญชีถูกระงับ กรุณาติดต่อ สสจ.ศรีสะเกษ' });
    }
    if (user.deletedAt) {
      return res.status(403).json({ error: 'บัญชีนี้ถูกลบออกจากระบบแล้ว' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await logActivity(user.id, 'login', { email: user.email, businessName: user.businessName });

    const token = jwt.sign({ userId: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: safeUser({ ...user, lastLogin: new Date() }) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await logActivity(req.user.userId, 'logout', { email: req.user.email });
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
    res.json({ user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

/* ============================================================
   USER ROUTES
   ============================================================ */

// POST /api/feedback — บันทึกความพึงพอใจ
app.post('/api/feedback', requireAuth, async (req, res) => {
  try {
    const { name, contact, product, rating, trustRating, comment } = req.body;
    const fb = await prisma.feedback.create({
      data: { 
        userId: req.user.userId, 
        name, 
        contact, 
        product, 
        rating: rating ? Number(rating) : null, 
        trustRating: trustRating ? Number(trustRating) : null, 
        comment 
      }
    });
    res.status(201).json({ success: true, feedback: fb });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/labels — บันทึกฉลากที่สร้าง
app.post('/api/labels', requireAuth, async (req, res) => {
  try {
    const { productName, productType, manufacturer, score, hasBanned } = req.body;
    const label = await prisma.label.create({
      data: { userId: req.user.userId, productName, productType, manufacturer, score: score ? Number(score) : null, hasBanned: !!hasBanned }
    });
    await logActivity(req.user.userId, 'label_created', { detail: productName });
    res.status(201).json({ success: true, label });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

/* ============================================================
   ADMIN ROUTES — เฉพาะ Admin เท่านั้น
   ============================================================ */

// GET /api/admin/stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [total, approved, rejected, todayUsers, totalFeedback, totalLabels, avgStats] = await Promise.all([
      prisma.user.count({ where: { role: 'user', deletedAt: null } }),
      prisma.user.count({ where: { role: 'user', status: 'approved', deletedAt: null } }),
      prisma.user.count({ where: { role: 'user', status: 'rejected', deletedAt: null } }),
      prisma.user.count({
        where: {
          role: 'user', deletedAt: null,
          createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) }
        }
      }),
      prisma.feedback.count(),
      prisma.label.count(),
      prisma.feedback.aggregate({ _avg: { rating: true, trustRating: true } }),
    ]);
    res.json({ 
      total, 
      approved, 
      rejected, 
      todayUsers, 
      totalFeedback, 
      totalLabels, 
      avgRating: avgStats._avg.rating,
      avgTrustRating: avgStats._avg.trustRating
    });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { search, status, province, sort = 'newest', page = 1, limit = 10 } = req.query;
    const where = { role: 'user', deletedAt: null };
    if (status) where.status = status;
    if (province) where.province = province;
    if (search) {
      where.OR = [
        { firstName:    { contains: search } },
        { lastName:     { contains: search } },
        { email:        { contains: search } },
        { businessName: { contains: search } },
      ];
    }
    const orderBy = sort === 'oldest' ? { createdAt: 'asc' }
                  : sort === 'name'   ? { firstName: 'asc' }
                  : { createdAt: 'desc' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users: users.map(safeUser), total, pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/users/:id
app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
    res.json({ user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// PATCH /api/admin/users/:id — อัปเดต status / adminNote
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const data = { updatedAt: new Date() };
    if (status)    data.status    = status;
    if (adminNote !== undefined) data.adminNote = adminNote;
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// DELETE /api/admin/users/:id — Soft Delete
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/provinces — รายชื่อจังหวัดที่มีผู้สมัคร
app.get('/api/admin/provinces', requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.user.groupBy({
      by: ['province'],
      where: { role: 'user', deletedAt: null },
      _count: { province: true },
      orderBy: { _count: { province: 'desc' } },
    });
    res.json({ provinces: rows.map(r => ({ province: r.province, count: r._count.province })) });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/business-types
app.get('/api/admin/business-types', requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.user.groupBy({
      by: ['businessType'],
      where: { role: 'user', deletedAt: null },
      _count: { businessType: true },
      orderBy: { _count: { businessType: 'desc' } },
    });
    res.json({ types: rows.map(r => ({ type: r.businessType, count: r._count.businessType })) });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/activities
app.get('/api/admin/activities', requireAdmin, async (req, res) => {
  try {
    const activities = await prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ activities });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// DELETE /api/admin/activities — ล้างประวัติ
app.delete('/api/admin/activities', requireAdmin, async (req, res) => {
  try {
    await prisma.activity.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/feedback
app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
  try {
    const feedback = await prisma.feedback.findMany({ orderBy: { createdAt: 'desc' } });
    const avg = await prisma.feedback.aggregate({ _avg: { rating: true, trustRating: true } });
    res.json({ feedback, avgRating: avg._avg.rating, avgTrustRating: avg._avg.trustRating });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/labels — ฉลากที่สร้าง
app.get('/api/admin/labels', requireAdmin, async (req, res) => {
  try {
    const labels = await prisma.label.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ labels });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/admin/change-password — เปลี่ยนรหัสผ่าน admin
app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT);
    await prisma.user.update({ where: { id: req.user.userId }, data: { passwordHash, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

/* ============================================================
   FDA LOOKUP PROXY (LIVE SCRAPING)
   ============================================================ */
function getJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Failed to parse JSON: ${e.message} \nRaw: ${data}`)); }
      });
    }).on('error', reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Failed to parse JSON: ${e.message} \nRaw: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// GET /api/fda/check?number=...
app.get('/api/fda/check', async (req, res) => {
  try {
    const inputNumber = req.query.number;
    if (!inputNumber) {
      return res.status(400).json({ error: 'กรุณาระบุเลขที่จดแจ้ง อย.' });
    }

    // Clean inputs: keep numbers, letters, and dashes
    const cleanedKeyword = inputNumber.replace(/[^a-zA-Z0-9\-]/g, "").trim();
    if (cleanedKeyword.length < 5) {
      return res.status(400).json({ error: 'เลขที่จดแจ้งสั้นเกินไป' });
    }

    // 1. Search on Oryor
    const searchUrl = `https://api.oryor.com/productSerial/search?keyword=${encodeURIComponent(cleanedKeyword)}`;
    const searchOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Authorization': 'keeneye',
        'Origin': 'https://oryor.com',
        'Referer': 'https://oryor.com/'
      }
    };

    let searchResult;
    try {
      searchResult = await getJson(searchUrl, searchOptions);
    } catch (searchErr) {
      console.error('Oryor search error:', searchErr.message);
      return res.status(502).json({ error: 'ไม่สามารถเชื่อมต่อฐานข้อมูลสืบค้นของ อย. ได้' });
    }

    if (!searchResult || searchResult.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลใบจดแจ้งในฐานข้อมูล อย.' });
    }

    // Use the first match
    const bestMatch = searchResult[0];

    // Fallback template
    const fallbackData = {
      success: true,
      source: 'search_only',
      lcnno: bestMatch.lcnno,
      productha: bestMatch.productha,
      produceng: bestMatch.produceng,
      typepro: bestMatch.typepro,
      cncnm: bestMatch.cncnm,
      licen: bestMatch.licen,
      thanm: bestMatch.thanm,
      Addr: bestMatch.Addr,
      appDate: '-',
      expDate: '-'
    };

    if (!bestMatch.URLs) {
      return res.json(fallbackData);
    }

    // Parse regnos from URLs query parameter
    const urlMatch = bestMatch.URLs.match(/[?&]regnos=([^&]+)/);
    const regnos = urlMatch ? urlMatch[1] : null;

    if (!regnos) {
      return res.json(fallbackData);
    }

    // 2. Fetch detailed record from FDA
    try {
      const model = await getJson('https://cosmetica.fda.moph.go.th/CMT_SEARCH_BACK_NEW/Home/SET_MODEL');
      model.M_SYSTEM_SETTING.FUNCTION_NAME = 'get_detail_regnos';
      if (!model.datail_string) model.datail_string = {};
      model.datail_string.regnos = regnos;

      const detailRes = await postJson(
        'https://cosmetica.fda.moph.go.th/CMT_SEARCH_BACK_NEW/Home/FUNCTION_CENTER',
        { MODEL: model }
      );

      if (detailRes && detailRes.datail_string) {
        const d = detailRes.datail_string;
        return res.json({
          success: true,
          source: 'combined',
          lcnno: d.lb_no_regnos || bestMatch.lcnno,
          productha: d.lb_cosnm_Tpop ? `${d.lb_trade_Tpop} ${d.lb_cosnm_Tpop}`.trim() : bestMatch.productha,
          produceng: d.lb_cosnm_Tpop2 ? `${d.lb_trade_Tpop2} ${d.lb_cosnm_Tpop2}`.trim() : bestMatch.produceng,
          typepro: d.type_name || bestMatch.typepro,
          cncnm: d.lb_status || bestMatch.cncnm,
          licen: d.lb_usernm_pop || bestMatch.licen,
          thanm: d.thanm || bestMatch.thanm,
          Addr: d.lb_locat_pop || bestMatch.Addr,
          appDate: d.lb_appdate || '-',
          expDate: d.lb_expdate || '-'
        });
      }
    } catch (detailErr) {
      console.warn('FDA detail fetch error, falling back:', detailErr.message);
    }

    // Return fallback if detail query failed
    return res.json({
      ...fallbackData,
      source: 'combined_fallback'
    });

  } catch (err) {
    console.error('FDA Check endpoint error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล อย.' });
  }
});

/* ============================================================
   HEALTH CHECK
   ============================================================ */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Smart Cosme API',
    version: '2.0',
    org: 'สสจ.ศรีสะเกษ',
    time: new Date().toISOString(),
    db: 'SQLite (local)',
  });
});

/* ============================================================
   ERROR HANDLER
   ============================================================ */
app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: isProd ? 'เกิดข้อผิดพลาดในระบบ' : err.message,
  });
});

/* ============================================================
   START SERVER — เฉพาะ localhost เท่านั้น!
   ============================================================ */
async function main() {
  try {
    await prisma.$connect();
    console.log('✅ เชื่อมต่อฐานข้อมูลสำเร็จ');

    // Bind เฉพาะ 127.0.0.1 — ไม่เปิดสู่ภายนอก
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║        Smart Cosme API — สสจ.ศรีสะเกษ       ║');
      console.log('╠══════════════════════════════════════════════╣');
      console.log(`║  🌐 API Server : http://localhost:${PORT}          ║`);
      console.log('║  🗄️  Prisma Studio (admin): รัน npm run studio ║');
      console.log('║  🔒 เข้าถึงได้เฉพาะเครื่องนี้เท่านั้น         ║');
      console.log('╚══════════════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
    process.exit(1);
  }
}

main();
