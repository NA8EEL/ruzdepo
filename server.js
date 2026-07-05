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

// Trust proxy — required for Render and other cloud hosts
app.set('trust proxy', true);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.error('Failed to create uploads directory:', e.message);
}

// Serve public files
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON and urlencoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session — simple, always works with HTTPS
app.use(cookieSession({
  name: 'ruz_session',
  secret: process.env.SESSION_SECRET || 'default-secret-key',
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: false
}));

// Configure multer for file uploads (uploadsDir already declared above)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const isAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/check', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  process.env.ADMIN_USERNAME = "nihal"
  process.env.ADMIN_PASSWORD = "nihal@ruz"

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
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

app.get('/api/projects', (req, res) => {
  getAllProjects((err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch projects' });
    } else {
      res.json(rows || []);
    }
  });
});

app.post('/api/admin/projects', isAdmin, (req, res, next) => {
  upload.fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
  const { title } = req.body;
  const beforeFile = req.files?.beforeImage?.[0];
  const afterFile = req.files?.afterImage?.[0];

  if (!title || !beforeFile || !afterFile) {
    return res.status(400).json({ error: 'Title and both images are required' });
  }

  const beforePath = `/uploads/${beforeFile.filename}`;
  const afterPath = `/uploads/${afterFile.filename}`;

  addProject(title, beforePath, afterPath, (err, result) => {
    if (err) {
      res.status(500).json({ error: 'Failed to add project' });
    } else {
      res.json({ success: true, projectId: result.id, beforePath, afterPath });
    }
  });
  });
});

app.delete('/api/admin/projects/:id', isAdmin, (req, res) => {
  const projectId = req.params.id;

  getProjectById(projectId, (err, project) => {
    if (err || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const beforeFilePath = path.join(__dirname, 'public', project.beforeImagePath);
    const afterFilePath = path.join(__dirname, 'public', project.afterImagePath);

    if (fs.existsSync(beforeFilePath)) fs.unlinkSync(beforeFilePath);
    if (fs.existsSync(afterFilePath)) fs.unlinkSync(afterFilePath);

    deleteProject(projectId, (err) => {
      if (err) {
        res.status(500).json({ error: 'Failed to delete project' });
      } else {
        res.json({ success: true });
      }
    });
  });
});

// UPDATE PROJECT ENDPOINT
app.put('/api/admin/projects/:id', isAdmin, (req, res, next) => {
  const projectId = req.params.id;

  upload.fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    // Fetch existing project to keep old paths if new ones aren't provided
    getProjectById(projectId, (fetchErr, project) => {
      if (fetchErr || !project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const title = req.body.title || project.title;
      const beforeFile = req.files?.beforeImage?.[0];
      const afterFile = req.files?.afterImage?.[0];

      let beforePath = project.beforeImagePath;
      let afterPath = project.afterImagePath;

      // If new before image uploaded, set new path and delete old file
      if (beforeFile) {
        beforePath = `/uploads/${beforeFile.filename}`;
        const oldBeforePath = path.join(__dirname, 'public', project.beforeImagePath);
        if (fs.existsSync(oldBeforePath)) fs.unlinkSync(oldBeforePath);
      }

      // If new after image uploaded, set new path and delete old file
      if (afterFile) {
        afterPath = `/uploads/${afterFile.filename}`;
        const oldAfterPath = path.join(__dirname, 'public', project.afterImagePath);
        if (fs.existsSync(oldAfterPath)) fs.unlinkSync(oldAfterPath);
      }

      updateProject(projectId, title, beforePath, afterPath, (updateErr) => {
        if (updateErr) {
          res.status(500).json({ error: 'Failed to update project' });
        } else {
          res.json({ success: true, beforePath, afterPath });
        }
      });
    });
  });
});

app.get('/api/reviews', (req, res) => {
  getAllReviews((err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch reviews' });
    } else {
      res.json(rows || []);
    }
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
    if (err) {
      res.status(500).json({ error: 'Failed to add review' });
    } else {
      res.json({ success: true, reviewId: result.id });
    }
  });
});

app.delete('/api/admin/reviews/:id', isAdmin, (req, res) => {
  const reviewId = req.params.id;

  deleteReview(reviewId, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to delete review' });
    } else {
      res.json({ success: true });
    }
  });
});

// COMPLETED WORKS ENDPOINTS
app.get('/api/completed-works', (req, res) => {
  getAllCompletedWorks((err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch completed works' });
    } else {
      res.json(rows || []);
    }
  });
});

app.post('/api/admin/completed-works', isAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
  const { title, description, category } = req.body;
  const imageFile = req.file;

  if (!title || !description || !category || !imageFile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const imagePath = `/uploads/${imageFile.filename}`;

  addCompletedWork(title, description, imagePath, category, (err, result) => {
    if (err) {
      res.status(500).json({ error: 'Failed to add completed work' });
    } else {
      res.json({ success: true, workId: result.id });
    }
  });
  });
});

app.delete('/api/admin/completed-works/:id', isAdmin, (req, res) => {
  const workId = req.params.id;

  getAllCompletedWorks((err, works) => {
    const work = works.find(w => w.id == workId);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const imagePath = require('path').join(__dirname, 'public', work.imagePath);
    if (require('fs').existsSync(imagePath)) {
      require('fs').unlinkSync(imagePath);
    }

    deleteCompletedWork(workId, (err) => {
      if (err) {
        res.status(500).json({ error: 'Failed to delete work' });
      } else {
        res.json({ success: true });
      }
    });
  });
});

app.get('/api/completed-work-categories', (req, res) => {
  getAllCompletedWorkCategories((err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch categories' });
    } else {
      res.json(rows || []);
    }
  });
});

app.post('/api/admin/completed-work-categories', isAdmin, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  addCompletedWorkCategory(name.trim(), (err, result) => {
    if (err) {
      res.status(500).json({ error: 'Failed to add category' });
    } else {
      res.json({ success: true, categoryId: result.id });
    }
  });
});

app.delete('/api/admin/completed-work-categories/:id', isAdmin, (req, res) => {
  const categoryId = req.params.id;

  deleteCompletedWorkCategory(categoryId, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to delete category' });
    } else {
      res.json({ success: true });
    }
  });
});

// SERVICES ENDPOINTS
app.get('/api/services', (req, res) => {
  getAllServices((err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch services' });
    } else {
      res.json(rows || []);
    }
  });
});

app.post('/api/admin/services', isAdmin, (req, res) => {
  const { name, description, iconType } = req.body;

  if (!name || !description || !iconType) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  addService(name, description, iconType, (err, result) => {
    if (err) {
      res.status(500).json({ error: 'Failed to add service' });
    } else {
      res.json({ success: true, serviceId: result.id });
    }
  });
});

app.delete('/api/admin/services/:id', isAdmin, (req, res) => {
  const serviceId = req.params.id;

  deleteService(serviceId, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to delete service' });
    } else {
      res.json({ success: true });
    }
  });
});

// Simple endpoints to diagnose issues
app.get('/api/debug', (req, res) => {
  res.json({
    session: req.session ? Object.keys(req.session) : null,
    isAdmin: req.session?.isAdmin || false,
    cookies: req.headers.cookie ? req.headers.cookie.substring(0, 100) : 'none',
    env: {
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      ADMIN_USERNAME_SET: !!process.env.ADMIN_USERNAME,
      ADMIN_PASSWORD_SET: !!process.env.ADMIN_PASSWORD,
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RUZ Interiors server is running on http://0.0.0.0:${PORT}`);
});
