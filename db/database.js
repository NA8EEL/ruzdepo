const path = require('path');
const fs   = require('fs');

// ─────────────────────────────────────────────
// Detect engine
// ─────────────────────────────────────────────
const USE_POSTGRES = !!process.env.DATABASE_URL;

// ─────────────────────────────────────────────
// PostgreSQL — lazy pool (safe for serverless)
// ─────────────────────────────────────────────
let _pgPool = null;

function getPool() {
  if (!_pgPool) {
    const { Pool } = require('pg');
    _pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,              // 1 connection per serverless instance
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000
    });
    _pgPool.on('error', (err) => {
      console.error('PG pool error:', err.message);
    });
  }
  return _pgPool;
}

// ─────────────────────────────────────────────
// SQLite — lazy open (local dev only)
// ─────────────────────────────────────────────
let _sqlite = null;

function getSQLite() {
  if (!_sqlite) {
    const sqlite3 = require('sqlite3').verbose();
    const dbDir  = path.join(__dirname, '..');
    const dbPath = path.join(dbDir, 'ruz_interiors.db');
    _sqlite = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error('SQLite open error:', err.message);
      else     console.log('SQLite connected:', dbPath);
    });
  }
  return _sqlite;
}

// ─────────────────────────────────────────────
// Unified helpers
// ─────────────────────────────────────────────
// placeholder ? → $1, $2, … for PG
function pgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// query → callback(err, rows[])
function query(sql, params, callback) {
  if (USE_POSTGRES) {
    getPool().query(pgSql(sql), params, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result.rows);
    });
  } else {
    getSQLite().all(sql, params, callback);
  }
}

// queryOne → callback(err, row|undefined)
function queryOne(sql, params, callback) {
  query(sql, params, (err, rows) => {
    if (err) return callback(err, null);
    callback(null, rows ? rows[0] : undefined);
  });
}

// run → for INSERT/UPDATE/DELETE; callback(err, {lastID, changes})
function run(sql, params, callback) {
  if (USE_POSTGRES) {
    let pgQuery = pgSql(sql);
    if (/^\s*INSERT/i.test(pgQuery) && !/RETURNING/i.test(pgQuery)) {
      pgQuery += ' RETURNING id';
    }
    getPool().query(pgQuery, params, (err, result) => {
      if (err) return callback(err, null);
      const lastID = result.rows && result.rows[0] ? result.rows[0].id : null;
      callback(null, { lastID, changes: result.rowCount });
    });
  } else {
    getSQLite().run(sql, params, function (err) {
      if (err) return callback(err, null);
      callback(null, { lastID: this.lastID, changes: this.changes });
    });
  }
}

// ─────────────────────────────────────────────
// Schema init (called lazily on first request)
// ─────────────────────────────────────────────
let _schemaReady = false;
let _schemaCallbacks = [];

function ensureSchema(done) {
  if (_schemaReady) return done();
  _schemaCallbacks.push(done);
  if (_schemaCallbacks.length > 1) return; // already initialising

  const PK = USE_POSTGRES ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const TS = USE_POSTGRES ? 'TIMESTAMPTZ DEFAULT NOW()' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';

  const tables = [
    `CREATE TABLE IF NOT EXISTS projects (
      id ${PK},
      title TEXT NOT NULL,
      "beforeImagePath" TEXT NOT NULL,
      "afterImagePath" TEXT NOT NULL,
      "createdAt" ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS reviews (
      id ${PK},
      "clientName" TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      "reviewText" TEXT NOT NULL,
      visible INTEGER DEFAULT 1,
      "createdAt" ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS completed_works (
      id ${PK},
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      "imagePath" TEXT NOT NULL,
      category TEXT NOT NULL,
      "orderIndex" INTEGER DEFAULT 0,
      "createdAt" ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS completed_work_categories (
      id ${PK},
      name TEXT NOT NULL UNIQUE,
      "orderIndex" INTEGER DEFAULT 0,
      "createdAt" ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id ${PK},
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      "iconType" TEXT NOT NULL,
      "orderIndex" INTEGER DEFAULT 0,
      "createdAt" ${TS}
    )`
  ];

  let done_count = 0;
  tables.forEach(sql => {
    run(sql, [], (err) => {
      if (err) console.error('Schema error:', err.message);
      if (++done_count === tables.length) {
        seedDefaults(() => {
          _schemaReady = true;
          const cbs = _schemaCallbacks.splice(0);
          cbs.forEach(cb => cb());
        });
      }
    });
  });
}

