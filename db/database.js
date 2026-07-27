const path = require('path');
const fs   = require('fs');

// ─────────────────────────────────────────────
// Engine detection
// ─────────────────────────────────────────────
const USE_POSTGRES = !!process.env.DATABASE_URL;

// ─────────────────────────────────────────────
// PostgreSQL via @neondatabase/serverless
// HTTP-based: no TCP cold-start, works on Vercel
// ─────────────────────────────────────────────
let _neonSql = null;
function getNeonSql() {
  if (!_neonSql) {
    const { neon } = require('@neondatabase/serverless');
    _neonSql = neon(process.env.DATABASE_URL);
  }
  return _neonSql;
}

// ─────────────────────────────────────────────
// SQLite — local dev only
// ─────────────────────────────────────────────
let _sqlite = null;
function getSQLite() {
  if (!_sqlite) {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath  = path.join(__dirname, '..', 'ruz_interiors.db');
    _sqlite = new sqlite3.Database(dbPath, err => {
      if (err) console.error('SQLite open error:', err.message);
      else console.log('SQLite connected:', dbPath);
    });
  }
  return _sqlite;
}

// ─────────────────────────────────────────────
// SQL helpers
// ─────────────────────────────────────────────
function toPosgresParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Returns Promise<rows[]>
async function queryAsync(sql, params) {
  if (USE_POSTGRES) {
    const result = await getNeonSql()(toPosgresParams(sql), params);
    return result || [];
  }
  return new Promise((resolve, reject) => {
    getSQLite().all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows || []);
    });
  });
}

