const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
}));

// Database setup
const db = new sqlite3.Database('./data/db.sqlite', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// API Routes
app.get('/api/projects', (req, res) => {
    db.all('SELECT * FROM projects', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/reviews', (req, res) => {
    db.all('SELECT * FROM reviews WHERE approved = 1', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/admin/projects', upload.fields([{ name: 'beforeImage' }, { name: 'afterImage' }]), (req, res) => {
    const { title } = req.body;
    const beforeImage = req.files['beforeImage'][0].filename;
    const afterImage = req.files['afterImage'][0].filename;

    db.run('INSERT INTO projects (title, beforeImage, afterImage) VALUES (?, ?, ?)', [title, beforeImage, afterImage], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({ id: this.lastID });
    });
});

app.post('/api/admin/reviews', (req, res) => {
    const { clientName, rating, reviewText } = req.body;

    db.run('INSERT INTO reviews (clientName, rating, reviewText, approved) VALUES (?, ?, ?, ?)', [clientName, rating, reviewText, 1], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({ id: this.lastID });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});