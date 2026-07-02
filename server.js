const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2');
const path = require('path');
const jwt = require('jsonwebtoken');

// ใช้อ่านไฟล์ .env ถ้ามีในเครื่อง (สำหรับรันในเครื่อง)
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';
const app = express();

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

// 4. เชื่อมต่อฐานข้อมูล (ดึงค่าจาก Environment Variables)
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false // จำเป็นต้องมีสำหรับ Aiven
  }
});

db.connect((err) => {
  if (err) console.error('❌ เชื่อมต่อ DB ไม่สำเร็จ:', err);
  else console.log('✅ เชื่อมต่อฐานข้อมูลสำเร็จ!');
});

// 5. Middleware ตรวจสอบสิทธิ์
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Token หมดอายุ' });
        next();
    });
};

// 6. API Endpoints
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') { 
        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
});

app.post('/api/announcements', authenticate, upload.single('document'), (req, res) => {
    const { title, category_id, description } = req.body;
    const document_url = req.file ? req.file.filename : null;
    const sql = `INSERT INTO announcements (title, category_id, description, document_url, status, created_at) VALUES (?, ?, ?, ?, 'published', NOW())`;
    db.query(sql, [title, category_id, description, document_url], (err, result) => {
        if (err) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึก' });
        res.status(201).json({ message: 'สำเร็จ!', id: result.insertId });
    });
});

app.get('/api/announcements', (req, res) => {
    const sql = `SELECT * FROM announcements ORDER BY created_at DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 7. รันเซิร์ฟเวอร์
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});