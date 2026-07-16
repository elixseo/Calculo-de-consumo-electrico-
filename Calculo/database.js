const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'consumo.db');
const db = new sqlite3.Database(dbPath);

// Utility: hash password with salt
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

// Database helper queries wrapped in Promises
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Create default admin and test supervisor user on first run
async function seedDefaultUsers() {
  const existing = await dbGet('SELECT id FROM usuarios WHERE username = ?', ['admin']);
  if (!existing) {
    const adminSalt = crypto.randomBytes(16).toString('hex');
    const adminHash = hashPassword('admin', adminSalt);
    await dbRun(
      'INSERT INTO usuarios (username, password, salt, role, nombre) VALUES (?, ?, ?, ?, ?)',
      ['admin', adminHash, adminSalt, 'admin', 'Administrador']
    );

    const supSalt = crypto.randomBytes(16).toString('hex');
    const supHash = hashPassword('1234', supSalt);
    await dbRun(
      'INSERT INTO usuarios (username, password, salt, role, nombre) VALUES (?, ?, ?, ?, ?)',
      ['supervisor1', supHash, supSalt, 'usuario', 'Supervisor de Prueba']
    );
    console.log('Default users seeded: admin/admin, supervisor1/1234');
  }
}

// Initialize database schema
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Master Machine Power Table
      db.run(`
        CREATE TABLE IF NOT EXISTS maquinas_potencia (
          nro_maquina INTEGER PRIMARY KEY,
          maquina TEXT,
          marca TEXT,
          modelo TEXT,
          potencia REAL DEFAULT 0
        )
      `, (err) => { if (err) reject(err); });

      // 2. Master Services / Houses Table
      db.run(`
        CREATE TABLE IF NOT EXISTS servicios_casas (
          nro_casa INTEGER PRIMARY KEY,
          nombre_servicio TEXT
        )
      `, (err) => { if (err) reject(err); });

      // 3. Monthly Inventory / Calculations Table
      db.run(`
        CREATE TABLE IF NOT EXISTS inventario_mensual (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mes TEXT,
          nro_maquina INTEGER,
          nro_casa INTEGER,
          fecha_incorporacion TEXT,
          hs_dia REAL DEFAULT 0,
          calculo REAL DEFAULT 0,
          unidad_negocio TEXT
        )
      `, (err) => { if (err) reject(err); });

      // 4. Import History Table
      db.run(`
        CREATE TABLE IF NOT EXISTS importes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT,
          mes TEXT,
          fecha_importacion TEXT,
          total_filas INTEGER
        )
      `, (err) => { if (err) reject(err); });

      // 5. Users Table (Auth)
      db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          salt TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'usuario',
          nombre TEXT,
          activo INTEGER NOT NULL DEFAULT 1
        )
      `, (err) => {
        if (err) reject(err);
        // Migration: add 'activo' column if it doesn't exist (for existing DBs)
        else db.run(`ALTER TABLE usuarios ADD COLUMN activo INTEGER NOT NULL DEFAULT 1`, () => {});
      });

      // 6. User-Service Assignment Table
      db.run(`
        CREATE TABLE IF NOT EXISTS usuario_servicios (
          usuario_id INTEGER NOT NULL,
          nro_casa INTEGER NOT NULL,
          PRIMARY KEY (usuario_id, nro_casa),
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
      `, (err) => { if (err) reject(err); });

      // 7. Monthly Closures + Audit Photo Table
      db.run(`
        CREATE TABLE IF NOT EXISTS cierres_mensuales (
          mes TEXT NOT NULL,
          nro_casa INTEGER NOT NULL,
          usuario_id INTEGER NOT NULL,
          fecha_cierre TEXT NOT NULL,
          foto_auditoria TEXT,
          PRIMARY KEY (mes, nro_casa)
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          seedDefaultUsers().then(() => {
            console.log('Database tables initialized successfully.');
            resolve();
          }).catch(reject);
        }
      });
    });
  });
}

module.exports = {
  db,
  initDatabase,
  dbRun,
  dbAll,
  dbGet,
  hashPassword
};
