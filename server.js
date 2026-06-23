const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET_KEY = 'your_secret_key';

// 1. สร้างตัวแปร app ก่อน (สำคัญมาก ห้ามเรียกใช้ app ก่อนบรรทัดนี้)
const app = express();

// 2. ตั้งค่า Middleware พื้นฐาน
app.use(cors());
app.use(express.json());

// 3. ตั้งค่าโฟลเดอร์เก็บไฟล์อัปโหลด
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 4. ตั้งค่าเชื่อมต่อฐานข้อมูล (XAMPP / MySQL)
const db = mysql.createConnection({
  host: 'mysql-4890dc4-titlegg1235-89fd.h.aivencloud.com',
  port: 25960,
  user: 'avnadmin',
  password: 'AVNS_3Sri-fR1Myrb59RzlDu',
  database: 'defaultdb',
  ssl: {
    rejectUnauthorized: false // 🌟 บรรทัดนี้สำคัญมาก! บน Cloud บังคับใช้ SSL ครับ
  }
});

db.connect((err) => {
  if (err) {
    console.error('❌ ดาต้าเบสเชื่อมต่อไม่สำเร็จ:', err);
    return;
  }
  console.log('✅ เชื่อมต่อฐานข้อมูล Aiven สำเร็จแล้ว!');
});

// 5. ฟังก์ชันตรวจสอบสิทธิ์ (Middleware)
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Token หมดอายุ' });
        next();
    });
};

// ==========================================
// 6. ส่วนของ API
// ==========================================

// API Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // ตัวอย่างการตรวจสอบ (ใช้งานจริงควรเช็คกับ Database)
    if (username === 'admin' && password === '1234') { 
        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
});

// API สร้างประกาศใหม่ (ป้องกันด้วย authenticate ต้องล็อกอินก่อนถึงจะเพิ่มได้)
app.post('/api/announcements', authenticate, upload.single('document'), (req, res) => {
    const { title, category_id, description } = req.body;
    const document_url = req.file ? req.file.filename : null;

    const sql = `INSERT INTO announcements (title, category_id, description, document_url, status, created_at) 
                 VALUES (?, ?, ?, ?, 'published', NOW())`;
    
    db.query(sql, [title, category_id, description, document_url], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
        res.status(201).json({ message: 'เพิ่มประกาศสำเร็จ!', id: result.insertId });
    });
});

// ==========================================
// API ลบประกาศ (ต้องล็อกอิน)
// ==========================================
app.delete('/api/announcements/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const sql = 'DELETE FROM announcements WHERE id = ?';
    
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
        }
        res.json({ message: 'ลบประกาศสำเร็จ!' });
    });
});

// ==========================================
// API แก้ไขประกาศ (ต้องล็อกอิน)
// ==========================================
app.put('/api/announcements/:id', authenticate, upload.single('document'), (req, res) => {
    const { id } = req.params;
    const { title, category_id, description } = req.body;
    
    let sql;
    let params;

    // เช็คว่ามีการอัปโหลดไฟล์ PDF ใหม่มาด้วยไหม
    if (req.file) {
        // ถ้ามีไฟล์ใหม่ ให้เซฟชื่อไฟล์ใหม่ทับ
        sql = `UPDATE announcements SET title=?, category_id=?, description=?, document_url=? WHERE id=?`;
        params = [title, category_id, description, req.file.filename, id];
    } else {
        // ถ้าไม่มีไฟล์ใหม่ ให้อัปเดตแค่ข้อความ (เก็บไฟล์เดิมไว้)
        sql = `UPDATE announcements SET title=?, category_id=?, description=? WHERE id=?`;
        params = [title, category_id, description, id];
    }
    
    db.query(sql, params, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' });
        }
        res.json({ message: 'แก้ไขประกาศสำเร็จ!' });
    });
});

// API สำหรับเปิดดูไฟล์ PDF
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API ดึงข้อมูลข่าวทั้งหมดไปแสดงหน้าแรก
app.get('/api/announcements', (req, res) => {
    const sql = `
        SELECT announcements.*, categories.name AS category_name 
        FROM announcements 
        JOIN categories ON announcements.category_id = categories.id 
        ORDER BY created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// ==========================================
// 7. รันเซิร์ฟเวอร์
// ==========================================
app.listen(5000, () => {
    console.log('✅ Server is running on http://localhost:5000');
});