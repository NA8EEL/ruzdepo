const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use /tmp on Vercel (ephemeral), or local db directory
const dbDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..');
const dbPath = path.join(dbDir, 'ruz_interiors.db');

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Database connected at:', dbPath);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      beforeImagePath TEXT NOT NULL,
      afterImagePath TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientName TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      reviewText TEXT NOT NULL,
      visible INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS completed_works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      imagePath TEXT NOT NULL,
      category TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS completed_work_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      orderIndex INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      iconType TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const checkServices = () => {
    db.get('SELECT COUNT(*) as count FROM services', (err, row) => {
      if (row && row.count === 0) {
        const defaultServices = [
          ['Interior Design Consultation', 'Professional consultation for your space redesign and planning', 'consultation', 0],
          ['Residential Design', 'Complete interior design solutions for homes and apartments', 'home', 1],
          ['Commercial Space Planning', 'Strategic design for offices, retail, and commercial spaces', 'building', 2],
          ['Color & Material Selection', 'Expert guidance on colors, textures, and material combinations', 'palette', 3],
          ['3D Visualization', 'Photorealistic 3D renderings of your designed space', 'visualization', 4],
          ['Furniture Curation', 'Handpicked furniture selection and styling', 'furniture', 5],
          ['Lighting Design', 'Strategic lighting solutions for ambiance and functionality', 'lightbulb', 6],
          ['Project Management', 'Complete project oversight from design to implementation', 'task', 7]
        ];

        defaultServices.forEach(service => {
          db.run(
            'INSERT INTO services (name, description, iconType, orderIndex) VALUES (?, ?, ?, ?)',
            service
          );
        });
      }
    });
  };

  const checkCompletedWorkCategories = () => {
    db.get('SELECT COUNT(*) as count FROM completed_work_categories', (err, row) => {
      if (row && row.count === 0) {
        const defaultCategories = [
          ['Bedroom', 0],
          ['Living Room', 1],
          ['Kitchen', 2],
          ['Bathroom', 3],
          ['Dining Room', 4]
        ];

        defaultCategories.forEach(category => {
          db.run(
            'INSERT INTO completed_work_categories (name, orderIndex) VALUES (?, ?)',
            category
          );
        });
      }
    });
  };

  setTimeout(checkServices, 500);
  setTimeout(checkCompletedWorkCategories, 500);
});

const getAllProjects = (callback) => {
  db.all('SELECT * FROM projects ORDER BY createdAt DESC', [], callback);
};

const getProjectById = (id, callback) => {
  db.get('SELECT * FROM projects WHERE id = ?', [id], callback);
};

const addProject = (title, beforePath, afterPath, callback) => {
  db.run(
    'INSERT INTO projects (title, beforeImagePath, afterImagePath) VALUES (?, ?, ?)',
    [title, beforePath, afterPath],
    function(err) {
      callback(err, { id: this.lastID });
    }
  );
};

const deleteProject = (id, callback) => {
  db.run('DELETE FROM projects WHERE id = ?', [id], callback);
};

const updateProject = (id, title, beforePath, afterPath, callback) => {
  db.run(
    'UPDATE projects SET title = ?, beforeImagePath = ?, afterImagePath = ? WHERE id = ?',
    [title, beforePath, afterPath, id],
    callback
  );
};

const getAllReviews = (callback) => {
  db.all('SELECT * FROM reviews WHERE visible = 1 ORDER BY createdAt DESC', [], callback);
};

const addReview = (clientName, rating, reviewText, callback) => {
  db.run(
    'INSERT INTO reviews (clientName, rating, reviewText, visible) VALUES (?, ?, ?, 1)',
    [clientName, rating, reviewText],
    function(err) {
      callback(err, { id: this.lastID });
    }
  );
};

const deleteReview = (id, callback) => {
  db.run('DELETE FROM reviews WHERE id = ?', [id], callback);
};

const toggleReviewVisibility = (id, visible, callback) => {
  db.run('UPDATE reviews SET visible = ? WHERE id = ?', [visible, id], callback);
};

const getAllCompletedWorks = (callback) => {
  db.all('SELECT * FROM completed_works ORDER BY orderIndex ASC, createdAt DESC', [], callback);
};

const addCompletedWork = (title, description, imagePath, category, callback) => {
  const maxOrder = (err, row) => {
    const nextOrder = row ? row.maxOrder + 1 : 0;
    db.run(
      'INSERT INTO completed_works (title, description, imagePath, category, orderIndex) VALUES (?, ?, ?, ?, ?)',
      [title, description, imagePath, category, nextOrder],
      function(err) {
        callback(err, { id: this.lastID });
      }
    );
  };
  db.get('SELECT MAX(orderIndex) as maxOrder FROM completed_works', [], maxOrder);
};

const deleteCompletedWork = (id, callback) => {
  db.run('DELETE FROM completed_works WHERE id = ?', [id], callback);
};

const updateCompletedWork = (id, title, description, category, callback) => {
  db.run(
    'UPDATE completed_works SET title = ?, description = ?, category = ? WHERE id = ?',
    [title, description, category, id],
    callback
  );
};

const getAllCompletedWorkCategories = (callback) => {
  db.all('SELECT * FROM completed_work_categories ORDER BY orderIndex ASC, createdAt DESC', [], callback);
};

const addCompletedWorkCategory = (name, callback) => {
  const maxOrder = (err, row) => {
    const nextOrder = row ? row.maxOrder + 1 : 0;
    db.run(
      'INSERT INTO completed_work_categories (name, orderIndex) VALUES (?, ?)',
      [name, nextOrder],
      function(err) {
        callback(err, { id: this.lastID });
      }
    );
  };
  db.get('SELECT MAX(orderIndex) as maxOrder FROM completed_work_categories', [], maxOrder);
};

const deleteCompletedWorkCategory = (id, callback) => {
  db.get('SELECT name FROM completed_work_categories WHERE id = ?', [id], (err, row) => {
    if (err) return callback(err);
    const categoryName = row ? row.name : null;
    db.run('UPDATE completed_works SET category = ? WHERE category = ?', ['Uncategorized', categoryName], (updateErr) => {
      if (updateErr) return callback(updateErr);
      db.run('DELETE FROM completed_work_categories WHERE id = ?', [id], callback);
    });
  });
};

const getAllServices = (callback) => {
  db.all('SELECT * FROM services ORDER BY orderIndex ASC', [], callback);
};

const addService = (name, description, iconType, callback) => {
  const maxOrder = (err, row) => {
    const nextOrder = row ? row.maxOrder + 1 : 0;
    db.run(
      'INSERT INTO services (name, description, iconType, orderIndex) VALUES (?, ?, ?, ?)',
      [name, description, iconType, nextOrder],
      function(err) {
        callback(err, { id: this.lastID });
      }
    );
  };
  db.get('SELECT MAX(orderIndex) as maxOrder FROM services', [], maxOrder);
};

const deleteService = (id, callback) => {
  db.run('DELETE FROM services WHERE id = ?', [id], callback);
};

const updateServiceOrder = (id, orderIndex, callback) => {
  db.run('UPDATE services SET orderIndex = ? WHERE id = ?', [orderIndex, id], callback);
};

module.exports = {
  db,
  getAllProjects,
  getProjectById,
  addProject,
  deleteProject,
  updateProject,
  getAllReviews,
  addReview,
  deleteReview,
  toggleReviewVisibility,
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
};
