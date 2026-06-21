require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const {
  getAllProjects,
  getProjectById,
  addProject,
  deleteProject,
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

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

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
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
    } else {
      res.json({ success: true, message: 'Logged out successfully' });
    }
  });
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

app.post('/api/admin/projects', isAdmin, upload.fields([
  { name: 'beforeImage', maxCount: 1 },
  { name: 'afterImage', maxCount: 1 }
]), (req, res) => {
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

app.post('/api/admin/completed-works', isAdmin, upload.single('image'), (req, res) => {
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

app.listen(PORT, () => {
  console.log(`RUZ Interiors server is running on http://localhost:${PORT}`);
});
