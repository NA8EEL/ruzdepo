require('dotenv').config();
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const cookieSession = require('cookie-session');
const multer  = require('multer');
const fs      = require('fs');

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
// Cloudinary via native fetch (no SDK — avoids Vercel Lambda timeouts)
// ─────────────────────────────────────────────
const USE_CLOUDINARY = !!(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

// Parse credentials from CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME)
function getCloudinaryCreds() {
  if (process.env.CLOUDINARY_URL) {
    const m = process.env.CLOUDINARY_URL.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
    if (m) return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
  }
  return {
    apiKey:    process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME
  };
}

// Generate Cloudinary request signature (SHA-1)
function cloudinarySign(params, apiSecret) {
  const str = Object.keys(params).sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(str + apiSecret).digest('hex');
}

// Upload a file buffer to Cloudinary via REST API
// Uses unsigned upload preset (no API key permission needed)
async function cloudinaryUpload(buffer, mimetype) {
  const { cloudName } = getCloudinaryCreds();
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  const folder       = 'ruz-interiors';

  const form = new FormData();
  form.append('file',   `data:${mimetype};base64,${buffer.toString('base64')}`);
  form.append('folder', folder);

  if (uploadPreset) {
    // Unsigned upload — no signature needed, just the preset name
    form.append('upload_preset', uploadPreset);
  } else {
    // Signed upload fallback — requires API key + secret
    const { apiKey, apiSecret } = getCloudinaryCreds();
    const timestamp = Math.round(Date.now() / 1000).toString();
    const signature = cloudinarySign({ folder, timestamp }, apiSecret);
    form.append('api_key',   apiKey);
    form.append('timestamp', timestamp);
    form.append('signature', signature);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: form, signal: controller.signal });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
    return data.secure_url;
  } finally {
    clearTimeout(timer);
  }
}


// Delete an image from Cloudinary via REST API
async function cloudinaryDelete(publicId) {
  if (!publicId) return;
  try {
    const { apiKey, apiSecret, cloudName } = getCloudinaryCreds();
    const timestamp = Math.round(Date.now() / 1000).toString();
    const signature = cloudinarySign({ public_id: publicId, timestamp }, apiSecret);

    const form = new FormData();
    form.append('public_id', publicId);
    form.append('api_key',   apiKey);
    form.append('timestamp', timestamp);
    form.append('signature', signature);

    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      { method: 'POST', body: form });
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
  }
}

if (USE_CLOUDINARY) {
  console.log('Using Cloudinary storage (fetch-based) for uploads');
} else {
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  try {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) { console.error('Failed to create uploads dir:', e.message); }
  console.log('Using local disk storage for uploads');
}

// multer: always buffer in memory
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'];
    if (ok.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  },
  limits: { fileSize: 4 * 1024 * 1024 }
});

// Save file — Cloudinary (production) or local disk (dev)
async function saveFile(file) {
  if (USE_CLOUDINARY) {
    return cloudinaryUpload(file.buffer, file.mimetype);
  }
  const ext      = path.extname(file.originalname) || '.jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
  const dir      = path.join(__dirname, 'public', 'uploads');
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return `/uploads/${filename}`;
}

// Delete stored image
async function deleteStoredFile(filePath) {
  if (!filePath) return;
  if (USE_CLOUDINARY) {
    // Extract public_id: .../ruz-interiors/<id>
    const m = filePath.match(/\/ruz-interiors\/([^.?]+)/);
    if (m) await cloudinaryDelete(`ruz-interiors/${m[1]}`);
  } else {
    try {
      const full = path.join(__dirname, 'public', filePath);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (err) { console.error('Local delete error:', err.message); }
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
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { title } = req.body;
    const beforeFile = req.files?.beforeImage?.[0];
    const afterFile  = req.files?.afterImage?.[0];

    if (!title || !beforeFile || !afterFile) {
      return res.status(400).json({ error: 'Title and both images are required' });
    }

    try {
      const beforePath = await saveFile(beforeFile);
      const afterPath  = await saveFile(afterFile);

      addProject(title, beforePath, afterPath, (err, result) => {
        if (err) res.status(500).json({ error: 'Failed to add project' });
        else res.json({ success: true, projectId: result.lastID, beforePath, afterPath });
      });
    } catch (uploadErr) {
      res.status(500).json({ error: 'Image upload failed: ' + uploadErr.message });
    }
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

      const title      = req.body.title || project.title;
      const beforeFile = req.files?.beforeImage?.[0];
      const afterFile  = req.files?.afterImage?.[0];

      let beforePath = project.beforeImagePath;
      let afterPath  = project.afterImagePath;

      try {
        if (beforeFile) {
          await deleteStoredFile(project.beforeImagePath);
          beforePath = await saveFile(beforeFile);
        }
        if (afterFile) {
          await deleteStoredFile(project.afterImagePath);
          afterPath = await saveFile(afterFile);
        }
      } catch (uploadErr) {
        return res.status(500).json({ error: 'Image upload failed: ' + uploadErr.message });
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
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { title, description, category } = req.body;
    const imageFile = req.file;

    if (!title || !description || !category || !imageFile) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    try {
      const imagePath = await saveFile(imageFile);
      addCompletedWork(title, description, imagePath, category, (err, result) => {
        if (err) res.status(500).json({ error: 'Failed to add completed work' });
        else res.json({ success: true, workId: result.lastID });
      });
    } catch (uploadErr) {
      res.status(500).json({ error: 'Image upload failed: ' + uploadErr.message });
    }
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

// Test Cloudinary connectivity (open endpoint — for debugging only)
app.get('/api/test-cloudinary', async (req, res) => {
  if (!USE_CLOUDINARY) {
    return res.json({ ok: false, reason: 'Cloudinary not configured' });
  }
  const { cloudName, apiKey, apiSecret } = getCloudinaryCreds();
  const configInfo = { cloud_name: cloudName, api_key_set: !!apiKey, api_secret_set: !!apiSecret };

  try {
    // Upload a tiny 1×1 white PNG using fetch-based upload
    const tinyPngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const url = await cloudinaryUpload(tinyPngBuffer, 'image/png');
    res.json({ ok: true, url, config: configInfo });
  } catch (err) {
    res.status(500).json({ ok: false, config: configInfo, error: err.message || String(err) });
  }
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
