const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────
// Detect which engine to use
// ─────────────────────────────────────────────
const USE_POSTGRES = !!process.env.DATABASE_URL;

let pg_pool = null;
let sqlite_db = null;

// ─────────────────────────────────────────────
// PostgreSQL Setup
// ─────────────────────────────────────────────
if (USE_POSTGRES) {
  const { Pool } = require('pg');
  pg_pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: false }
  });
  pg_pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
  });
  console.log('Using PostgreSQL database');
} else {
  // ─────────────────────────────────────────────
  // SQLite Setup (local development)
  // ─────────────────────────────────────────────
  const sqlite3 = require('sqlite3').verbose();
  const dbDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..');
  const dbPath = path.join(dbDir, 'ruz_interiors.db');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  sqlite_db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error opening SQLite database:', err);
    else console.log('Using SQLite database at:', dbPath);
  });
}

// ─────────────────────────────────────────────
// Unified query helper
// ─────────────────────────────────────────────
// query(sql, params, callback) — callback(err, rows)
function query(sql, params, callback) {
  if (USE_POSTGRES) {
    // Convert SQLite ? placeholders to PostgreSQL $1, $2, …
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++i}`);
    pg_pool.query(pgSql, params, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result.rows);
    });
  } else {
    sqlite_db.all(sql, params, callback);
  }
}

// queryOne — callback(err, row | undefined)
function queryOne(sql, params, callback) {
  query(sql, params, (err, rows) => {
    if (err) return callback(err, null);
    callback(null, rows[0]);
  });
}

// run — for INSERT / UPDATE / DELETE; callback(err, { lastID, changes })
function run(sql, params, callback) {
  if (USE_POSTGRES) {
    // For INSERT … RETURNING id — detect whether we need RETURNING
    let pgSql = sql;
    let i = 0;
    pgSql = pgSql.replace(/\?/g, () => `$${++i}`);

    // Detect INSERT to supply RETURNING id
    const isInsert = /^\s*INSERT/i.test(pgSql);
    if (isInsert && !/RETURNING/i.test(pgSql)) {
      pgSql += ' RETURNING id';
    }

    pg_pool.query(pgSql, params, (err, result) => {
      if (err) return callback(err, null);
      const lastID = result.rows && result.rows[0] ? result.rows[0].id : null;
      callback(null, { lastID, changes: result.rowCount });
    });
  } else {
    sqlite_db.run(sql, params, function (err) {
      if (err) return callback(err, null);
      callback(null, { lastID: this.lastID, changes: this.changes });
    });
  }
}

// ─────────────────────────────────────────────
// Schema initialisation
// ─────────────────────────────────────────────
function initSchema(done) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS projects (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${USE_POSTGRES ? '' : 'AUTOINCREMENT'},
      title TEXT NOT NULL,
      "beforeImagePath" TEXT NOT NULL,
      "afterImagePath" TEXT NOT NULL,
      "createdAt" ${USE_POSTGRES ? 'TIMESTAMPTZ' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reviews (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${USE_POSTGRES ? '' : 'AUTOINCREMENT'},
      "clientName" TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      "reviewText" TEXT NOT NULL,
      visible INTEGER DEFAULT 1,
      "createdAt" ${USE_POSTGRES ? 'TIMESTAMPTZ' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS completed_works (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${USE_POSTGRES ? '' : 'AUTOINCREMENT'},
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      "imagePath" TEXT NOT NULL,
      category TEXT NOT NULL,
      "orderIndex" INTEGER DEFAULT 0,
      "createdAt" ${USE_POSTGRES ? 'TIMESTAMPTZ' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS completed_work_categories (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${USE_POSTGRES ? '' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      "orderIndex" INTEGER DEFAULT 0,
      "createdAt" ${USE_POSTGRES ? 'TIMESTAMPTZ' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${USE_POSTGRES ? '' : 'AUTOINCREMENT'},
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      "iconType" TEXT NOT NULL,
      "orderIndex" INTEGER DEFAULT 0,
      "createdAt" ${USE_POSTGRES ? 'TIMESTAMPTZ' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  let completed = 0;
  tables.forEach((sql) => {
    run(sql, [], (err) => {
      if (err) console.error('Schema init error:', err);
      if (++completed === tables.length) seedDefaults(done);
    });
  });
}

function seedDefaults(done) {
  // Seed services
  queryOne('SELECT COUNT(*) as count FROM services', [], (err, row) => {
    if (!err && row && (parseInt(row.count) === 0)) {
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
      defaultServices.forEach(s => {
        run('INSERT INTO services (name, description, "iconType", "orderIndex") VALUES (?, ?, ?, ?)', s, () => {});
      });
    }
  });

  // Seed categories
  queryOne('SELECT COUNT(*) as count FROM completed_work_categories', [], (err, row) => {
    if (!err && row && (parseInt(row.count) === 0)) {
      const defaultCategories = [['Bedroom', 0], ['Living Room', 1], ['Kitchen', 2], ['Bathroom', 3], ['Dining Room', 4]];
      defaultCategories.forEach(c => {
        run('INSERT INTO completed_work_categories (name, "orderIndex") VALUES (?, ?)', c, () => {});
      });
    }
  });

  if (done) done();
}

// ─────────────────────────────────────────────
// Start DB + schema
// ─────────────────────────────────────────────
function init(done) {
  if (USE_POSTGRES) {
    pg_pool.query('SELECT 1', (err) => {
      if (err) { console.error('PostgreSQL connection failed:', err); process.exit(1); }
      console.log('PostgreSQL connected');
      initSchema(done);
    });
  } else {
    // SQLite: wait a tick for db to open
    sqlite_db.serialize(() => { initSchema(done); });
  }
}

init(() => console.log('Database schema ready'));

// ─────────────────────────────────────────────
// Normalise a row so column names are camelCase
// (PG returns lowercase column names by default)
// ─────────────────────────────────────────────
function norm(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    beforeImagePath: row.beforeImagePath || row.beforeimgpath || row['beforeImagePath'],
    afterImagePath: row.afterImagePath || row.afterimgpath || row['afterImagePath'],
    imagePath: row.imagePath || row.imagepath || row['imagePath'],
    description: row.description,
    category: row.category,
    orderIndex: row.orderIndex !== undefined ? row.orderIndex : row.orderindex,
    name: row.name,
    iconType: row.iconType || row.icontype || row['iconType'],
    clientName: row.clientName || row.clientname || row['clientName'],
    rating: row.rating,
    reviewText: row.reviewText || row.reviewtext || row['reviewText'],
    visible: row.visible,
    createdAt: row.createdAt || row.createdat || row['createdAt']
  };
}
function normAll(rows) { return (rows || []).map(norm); }

// ─────────────────────────────────────────────
// Project CRUD
// ─────────────────────────────────────────────
const getAllProjects = (callback) => {
  query('SELECT * FROM projects ORDER BY "createdAt" DESC', [], (err, rows) => {
    callback(err, normAll(rows));
  });
};

const getProjectById = (id, callback) => {
  queryOne('SELECT * FROM projects WHERE id = ?', [id], (err, row) => {
    callback(err, norm(row));
  });
};

const addProject = (title, beforePath, afterPath, callback) => {
  run(
    'INSERT INTO projects (title, "beforeImagePath", "afterImagePath") VALUES (?, ?, ?)',
    [title, beforePath, afterPath],
    callback
  );
};

const deleteProject = (id, callback) => {
  run('DELETE FROM projects WHERE id = ?', [id], callback);
};

const updateProject = (id, title, beforePath, afterPath, callback) => {
  run(
    'UPDATE projects SET title = ?, "beforeImagePath" = ?, "afterImagePath" = ? WHERE id = ?',
    [title, beforePath, afterPath, id],
    callback
  );
};

// ─────────────────────────────────────────────
// Review CRUD
// ─────────────────────────────────────────────
const getAllReviews = (callback) => {
  query('SELECT * FROM reviews WHERE visible = 1 ORDER BY "createdAt" DESC', [], (err, rows) => {
    callback(err, normAll(rows));
  });
};

const addReview = (clientName, rating, reviewText, callback) => {
  run(
    'INSERT INTO reviews ("clientName", rating, "reviewText", visible) VALUES (?, ?, ?, 1)',
    [clientName, rating, reviewText],
    callback
  );
};

const deleteReview = (id, callback) => {
  run('DELETE FROM reviews WHERE id = ?', [id], callback);
};

const toggleReviewVisibility = (id, visible, callback) => {
  run('UPDATE reviews SET visible = ? WHERE id = ?', [visible, id], callback);
};

// ─────────────────────────────────────────────
// Completed Works CRUD
// ─────────────────────────────────────────────
const getAllCompletedWorks = (callback) => {
  query('SELECT * FROM completed_works ORDER BY "orderIndex" ASC, "createdAt" DESC', [], (err, rows) => {
    callback(err, normAll(rows));
  });
};

const addCompletedWork = (title, description, imagePath, category, callback) => {
  queryOne('SELECT MAX("orderIndex") as "maxOrder" FROM completed_works', [], (err, row) => {
    const nextOrder = row && row.maxOrder !== null ? parseInt(row.maxOrder) + 1 : 0;
    run(
      'INSERT INTO completed_works (title, description, "imagePath", category, "orderIndex") VALUES (?, ?, ?, ?, ?)',
      [title, description, imagePath, category, nextOrder],
      callback
    );
  });
};

const deleteCompletedWork = (id, callback) => {
  run('DELETE FROM completed_works WHERE id = ?', [id], callback);
};

const updateCompletedWork = (id, title, description, category, callback) => {
  run(
    'UPDATE completed_works SET title = ?, description = ?, category = ? WHERE id = ?',
    [title, description, category, id],
    callback
  );
};

// ─────────────────────────────────────────────
// Completed Work Categories CRUD
// ─────────────────────────────────────────────
const getAllCompletedWorkCategories = (callback) => {
  query('SELECT * FROM completed_work_categories ORDER BY "orderIndex" ASC, "createdAt" DESC', [], (err, rows) => {
    callback(err, normAll(rows));
  });
};

const addCompletedWorkCategory = (name, callback) => {
  queryOne('SELECT MAX("orderIndex") as "maxOrder" FROM completed_work_categories', [], (err, row) => {
    const nextOrder = row && row.maxOrder !== null ? parseInt(row.maxOrder) + 1 : 0;
    run(
      'INSERT INTO completed_work_categories (name, "orderIndex") VALUES (?, ?)',
      [name, nextOrder],
      callback
    );
  });
};

const deleteCompletedWorkCategory = (id, callback) => {
  queryOne('SELECT name FROM completed_work_categories WHERE id = ?', [id], (err, row) => {
    if (err) return callback(err);
    const categoryName = row ? row.name : null;
    run('UPDATE completed_works SET category = ? WHERE category = ?', ['Uncategorized', categoryName], (updateErr) => {
      if (updateErr) return callback(updateErr);
      run('DELETE FROM completed_work_categories WHERE id = ?', [id], callback);
    });
  });
};

// ─────────────────────────────────────────────
// Services CRUD
// ─────────────────────────────────────────────
const getAllServices = (callback) => {
  query('SELECT * FROM services ORDER BY "orderIndex" ASC', [], (err, rows) => {
    callback(err, normAll(rows));
  });
};

const addService = (name, description, iconType, callback) => {
  queryOne('SELECT MAX("orderIndex") as "maxOrder" FROM services', [], (err, row) => {
    const nextOrder = row && row.maxOrder !== null ? parseInt(row.maxOrder) + 1 : 0;
    run(
      'INSERT INTO services (name, description, "iconType", "orderIndex") VALUES (?, ?, ?, ?)',
      [name, description, iconType, nextOrder],
      callback
    );
  });
};

const deleteService = (id, callback) => {
  run('DELETE FROM services WHERE id = ?', [id], callback);
};

const updateServiceOrder = (id, orderIndex, callback) => {
  run('UPDATE services SET "orderIndex" = ? WHERE id = ?', [orderIndex, id], callback);
};

module.exports = {
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