// Returns Promise<{ lastID, changes }>
async function runAsync(sql, params) {
  if (USE_POSTGRES) {
    let pgSql = toPosgresParams(sql);
    if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
      pgSql += ' RETURNING id';
    }
    const rows = await getNeonSql()(pgSql, params);
    return { lastID: rows && rows[0] ? rows[0].id : null, changes: rows ? rows.length : 0 };
  }
  return new Promise((resolve, reject) => {
    getSQLite().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ─────────────────────────────────────────────
// Schema init — lazy, runs once, queues callers
// ─────────────────────────────────────────────
let _schemaState = 'pending'; // pending | initializing | ready | error
let _schemaError = null;
let _schemaCallbacks = [];

async function _initSchema() {
  const PK = USE_POSTGRES ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const TS = USE_POSTGRES ? 'TIMESTAMPTZ DEFAULT NOW()' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';

  const tables = [
    `CREATE TABLE IF NOT EXISTS projects (
      id ${PK},
      title TEXT NOT NULL,
      "beforeImagePath" TEXT NOT NULL,
      "afterImagePath"  TEXT NOT NULL,
      "createdAt" ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS reviews (
      id ${PK},
      "clientName" TEXT NOT NULL,
      rating INTEGER NOT NULL,
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

  for (const sql of tables) {
    await runAsync(sql, []);
  }

  // Seed default services if empty
  const svcCount = await queryAsync('SELECT COUNT(*) as count FROM services', []);
  if (parseInt(svcCount[0].count) === 0) {
    const svcs = [
      ['Interior Design Consultation', 'Professional consultation for your space redesign', 'consultation', 0],
      ['Residential Design',           'Complete interior design solutions for homes',      'home',         1],
      ['Commercial Space Planning',    'Strategic design for offices and commercial spaces','building',     2],
      ['Color & Material Selection',   'Expert guidance on colors and material combinations','palette',    3],
      ['3D Visualization',             'Photorealistic 3D renderings of your space',        'visualization',4],
      ['Furniture Curation',           'Handpicked furniture selection and styling',         'furniture',   5],
      ['Lighting Design',              'Strategic lighting for ambiance and functionality',  'lightbulb',   6],
      ['Project Management',           'Complete project oversight from design to finish',   'task',        7],
    ];
    for (const s of svcs) {
      await runAsync('INSERT INTO services (name, description, "iconType", "orderIndex") VALUES (?, ?, ?, ?)', s);
    }
  }

  // Seed default categories if empty
  const catCount = await queryAsync('SELECT COUNT(*) as count FROM completed_work_categories', []);
  if (parseInt(catCount[0].count) === 0) {
    const cats = [['Bedroom',0],['Living Room',1],['Kitchen',2],['Bathroom',3],['Dining Room',4]];
    for (const c of cats) {
      await runAsync('INSERT INTO completed_work_categories (name, "orderIndex") VALUES (?, ?)', c);
    }
  }

  console.log('Database schema ready');
}

function ensureSchema(callback) {
  if (_schemaState === 'ready')  return callback(null);
  if (_schemaState === 'error')  return callback(_schemaError);

  _schemaCallbacks.push(callback);
  if (_schemaState === 'initializing') return; // already in progress

  _schemaState = 'initializing';
  _initSchema()
    .then(() => {
      _schemaState = 'ready';
      const cbs = _schemaCallbacks.splice(0);
      cbs.forEach(cb => cb(null));
    })
    .catch(err => {
      console.error('Schema init failed:', err.message);
      _schemaState = 'error';
      _schemaError = err;
      const cbs = _schemaCallbacks.splice(0);
      cbs.forEach(cb => cb(err));
    });
}

// ─────────────────────────────────────────────
// Row normaliser (PG returns lowercase column names)
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
    orderIndex:      row.orderIndex      !== undefined ? row.orderIndex : row.orderindex,
    name:            row.name,
    iconType:        row.iconType        || row.icontype,
    clientName:      row.clientName      || row.clientname,
    rating:          row.rating,
    reviewText:      row.reviewText      || row.reviewtext,
    visible:         row.visible,
    createdAt:       row.createdAt       || row.createdat,
    count:           row.count
  };
}
function normAll(rows) { return (rows || []).map(norm); }

// ─────────────────────────────────────────────
// Wrapper: ensures schema ready before each call
// ─────────────────────────────────────────────
function db(asyncFn) {
  return function (...args) {
    const callback = args[args.length - 1];
    ensureSchema(err => {
      if (err) return callback(err, null);
      asyncFn(...args).then(
        result => callback(null, result),
        err    => callback(err, null)
      );
    });
  };
}

// ─────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────
const getAllProjects = db(async (callback) => {
  const rows = await queryAsync('SELECT * FROM projects ORDER BY "createdAt" DESC', []);
  return normAll(rows);
});

const getProjectById = db(async (id, callback) => {
  const rows = await queryAsync('SELECT * FROM projects WHERE id = ?', [id]);
  return norm(rows[0]);
});

const addProject = db(async (title, before, after, callback) => {
  return runAsync('INSERT INTO projects (title, "beforeImagePath", "afterImagePath") VALUES (?, ?, ?)', [title, before, after]);
});

const deleteProject = db(async (id, callback) => {
  return runAsync('DELETE FROM projects WHERE id = ?', [id]);
});

const updateProject = db(async (id, title, before, after, callback) => {
  return runAsync('UPDATE projects SET title = ?, "beforeImagePath" = ?, "afterImagePath" = ? WHERE id = ?', [title, before, after, id]);
});

// ─────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────
const getAllReviews = db(async (callback) => {
  const rows = await queryAsync('SELECT * FROM reviews WHERE visible = 1 ORDER BY "createdAt" DESC', []);
  return normAll(rows);
});

const addReview = db(async (clientName, rating, reviewText, callback) => {
  return runAsync('INSERT INTO reviews ("clientName", rating, "reviewText", visible) VALUES (?, ?, ?, 1)', [clientName, rating, reviewText]);
});

const deleteReview = db(async (id, callback) => {
  return runAsync('DELETE FROM reviews WHERE id = ?', [id]);
});

const toggleReviewVisibility = db(async (id, visible, callback) => {
  return runAsync('UPDATE reviews SET visible = ? WHERE id = ?', [visible, id]);
});

// ─────────────────────────────────────────────
// Completed Works
// ─────────────────────────────────────────────
const getAllCompletedWorks = db(async (callback) => {
  const rows = await queryAsync('SELECT * FROM completed_works ORDER BY "orderIndex" ASC, "createdAt" DESC', []);
  return normAll(rows);
});

const addCompletedWork = db(async (title, description, imagePath, category, callback) => {
  const rows = await queryAsync('SELECT MAX("orderIndex") as "maxOrder" FROM completed_works', []);
  const next = rows[0] && rows[0].maxOrder != null ? parseInt(rows[0].maxOrder) + 1 : 0;
  return runAsync('INSERT INTO completed_works (title, description, "imagePath", category, "orderIndex") VALUES (?, ?, ?, ?, ?)',
    [title, description, imagePath, category, next]);
});

const deleteCompletedWork = db(async (id, callback) => {
  return runAsync('DELETE FROM completed_works WHERE id = ?', [id]);
});

const updateCompletedWork = db(async (id, title, description, category, callback) => {
  return runAsync('UPDATE completed_works SET title = ?, description = ?, category = ? WHERE id = ?', [title, description, category, id]);
});

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────
const getAllCompletedWorkCategories = db(async (callback) => {
  const rows = await queryAsync('SELECT * FROM completed_work_categories ORDER BY "orderIndex" ASC', []);
  return normAll(rows);
});

const addCompletedWorkCategory = db(async (name, callback) => {
  const rows = await queryAsync('SELECT MAX("orderIndex") as "maxOrder" FROM completed_work_categories', []);
  const next = rows[0] && rows[0].maxOrder != null ? parseInt(rows[0].maxOrder) + 1 : 0;
  return runAsync('INSERT INTO completed_work_categories (name, "orderIndex") VALUES (?, ?)', [name, next]);
});

const deleteCompletedWorkCategory = db(async (id, callback) => {
  const rows = await queryAsync('SELECT name FROM completed_work_categories WHERE id = ?', [id]);
  const catName = rows[0] ? rows[0].name : null;
  await runAsync('UPDATE completed_works SET category = ? WHERE category = ?', ['Uncategorized', catName]);
  return runAsync('DELETE FROM completed_work_categories WHERE id = ?', [id]);
});

// ─────────────────────────────────────────────
// Services
// ─────────────────────────────────────────────
const getAllServices = db(async (callback) => {
  const rows = await queryAsync('SELECT * FROM services ORDER BY "orderIndex" ASC', []);
  return normAll(rows);
});

const addService = db(async (name, description, iconType, callback) => {
  const rows = await queryAsync('SELECT MAX("orderIndex") as "maxOrder" FROM services', []);
  const next = rows[0] && rows[0].maxOrder != null ? parseInt(rows[0].maxOrder) + 1 : 0;
  return runAsync('INSERT INTO services (name, description, "iconType", "orderIndex") VALUES (?, ?, ?, ?)',
    [name, description, iconType, next]);
});

const deleteService = db(async (id, callback) => {
  return runAsync('DELETE FROM services WHERE id = ?', [id]);
});

const updateServiceOrder = db(async (id, orderIndex, callback) => {
  return runAsync('UPDATE services SET "orderIndex" = ? WHERE id = ?', [orderIndex, id]);
});

module.exports = {
  getAllProjects, getProjectById, addProject, deleteProject, updateProject,
  getAllReviews, addReview, deleteReview, toggleReviewVisibility,
  getAllCompletedWorks, addCompletedWork, deleteCompletedWork, updateCompletedWork,
  getAllCompletedWorkCategories, addCompletedWorkCategory, deleteCompletedWorkCategory,
  getAllServices, addService, deleteService, updateServiceOrder
};