function seedDefaults(done) {
  queryOne('SELECT COUNT(*) as count FROM services', [], (err, row) => {
    if (!err && row && parseInt(row.count) === 0) {
      const svcs = [
        ['Interior Design Consultation', 'Professional consultation for your space redesign and planning', 'consultation', 0],
        ['Residential Design', 'Complete interior design solutions for homes and apartments', 'home', 1],
        ['Commercial Space Planning', 'Strategic design for offices, retail, and commercial spaces', 'building', 2],
        ['Color & Material Selection', 'Expert guidance on colors, textures, and material combinations', 'palette', 3],
        ['3D Visualization', 'Photorealistic 3D renderings of your designed space', 'visualization', 4],
        ['Furniture Curation', 'Handpicked furniture selection and styling', 'furniture', 5],
        ['Lighting Design', 'Strategic lighting solutions for ambiance and functionality', 'lightbulb', 6],
        ['Project Management', 'Complete project oversight from design to implementation', 'task', 7]
      ];
      svcs.forEach(s => run('INSERT INTO services (name, description, "iconType", "orderIndex") VALUES (?, ?, ?, ?)', s, () => {}));
    }
  });

  queryOne('SELECT COUNT(*) as count FROM completed_work_categories', [], (err, row) => {
    if (!err && row && parseInt(row.count) === 0) {
      [['Bedroom',0],['Living Room',1],['Kitchen',2],['Bathroom',3],['Dining Room',4]]
        .forEach(c => run('INSERT INTO completed_work_categories (name, "orderIndex") VALUES (?, ?)', c, () => {}));
    }
  });

  if (done) done();
}

// ─────────────────────────────────────────────
// Normalise row (PG returns lowercase keys)
// ─────────────────────────────────────────────
function norm(row) {
  if (!row) return row;
  return {
    id:              row.id,
    title:           row.title,
    beforeImagePath: row.beforeImagePath || row.beforeimagepath,
    afterImagePath:  row.afterImagePath  || row.afterimagepath,
    imagePath:       row.imagePath       || row.imagepath,
    description:     row.description,
    category:        row.category,
    orderIndex:      row.orderIndex !== undefined ? row.orderIndex : row.orderindex,
    name:            row.name,
    iconType:        row.iconType        || row.icontype,
    clientName:      row.clientName      || row.clientname,
    rating:          row.rating,
    reviewText:      row.reviewText      || row.reviewtext,
    visible:         row.visible,
    createdAt:       row.createdAt       || row.createdat
  };
}
function normAll(rows) { return (rows || []).map(norm); }

// ─────────────────────────────────────────────
// Wrap every exported function with ensureSchema
// ─────────────────────────────────────────────
function withSchema(fn) {
  return function() {
    const args = Array.from(arguments);
    const cb   = args[args.length - 1];
    ensureSchema(() => fn.apply(null, args));
  };
}

// ─────────────────────────────────────────────
// Project CRUD
// ─────────────────────────────────────────────
const getAllProjects = withSchema((callback) => {
  query('SELECT * FROM projects ORDER BY "createdAt" DESC', [], (e, r) => callback(e, normAll(r)));
});

const getProjectById = withSchema((id, callback) => {
  queryOne('SELECT * FROM projects WHERE id = ?', [id], (e, r) => callback(e, norm(r)));
});

const addProject = withSchema((title, before, after, callback) => {
  run('INSERT INTO projects (title, "beforeImagePath", "afterImagePath") VALUES (?, ?, ?)', [title, before, after], callback);
});

const deleteProject = withSchema((id, callback) => {
  run('DELETE FROM projects WHERE id = ?', [id], callback);
});

const updateProject = withSchema((id, title, before, after, callback) => {
  run('UPDATE projects SET title = ?, "beforeImagePath" = ?, "afterImagePath" = ? WHERE id = ?', [title, before, after, id], callback);
});

// ─────────────────────────────────────────────
// Review CRUD
// ─────────────────────────────────────────────
const getAllReviews = withSchema((callback) => {
  query('SELECT * FROM reviews WHERE visible = 1 ORDER BY "createdAt" DESC', [], (e, r) => callback(e, normAll(r)));
});

