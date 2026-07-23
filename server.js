require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const multer = require('multer');
const fs = require('fs');

const {
  getAllProjects,
  getProjectById,
  addProject,
  deleteProject,
  updateProject,
  getAllReviews,
  addReview,
  deleteReview,
  getAllCompletedWorks,
  addCompletedWork,
  deleteCompletedWork,
  updateCompletedWork,
  getAllCompletedWorkCategories,
  addCompletedWorkCategory,
  deleteCompletedWorkCategory,
  getAllServices,
  addService,
  deleteService,
  updateServiceOrder
} = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy — required for Render, Railway, and other cloud hosts
app.set('trust proxy', true);

// ─────────────────────────────────────────────
// Storage: Cloudinary (production) or Local Disk (dev)
// ─────────────────────────────────────────────
const USE_CLOUDINARY = !!(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

let upload;
let cloudinary;

if (USE_CLOUDINARY) {
  cloudinary = require('cloudinary');

  // configure() reads CLOUDINARY_URL automatically, or use explicit vars
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }

  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => ({
      folder: 'ruz-interiors',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    })
  });

  upload = multer({
    storage: cloudinaryStorage,
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowedMimes.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    },
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  console.log('Using Cloudinary storage for uploads');
} else {
  // Local disk storage
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  try {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {
    console.error('Failed to create uploads directory:', e.message);
  }

  const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.originalname}`;
      cb(null, uniqueName);
    }
  });

  upload = multer({
    storage: diskStorage,
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowedMimes.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    },
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  console.log('Using local disk storage for uploads');
}

// ─────────────────────────────────────────────
// Helper: resolve image path/URL for DB storage
// ─────────────────────────────────────────────
function getFilePath(file) {
  if (USE_CLOUDINARY) {
    // Cloudinary returns the public URL in file.path
    return file.path;
  }
  return `/uploads/${file.filename}`;
}

// ─────────────────────────────────────────────
// Helper: delete a stored image
// ─────────────────────────────────────────────
async function deleteStoredFile(filePath) {
  if (!filePath) return;

  if (USE_CLOUDINARY && cloudinary) {
    try {
      // Extract public_id from Cloudinary URL
      // URL format: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/ruz-interiors/<public_id>.<ext>
      const match = filePath.match(/\/ruz-interiors\/([^.]+)/);
      if (match) {
        await new Promise((resolve, reject) => {
          cloudinary.uploader.destroy(`ruz-interiors/${match[1]}`, (err, result) => {
            if (err) reject(err); else resolve(result);
          });
        });
      }
    } catch (err) {
      console.error('Cloudinary delete error:', err.message);
    }
  } else {
    // Local file deletion
    const fullPath = path.join(__dirname, 'public', filePath);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (err) {
      console.error('Local file delete error:', err.message);
    }
  }
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
// Serve public files
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON and urlencoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session
app.use(cookieSession({
  name: 'ruz_session',
  secret: process.env.SESSION_SECRET || 'default-secret-key',
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: false
}));

// ─────────────────────────────────────────────
// Auth middleware
// ─────────────────────────────────────────────
const isAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) next();
  else res.status(401).json({ error: 'Unauthorized' });
};

// ─────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─────────────────────────────────────────────
// Auth endpoints
// ─────────────────────────────────────────────
app.get('/api/admin/check', (req, res) => {
  if (req.session && req.session.isAdmin) res.json({ authenticated: true });
  else res.status(401).json({ authenticated: false });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  const adminUser = process.env.ADMIN_USERNAME || 'nihal';
  const adminPass = process.env.ADMIN_PASSWORD || 'nihal@ruz';

  if (username === adminUser && password === adminPass) {
    req.session.isAdmin = true;
    res.json({ success: true, message: 'Logged in successfully' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session = null;
  res.json({ success: true, message: 'Logged out successfully' });
});

// ─────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  getAllProjects((err, rows) => {
    if (err) res.status(500).json({ error: 'Failed to fetch projects' });
    else res.json(rows || []);
  });
});

app.post('/api/admin/projects', isAdmin, (req, res) => {
  upload.fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { title } = req.body;
    const beforeFile = req.files?.beforeImage?.[0];
    const afterFile = req.files?.afterImage?.[0];

    if (!title || !beforeFile || !afterFile) {
      return res.status(400).json({ error: 'Title and both images are required' });
    }

    const beforePath = getFilePath(beforeFile);
    const afterPath = getFilePath(afterFile);

    addProject(title, beforePath, afterPath, (err, result) => {
      if (err) res.status(500).json({ error: 'Failed to add project' });
      else res.json({ success: true, projectId: result.lastID, beforePath, afterPath });
    });
  });
});

app.delete('/api/admin/projects/:id', isAdmin, (req, res) => {
  const projectId = req.params.id;

  getProjectById(projectId, async (err, project) => {
    if (err || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await deleteStoredFile(project.beforeImagePath);
    await deleteStoredFile(project.afterImagePath);

    deleteProject(projectId, (err) => {
      if (err) res.status(500).json({ error: 'Failed to delete project' });
      else res.json({ success: true });
    });
  });
});

app.put('/api/admin/projects/:id', isAdmin, (req, res) => {
  const projectId = req.params.id;

  upload.fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    getProjectById(projectId, async (fetchErr, project) => {
      if (fetchErr || !project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const title = req.body.title || project.title;
      const beforeFile = req.files?.beforeImage?.[0];
      const afterFile = req.files?.afterImage?.[0];

      let beforePath = project.beforeImagePath;
      let afterPath = project.afterImagePath;

      if (beforeFile) {
        await deleteStoredFile(project.beforeImagePath);
        beforePath = getFilePath(beforeFile);
      }
      if (afterFile) {
        await deleteStoredFile(project.afterImagePath);
        afterPath = getFilePath(afterFile);
      }

      updateProject(projectId, title, beforePath, afterPath, (updateErr) => {
        if (updateErr) res.status(500).json({ error: 'Failed to update project' });
        else res.json({ success: true, beforePath, afterPath });
      });
    });
  });
});

// ─────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────
app.get('/api/reviews', (req, res) => {
  getAllReviews((err, rows) => {
    if (err) res.status(500).json({ error: 'Failed to fetch reviews' });
    else res.json(rows || []);
  });
});

app.post('/api/admin/reviews', isAdmin, (req, res) => {
  const { clientName, rating, reviewText } = req.body;

  if (!clientName || !rating || !reviewText) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (rating < 1 || rating > 5 || isNaN(rating)) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  addReview(clientName, rating, reviewText, (err, result) => {
    if (err) res.status(500).json({ error: 'Failed to add review' });
    else res.json({ success: true, reviewId: result.lastID });
  });
});

app.delete('/api/admin/reviews/:id', isAdmin, (req, res) => {
  deleteReview(req.params.id, (err) => {
    if (err) res.status(500).json({ error: 'Failed to delete review' });
    else res.json({ success: true });
  });
});

// ─────────────────────────────────────────────
// Completed Works
// ─────────────────────────────────────────────
app.get('/api/completed-works', (req, res) => {
  getAllCompletedWorks((err, rows) => {
    if (err) res.status(500).json({ error: 'Failed to fetch completed works' });
    else res.json(rows || []);
  });
});

app.post('/api/admin/completed-works', isAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { title, description, category } = req.body;
    const imageFile = req.file;

    if (!title || !description || !category || !imageFile) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const imagePath = getFilePath(imageFile);

    addCompletedWork(title, description, imagePath, category, (err, result) => {
      if (err) res.status(500).json({ error: 'Failed to add completed work' });
      else res.json({ success: true, workId: result.lastID });
    });
  });
});

app.delete('/api/admin/completed-works/:id', isAdmin, (req, res) => {
  const workId = req.params.id;

  getAllCompletedWorks(async (err, works) => {
    const work = works.find(w => w.id == workId);
    if (!work) return res.status(404).json({ error: 'Work not found' });

    await deleteStoredFile(work.imagePath);

    deleteCompletedWork(workId, (err) => {
      if (err) res.status(500).json({ error: 'Failed to delete work' });
      else res.json({ success: true });
    });
  });
});

// ─────────────────────────────────────────────
// Completed Work Categories
// ─────────────────────────────────────────────
app.get('/api/completed-work-categories', (req, res) => {
  getAllCompletedWorkCategories((err, rows) => {
    if (err) res.status(500).json({ error: 'Failed to fetch categories' });
    else res.json(rows || []);
  });
});

app.post('/api/admin/completed-work-categories', isAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  addCompletedWorkCategory(name.trim(), (err, result) => {
    if (err) res.status(500).json({ error: 'Failed to add category' });
    else res.json({ success: true, categoryId: result.lastID });
  });
});

app.delete('/api/admin/completed-work-categories/:id', isAdmin, (req, res) => {
  deleteCompletedWorkCategory(req.params.id, (err) => {
    if (err) res.status(500).json({ error: 'Failed to delete category' });
    else res.json({ success: true });
  });
});

// ─────────────────────────────────────────────
// Services
// ─────────────────────────────────────────────
app.get('/api/services', (req, res) => {
  getAllServices((err, rows) => {
    if (err) res.status(500).json({ error: 'Failed to fetch services' });
    else res.json(rows || []);
  });
});

app.post('/api/admin/services', isAdmin, (req, res) => {
  const { name, description, iconType } = req.body;
  if (!name || !description || !iconType) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  addService(name, description, iconType, (err, result) => {
    if (err) res.status(500).json({ error: 'Failed to add service' });
    else res.json({ success: true, serviceId: result.lastID });
  });
});

app.delete('/api/admin/services/:id', isAdmin, (req, res) => {
  deleteService(req.params.id, (err) => {
    if (err) res.status(500).json({ error: 'Failed to delete service' });
    else res.json({ success: true });
  });
});

// ─────────────────────────────────────────────
// Debug endpoint
// ─────────────────────────────────────────────
app.get('/api/debug', (req, res) => {
  res.json({
    session: req.session ? Object.keys(req.session) : null,
    isAdmin: req.session?.isAdmin || false,
    cookies: req.headers.cookie ? req.headers.cookie.substring(0, 100) : 'none',
    storage: USE_CLOUDINARY ? 'cloudinary' : 'local-disk',
    env: {
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL_SET: !!process.env.DATABASE_URL,
      CLOUDINARY_SET: USE_CLOUDINARY,
      ADMIN_USERNAME_SET: !!(process.env.ADMIN_USERNAME),
      ADMIN_PASSWORD_SET: !!(process.env.ADMIN_PASSWORD)
    }
  });
});

// ─────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─────────────────────────────────────────────
// Start the server (local dev only)
// On Vercel, the app is exported as a module — no listen() needed
// ─────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RUZ Interiors server is running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