const addReview = withSchema((clientName, rating, reviewText, callback) => {
  run('INSERT INTO reviews ("clientName", rating, "reviewText", visible) VALUES (?, ?, ?, 1)', [clientName, rating, reviewText], callback);
});

const deleteReview = withSchema((id, callback) => {
  run('DELETE FROM reviews WHERE id = ?', [id], callback);
});

const toggleReviewVisibility = withSchema((id, visible, callback) => {
  run('UPDATE reviews SET visible = ? WHERE id = ?', [visible, id], callback);
});

// ─────────────────────────────────────────────
// Completed Works CRUD
// ─────────────────────────────────────────────
const getAllCompletedWorks = withSchema((callback) => {
  query('SELECT * FROM completed_works ORDER BY "orderIndex" ASC, "createdAt" DESC', [], (e, r) => callback(e, normAll(r)));
});

const addCompletedWork = withSchema((title, description, imagePath, category, callback) => {
  queryOne('SELECT MAX("orderIndex") as "maxOrder" FROM completed_works', [], (e, row) => {
    const next = row && row.maxOrder != null ? parseInt(row.maxOrder) + 1 : 0;
    run('INSERT INTO completed_works (title, description, "imagePath", category, "orderIndex") VALUES (?, ?, ?, ?, ?)',
      [title, description, imagePath, category, next], callback);
  });
});

const deleteCompletedWork = withSchema((id, callback) => {
  run('DELETE FROM completed_works WHERE id = ?', [id], callback);
});

const updateCompletedWork = withSchema((id, title, description, category, callback) => {
  run('UPDATE completed_works SET title = ?, description = ?, category = ? WHERE id = ?', [title, description, category, id], callback);
});

// ─────────────────────────────────────────────
// Categories CRUD
// ─────────────────────────────────────────────
const getAllCompletedWorkCategories = withSchema((callback) => {
  query('SELECT * FROM completed_work_categories ORDER BY "orderIndex" ASC', [], (e, r) => callback(e, normAll(r)));
});

const addCompletedWorkCategory = withSchema((name, callback) => {
  queryOne('SELECT MAX("orderIndex") as "maxOrder" FROM completed_work_categories', [], (e, row) => {
    const next = row && row.maxOrder != null ? parseInt(row.maxOrder) + 1 : 0;
    run('INSERT INTO completed_work_categories (name, "orderIndex") VALUES (?, ?)', [name, next], callback);
  });
});

const deleteCompletedWorkCategory = withSchema((id, callback) => {
  queryOne('SELECT name FROM completed_work_categories WHERE id = ?', [id], (err, row) => {
    if (err) return callback(err);
    const catName = row ? row.name : null;
    run('UPDATE completed_works SET category = ? WHERE category = ?', ['Uncategorized', catName], (e) => {
      if (e) return callback(e);
      run('DELETE FROM completed_work_categories WHERE id = ?', [id], callback);
    });
  });
});

// ─────────────────────────────────────────────
// Services CRUD
// ─────────────────────────────────────────────
const getAllServices = withSchema((callback) => {
  query('SELECT * FROM services ORDER BY "orderIndex" ASC', [], (e, r) => callback(e, normAll(r)));
});

const addService = withSchema((name, description, iconType, callback) => {
  queryOne('SELECT MAX("orderIndex") as "maxOrder" FROM services', [], (e, row) => {
    const next = row && row.maxOrder != null ? parseInt(row.maxOrder) + 1 : 0;
    run('INSERT INTO services (name, description, "iconType", "orderIndex") VALUES (?, ?, ?, ?)',
      [name, description, iconType, next], callback);
  });
});

const deleteService = withSchema((id, callback) => {
  run('DELETE FROM services WHERE id = ?', [id], callback);
});

const updateServiceOrder = withSchema((id, orderIndex, callback) => {
  run('UPDATE services SET "orderIndex" = ? WHERE id = ?', [orderIndex, id], callback);
});

module.exports = {
  getAllProjects, getProjectById, addProject, deleteProject, updateProject,
  getAllReviews, addReview, deleteReview, toggleReviewVisibility,
  getAllCompletedWorks, addCompletedWork, deleteCompletedWork, updateCompletedWork,
  getAllCompletedWorkCategories, addCompletedWorkCategory, deleteCompletedWorkCategory,
  getAllServices, addService, deleteService, updateServiceOrder
};
