const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const crypto = require('crypto');
const fs = require('fs');
const { initDatabase, dbRun, dbAll, dbGet, hashPassword } = require('./database');

const app = express();
const PORT = process.env.PORT || 3005;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'cierres');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer: in-memory for Excel imports
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Multer: disk storage for audit photos
const uploadDisk = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `cierre_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen.'));
  }
});

// ─── AUTH TOKEN STORE (in-memory; production would use JWT/Redis) ───────────
const activeSessions = new Map(); // token -> { userId, role, username, nombre }

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware: verify token, attach user to req
function authenticate(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado. Inicie sesión.' });
  }
  const token = auth.slice(7);
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
  req.user = session;
  req.token = token;
  next();
}

// Middleware: only admins
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
  }
  next();
}

// ─── HELPER: Excel date parsing ──────────────────────────────────────────────
function parseExcelDate(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return String(val);
}

// ─── HELPER: Excel column mapper ─────────────────────────────────────────────
function mapExcelRow(row) {
  const keys = Object.keys(row);
  const nro_maquina_key = keys.find(k => {
    const l = k.toLowerCase();
    return (l.includes('inventario') || l.includes('maquina') || l.includes('máquina')) && l.includes('nro');
  }) || keys.find(k => {
    const l = k.toLowerCase();
    return l.includes('maquina') || l.includes('máquina') || l.includes('nro_inv') || l.includes('inventario');
  });
  const maquina_key = keys.find(k => {
    const l = k.toLowerCase();
    return l.includes('maquinarias por nro') || l.includes('descripción') || l.includes('descripcion') || l.includes('maquina') || l.includes('máquina');
  });
  const marca_key = keys.find(k => k.toLowerCase().includes('marca'));
  const modelo_key = keys.find(k => k.toLowerCase().includes('modelo'));
  const fecha_inc_key = keys.find(k => {
    const l = k.toLowerCase();
    return l.includes('incorporación') || l.includes('incorporacion') || l.includes('ingreso') || l.includes('fecha');
  });
  const nro_casa_key = keys.find(k => {
    const l = k.toLowerCase();
    return l.includes('casa') && !l.includes('nombre') && !l.includes('servicio') && !l.includes('unidad');
  });
  const potencia_key = keys.find(k => k.toLowerCase().includes('potencia'));
  const hs_dia_key = keys.find(k => {
    const l = k.toLowerCase();
    return l.includes('hs-dia') || l.includes('hs/dia') || l.includes('hs-día') || l.includes('hs/día') || l.includes('horas de uso') || l.includes('hs/d') || l.includes('hs_dia') || l.includes('hs.dia') || l.includes('hs. dia');
  });
  const nombre_servicio_key = keys.find(k => {
    const l = k.toLowerCase();
    return l.includes('nombreservicio') || l.includes('nombre servicio') || (l.includes('nombre') && l.includes('casa')) || l.includes('servicio');
  });
  return {
    nro_maquina: row[nro_maquina_key],
    maquina: row[maquina_key],
    marca: row[marca_key],
    modelo: row[modelo_key],
    fecha_incorporacion: row[fecha_inc_key],
    nro_casa: row[nro_casa_key],
    potencia: row[potencia_key],
    hs_dia: row[hs_dia_key],
    nombre_servicio: row[nombre_servicio_key]
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES (Public)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }
  try {
    const user = await dbGet('SELECT * FROM usuarios WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

    if (!user.activo) return res.status(403).json({ error: 'Su cuenta está desactivada. Contacte al administrador.' });

    const hash = hashPassword(password, user.salt);
    if (hash !== user.password) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

    const token = generateToken();
    activeSessions.set(token, {
      userId: user.id,
      role: user.role,
      username: user.username,
      nombre: user.nombre
    });

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, nombre: user.nombre }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', authenticate, (req, res) => {
  activeSessions.delete(req.token);
  res.json({ success: true });
});

// GET /api/auth/me - verify current session
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT ROUTES (Admin only)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/usuarios
app.get('/api/usuarios', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll('SELECT id, username, role, nombre, activo FROM usuarios ORDER BY role DESC, nombre ASC');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/usuarios - create user
app.post('/api/usuarios', authenticate, requireAdmin, async (req, res) => {
  const { username, password, nombre, role } = req.body;
  if (!username || !password || !nombre) {
    return res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos.' });
  }
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const result = await dbRun(
      'INSERT INTO usuarios (username, password, salt, role, nombre) VALUES (?, ?, ?, ?, ?)',
      [username, hash, salt, role || 'usuario', nombre]
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'El nombre de usuario ya existe.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// DELETE /api/usuarios/:id
app.delete('/api/usuarios/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.userId) {
    return res.status(400).json({ error: 'No puede eliminar su propio usuario.' });
  }
  try {
    await dbRun('DELETE FROM usuarios WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/usuarios/:id/activo - Toggle active status
app.put('/api/usuarios/:id/activo', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  if (parseInt(id) === req.user.userId) {
    return res.status(400).json({ error: 'No puede desactivar su propio usuario.' });
  }
  try {
    await dbRun('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/usuarios/:id/password - Change user password
app.put('/api/usuarios/:id/password', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'La contraseña no puede estar vacía.' });
  }
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    await dbRun('UPDATE usuarios SET password = ?, salt = ? WHERE id = ?', [hash, salt, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/usuarios/:id/servicios - get assigned services for a user
app.get('/api/usuarios/:id/servicios', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT us.nro_casa, sc.nombre_servicio
      FROM usuario_servicios us
      JOIN servicios_casas sc ON us.nro_casa = sc.nro_casa
      WHERE us.usuario_id = ?
      ORDER BY sc.nombre_servicio ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/usuarios/:id/servicios - set services for a user (full replace)
app.post('/api/usuarios/:id/servicios', authenticate, requireAdmin, async (req, res) => {
  const { casas } = req.body; // array of nro_casa
  const { id } = req.params;
  try {
    await dbRun('BEGIN TRANSACTION');
    await dbRun('DELETE FROM usuario_servicios WHERE usuario_id = ?', [id]);
    if (casas && casas.length > 0) {
      for (const nro_casa of casas) {
        await dbRun('INSERT OR IGNORE INTO usuario_servicios (usuario_id, nro_casa) VALUES (?, ?)', [id, nro_casa]);
      }
    }
    await dbRun('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await dbRun('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA ROUTES (Protected)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/meses
app.get('/api/meses', authenticate, async (req, res) => {
  try {
    const rows = await dbAll('SELECT DISTINCT mes FROM inventario_mensual ORDER BY mes DESC');
    res.json(rows.map(r => r.mes));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/servicios
app.get('/api/servicios', authenticate, async (req, res) => {
  const { mes, unidad } = req.query;
  try {
    let sql, params = [], conditions = [];

    if (req.user.role === 'usuario') {
      // Supervisors only see their assigned services
      sql = `
        SELECT DISTINCT s.nro_casa, s.nombre_servicio, i.unidad_negocio
        FROM servicios_casas s
        JOIN inventario_mensual i ON s.nro_casa = i.nro_casa
        JOIN usuario_servicios us ON s.nro_casa = us.nro_casa
        WHERE us.usuario_id = ?
      `;
      params.push(req.user.userId);
      if (mes) { sql += ' AND i.mes = ?'; params.push(mes); }
      if (unidad) { sql += ' AND i.unidad_negocio = ?'; params.push(unidad); }
    } else {
      if (!mes && !unidad) {
        sql = `SELECT nro_casa, nombre_servicio FROM servicios_casas ORDER BY nombre_servicio ASC`;
      } else {
        sql = `
          SELECT DISTINCT s.nro_casa, s.nombre_servicio, i.unidad_negocio
          FROM servicios_casas s
          JOIN inventario_mensual i ON s.nro_casa = i.nro_casa
        `;
        if (mes) { conditions.push('i.mes = ?'); params.push(mes); }
        if (unidad) { conditions.push('i.unidad_negocio = ?'); params.push(unidad); }
        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY s.nombre_servicio ASC';
      }
    }

    if (sql && !sql.includes('ORDER BY')) {
       sql += ' ORDER BY s.nombre_servicio ASC';
    }
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard
app.get('/api/dashboard', authenticate, async (req, res) => {
  const { mes, unidad, servicio } = req.query;
  if (!mes) return res.status(400).json({ error: 'El parámetro "mes" es requerido.' });

  try {
    const [year, monthStr] = mes.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(monthStr), 0).getDate();

    let filterSql = 'WHERE i.mes = ?';
    let params = [mes];

    if (unidad) { filterSql += ' AND i.unidad_negocio = ?'; params.push(unidad); }

    // Restrict supervisors to their assigned services
    if (req.user.role === 'usuario') {
      const assigned = await dbAll('SELECT nro_casa FROM usuario_servicios WHERE usuario_id = ?', [req.user.userId]);
      const casas = assigned.map(r => r.nro_casa);
      if (casas.length === 0) {
        return res.json({ kpis: { totalPotenciaKw: 0, totalConsumoDiaKwh: 0, totalConsumoMesKwh: 0, cantMaquinas: 0, cantServicios: 0 }, chartTrend: [], chartMaquinas: [], chartServicios: [] });
      }
      filterSql += ` AND i.nro_casa IN (${casas.map(() => '?').join(',')})`;
      params.push(...casas);
    } else if (servicio) {
      filterSql += ' AND i.nro_casa = ?';
      params.push(parseInt(servicio));
    }

    const kpis = await dbGet(`
      SELECT 
        SUM(p.potencia) / 1000.0 AS totalPotenciaKw,
        SUM(i.calculo) / 1000.0 AS totalConsumoDiaKwh,
        (SUM(i.calculo) / 1000.0) * ? AS totalConsumoMesKwh,
        COUNT(DISTINCT i.nro_maquina) AS cantMaquinas,
        COUNT(DISTINCT i.nro_casa) AS cantServicios
      FROM inventario_mensual i
      JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
      ${filterSql}
    `, [daysInMonth, ...params]);

    let trend;
    if (servicio && req.user.role === 'admin') {
      const trendRows = await dbAll(`
        SELECT i.mes, SUM(i.calculo) / 1000.0 AS total
        FROM inventario_mensual i
        WHERE i.nro_casa = ?
        GROUP BY i.mes ORDER BY i.mes ASC
      `, [parseInt(servicio)]);
      const serviceObj = await dbGet('SELECT nombre_servicio FROM servicios_casas WHERE nro_casa = ?', [parseInt(servicio)]);
      const serviceLabel = serviceObj ? serviceObj.nombre_servicio : `Servicio ${servicio}`;
      trend = trendRows.map(r => {
        const [y, m] = r.mes.split('-');
        const d = new Date(parseInt(y), parseInt(m), 0).getDate();
        return { mes: r.mes, [serviceLabel]: r.total * d };
      });
    } else {
      let trendFilterSql = '';
      let trendParams = [];
      if (req.user.role === 'usuario') {
        const assigned = await dbAll('SELECT nro_casa FROM usuario_servicios WHERE usuario_id = ?', [req.user.userId]);
        const casas = assigned.map(r => r.nro_casa);
        if (casas.length > 0) {
          trendFilterSql = `WHERE i.nro_casa IN (${casas.map(() => '?').join(',')})`;
          trendParams.push(...casas);
        } else {
          trendFilterSql = 'WHERE 1=0';
        }
      }

      const trendRows = await dbAll(`
        SELECT 
          i.mes,
          SUM(CASE WHEN i.unidad_negocio = 'Limpiolux S.A.' THEN i.calculo ELSE 0 END) / 1000.0 AS limpiolux,
          SUM(CASE WHEN i.unidad_negocio = 'Ceiling Solution S.A.' THEN i.calculo ELSE 0 END) / 1000.0 AS ceiling
        FROM inventario_mensual i
        JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
        ${trendFilterSql}
        GROUP BY i.mes ORDER BY i.mes ASC
      `, trendParams);
      trend = trendRows.map(r => {
        const [y, m] = r.mes.split('-');
        const d = new Date(parseInt(y), parseInt(m), 0).getDate();
        return { mes: r.mes, 'Limpiolux S.A.': r.limpiolux * d, 'Ceiling Solution S.A.': r.ceiling * d };
      });
    }

    const machinesQuery = await dbAll(`
      SELECT p.maquina AS name, (SUM(i.calculo) / 1000.0) * ? AS value
      FROM inventario_mensual i
      JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
      ${filterSql}
      GROUP BY p.maquina ORDER BY value DESC LIMIT 8
    `, [daysInMonth, ...params]);

    let servicesQuery;
    if (servicio && req.user.role === 'admin') {
      servicesQuery = await dbAll(`
        SELECT (p.maquina || ' (N° ' || i.nro_maquina || ')') AS name, (i.calculo / 1000.0) * ? AS value
        FROM inventario_mensual i
        JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
        WHERE i.mes = ? AND i.nro_casa = ?
        ORDER BY value DESC LIMIT 8
      `, [daysInMonth, mes, parseInt(servicio)]);
    } else {
      servicesQuery = await dbAll(`
        SELECT s.nombre_servicio AS name, (SUM(i.calculo) / 1000.0) * ? AS value
        FROM inventario_mensual i
        JOIN servicios_casas s ON i.nro_casa = s.nro_casa
        JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
        ${filterSql}
        GROUP BY s.nombre_servicio ORDER BY value DESC LIMIT 8
      `, [daysInMonth, ...params]);
    }

    res.json({
      kpis: {
        totalPotenciaKw: kpis.totalPotenciaKw || 0,
        totalConsumoDiaKwh: kpis.totalConsumoDiaKwh || 0,
        totalConsumoMesKwh: kpis.totalConsumoMesKwh || 0,
        cantMaquinas: kpis.cantMaquinas || 0,
        cantServicios: kpis.cantServicios || 0
      },
      chartTrend: trend,
      chartMaquinas: machinesQuery,
      chartServicios: servicesQuery
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/consumo
app.get('/api/consumo', authenticate, async (req, res) => {
  const { mes, unidad, servicio, search, page = 1, limit = 50 } = req.query;
  if (!mes) return res.status(400).json({ error: 'El parámetro "mes" es requerido.' });

  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let countSql = `
      SELECT COUNT(*) as total 
      FROM inventario_mensual i
      JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
      JOIN servicios_casas s ON i.nro_casa = s.nro_casa
      WHERE i.mes = ?
    `;
    let querySql = `
      SELECT i.id, i.mes, i.nro_maquina, p.maquina, p.marca, p.modelo,
        i.fecha_incorporacion, i.nro_casa, s.nombre_servicio,
        p.potencia, i.hs_dia, i.calculo, i.unidad_negocio
      FROM inventario_mensual i
      JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
      JOIN servicios_casas s ON i.nro_casa = s.nro_casa
      WHERE i.mes = ?
    `;

    const params = [mes];

    if (unidad) { countSql += ' AND i.unidad_negocio = ?'; querySql += ' AND i.unidad_negocio = ?'; params.push(unidad); }

    if (req.user.role === 'usuario') {
      const assigned = await dbAll('SELECT nro_casa FROM usuario_servicios WHERE usuario_id = ?', [req.user.userId]);
      const casas = assigned.map(r => r.nro_casa);
      if (casas.length === 0) {
        return res.json({ rows: [], total: 0, page: 1, totalPages: 0 });
      }
      const ph = casas.map(() => '?').join(',');
      countSql += ` AND i.nro_casa IN (${ph})`;
      querySql += ` AND i.nro_casa IN (${ph})`;
      params.push(...casas);
    } else if (servicio) {
      countSql += ' AND i.nro_casa = ?'; querySql += ' AND i.nro_casa = ?'; params.push(parseInt(servicio));
    }

    if (search) {
      const sp = `%${search}%`;
      const searchSql = ` AND (p.maquina LIKE ? OR p.marca LIKE ? OR p.modelo LIKE ? OR s.nombre_servicio LIKE ? OR CAST(i.nro_maquina AS TEXT) LIKE ? OR CAST(i.nro_casa AS TEXT) LIKE ?)`;
      countSql += searchSql; querySql += searchSql;
      params.push(sp, sp, sp, sp, sp, sp);
    }

    querySql += ' ORDER BY s.nombre_servicio ASC, p.maquina ASC LIMIT ? OFFSET ?';
    const queryParams = [...params, parseInt(limit), offset];
    const totalRes = await dbGet(countSql, params);
    const rows = await dbAll(querySql, queryParams);

    res.json({ rows, total: totalRes.total, page: parseInt(page), totalPages: Math.ceil(totalRes.total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/consumo/:id
app.get('/api/consumo/:id', authenticate, async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM inventario_mensual WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/consumo/:id - Edit potencia/hs_dia (blocks if month is closed for that service)
app.put('/api/consumo/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { potencia, hs_dia } = req.body;
  if (potencia === undefined || hs_dia === undefined) {
    return res.status(400).json({ error: 'Los parámetros "potencia" y "hs_dia" son requeridos.' });
  }
  try {
    const current = await dbGet('SELECT nro_maquina, mes, nro_casa FROM inventario_mensual WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Registro no encontrado.' });

    // Check if this service/month is closed (locked)
    const cierre = await dbGet('SELECT fecha_cierre FROM cierres_mensuales WHERE mes = ? AND nro_casa = ?', [current.mes, current.nro_casa]);
    if (cierre) {
      return res.status(400).json({ error: `Este servicio fue cerrado para auditoría el ${new Date(cierre.fecha_cierre).toLocaleDateString('es-AR')}. No se puede modificar.` });
    }

    await dbRun('BEGIN TRANSACTION');
    await dbRun('UPDATE maquinas_potencia SET potencia = ? WHERE nro_maquina = ?', [parseFloat(potencia), current.nro_maquina]);
    await dbRun('UPDATE inventario_mensual SET hs_dia = ?, calculo = ? * ? WHERE id = ?', [parseFloat(hs_dia), parseFloat(potencia), parseFloat(hs_dia), id]);
    await dbRun('UPDATE inventario_mensual SET calculo = ? * hs_dia WHERE nro_maquina = ?', [parseFloat(potencia), current.nro_maquina]);
    await dbRun('COMMIT');

    const updatedRow = await dbGet(`
      SELECT i.id, i.mes, i.nro_maquina, p.maquina, p.marca, p.modelo,
        i.fecha_incorporacion, i.nro_casa, s.nombre_servicio,
        p.potencia, i.hs_dia, i.calculo, i.unidad_negocio
      FROM inventario_mensual i
      JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
      JOIN servicios_casas s ON i.nro_casa = s.nro_casa
      WHERE i.id = ?
    `, [id]);
    res.json(updatedRow);
  } catch (error) {
    await dbRun('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SUPERVISOR: Bulk update Hs/Día for a service/month
// ═══════════════════════════════════════════════════════════════════════════
// POST /api/horas - Save multiple machine hours at once
app.post('/api/horas', authenticate, async (req, res) => {
  const { mes, nro_casa, items } = req.body;
  // items = [{id, hs_dia}, ...]
  if (!mes || !nro_casa || !items) return res.status(400).json({ error: 'Faltan parámetros.' });

  // Verify not closed
  const cierre = await dbGet('SELECT fecha_cierre FROM cierres_mensuales WHERE mes = ? AND nro_casa = ?', [mes, nro_casa]);
  if (cierre) return res.status(400).json({ error: 'Este servicio ya fue cerrado para auditoría.' });

  // If supervisor, verify they own this service
  if (req.user.role === 'usuario') {
    const own = await dbGet('SELECT 1 FROM usuario_servicios WHERE usuario_id = ? AND nro_casa = ?', [req.user.userId, nro_casa]);
    if (!own) return res.status(403).json({ error: 'No tiene acceso a este servicio.' });
  }

  try {
    await dbRun('BEGIN TRANSACTION');
    for (const item of items) {
      const row = await dbGet('SELECT p.potencia FROM inventario_mensual i JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina WHERE i.id = ?', [item.id]);
      if (row) {
        const hs = parseFloat(item.hs_dia) || 0;
        await dbRun('UPDATE inventario_mensual SET hs_dia = ?, calculo = ? * ? WHERE id = ?', [hs, row.potencia, hs, item.id]);
      }
    }
    await dbRun('COMMIT');
    res.json({ success: true, message: `${items.length} registros actualizados.` });
  } catch (error) {
    await dbRun('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// GET /api/horas/:mes/:nro_casa - Get machine hours for supervisor input
app.get('/api/horas/:mes/:nro_casa', authenticate, async (req, res) => {
  const { mes, nro_casa } = req.params;
  // If supervisor, verify ownership
  if (req.user.role === 'usuario') {
    const own = await dbGet('SELECT 1 FROM usuario_servicios WHERE usuario_id = ? AND nro_casa = ?', [req.user.userId, nro_casa]);
    if (!own) return res.status(403).json({ error: 'No tiene acceso a este servicio.' });
  }
  try {
    const rows = await dbAll(`
      SELECT i.id, i.nro_maquina, p.maquina, p.marca, p.modelo, p.potencia, i.hs_dia, i.calculo
      FROM inventario_mensual i
      JOIN maquinas_potencia p ON i.nro_maquina = p.nro_maquina
      WHERE i.mes = ? AND i.nro_casa = ?
      ORDER BY p.maquina ASC
    `, [mes, nro_casa]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CLOSURES (Cierres)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/cierres - list closures (admin: all; supervisor: their services)
app.get('/api/cierres', authenticate, async (req, res) => {
  const { mes } = req.query;
  try {
    let sql = `
      SELECT cm.mes, cm.nro_casa, cm.fecha_cierre, cm.foto_auditoria,
        sc.nombre_servicio, u.nombre AS cerrado_por
      FROM cierres_mensuales cm
      JOIN servicios_casas sc ON cm.nro_casa = sc.nro_casa
      JOIN usuarios u ON cm.usuario_id = u.id
    `;
    const params = [];
    const conds = [];
    if (mes) { conds.push('cm.mes = ?'); params.push(mes); }
    if (req.user.role === 'usuario') {
      const assigned = await dbAll('SELECT nro_casa FROM usuario_servicios WHERE usuario_id = ?', [req.user.userId]);
      const casas = assigned.map(r => r.nro_casa);
      if (casas.length > 0) {
        conds.push(`cm.nro_casa IN (${casas.map(() => '?').join(',')})`);
        params.push(...casas);
      } else {
        conds.push('1=0');
      }
    }
    if (conds.length > 0) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY cm.fecha_cierre DESC';
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/cierres - close a service for the month, attach audit photo
app.post('/api/cierres', authenticate, uploadDisk.single('foto'), async (req, res) => {
  const { mes, nro_casa } = req.body;
  if (!mes || !nro_casa) return res.status(400).json({ error: 'Mes y nro_casa son requeridos.' });
  if (!req.file) return res.status(400).json({ error: 'La foto de auditoría es obligatoria para cerrar el período.' });

  // If supervisor, verify ownership
  if (req.user.role === 'usuario') {
    const own = await dbGet('SELECT 1 FROM usuario_servicios WHERE usuario_id = ? AND nro_casa = ?', [req.user.userId, nro_casa]);
    if (!own) return res.status(403).json({ error: 'No tiene acceso a este servicio.' });
  }

  // Check if already closed
  const existing = await dbGet('SELECT 1 FROM cierres_mensuales WHERE mes = ? AND nro_casa = ?', [mes, nro_casa]);
  if (existing) return res.status(400).json({ error: 'Este servicio ya fue cerrado para este mes.' });

  try {
    await dbRun(
      'INSERT INTO cierres_mensuales (mes, nro_casa, usuario_id, fecha_cierre, foto_auditoria) VALUES (?, ?, ?, ?, ?)',
      [mes, parseInt(nro_casa), req.user.userId, new Date().toISOString(), req.file.filename]
    );
    res.json({ success: true, foto: req.file.filename });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/cierres/:mes/:nro_casa - Reopen a closed period (admin only)
app.delete('/api/cierres/:mes/:nro_casa', authenticate, requireAdmin, async (req, res) => {
  const { mes, nro_casa } = req.params;
  try {
    await dbRun('DELETE FROM cierres_mensuales WHERE mes = ? AND nro_casa = ?', [mes, nro_casa]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT & ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/import
app.post('/api/import', authenticate, requireAdmin, uploadMemory.single('file'), async (req, res) => {
  const { mes } = req.body;
  const file = req.file;
  if (!mes || !file) return res.status(400).json({ error: 'Falta seleccionar el mes o cargar el archivo Excel.' });

  try {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = xlsx.utils.sheet_to_json(sheet);
    if (rawRows.length === 0) return res.status(400).json({ error: 'El archivo Excel está vacío.' });

    const sampleMapping = mapExcelRow(rawRows[0]);
    if (sampleMapping.nro_maquina === undefined && sampleMapping.nro_casa === undefined) {
      return res.status(400).json({ error: 'No se pudieron mapear las columnas requeridas.' });
    }

    await dbRun('BEGIN TRANSACTION');
    await dbRun('DELETE FROM inventario_mensual WHERE mes = ?', [mes]);
    await dbRun('DELETE FROM importes WHERE mes = ?', [mes]);

    let importedCount = 0;
    for (const row of rawRows) {
      const mapped = mapExcelRow(row);
      const nro_maquina = parseInt(mapped.nro_maquina) || null;
      const nro_casa = parseInt(mapped.nro_casa) || null;
      if (!nro_maquina || !nro_casa) continue;

      let potencia = 0;
      if (mapped.potencia !== undefined && mapped.potencia !== null && mapped.potencia !== '') {
        potencia = parseFloat(mapped.potencia) || 0;
      } else {
        const knownMachine = await dbGet('SELECT potencia FROM maquinas_potencia WHERE nro_maquina = ?', [nro_maquina]);
        if (knownMachine) potencia = knownMachine.potencia;
      }

      let nombre_servicio = '';
      if (mapped.nombre_servicio !== undefined && mapped.nombre_servicio !== null && mapped.nombre_servicio !== '') {
        nombre_servicio = mapped.nombre_servicio;
      } else {
        const knownService = await dbGet('SELECT nombre_servicio FROM servicios_casas WHERE nro_casa = ?', [nro_casa]);
        nombre_servicio = knownService ? knownService.nombre_servicio : `Servicio Casa ${nro_casa}`;
      }

      let hs_dia = 0;
      if (mapped.hs_dia !== undefined && mapped.hs_dia !== null && mapped.hs_dia !== '') {
        hs_dia = parseFloat(mapped.hs_dia) || 0;
      } else {
        const recentUsage = await dbGet('SELECT hs_dia FROM inventario_mensual WHERE nro_maquina = ? AND hs_dia > 0 ORDER BY mes DESC LIMIT 1', [nro_maquina]);
        if (recentUsage) hs_dia = recentUsage.hs_dia;
      }

      const calculo = potencia * hs_dia;
      const isCeiling = nombre_servicio.toLowerCase().includes('ceiling') || nombre_servicio.toLowerCase().includes('solution');
      const unidad_negocio = isCeiling ? 'Ceiling Solution S.A.' : 'Limpiolux S.A.';
      const maquina = mapped.maquina || '';
      const marca = mapped.marca || '';
      const modelo = mapped.modelo || '';
      const fecha_inc = parseExcelDate(mapped.fecha_incorporacion);

      await dbRun(`INSERT INTO maquinas_potencia (nro_maquina, maquina, marca, modelo, potencia) VALUES (?, ?, ?, ?, ?) ON CONFLICT(nro_maquina) DO UPDATE SET maquina=excluded.maquina, marca=excluded.marca, modelo=excluded.modelo, potencia=CASE WHEN excluded.potencia > 0 THEN excluded.potencia ELSE potencia END`, [nro_maquina, maquina, marca, modelo, potencia]);
      await dbRun(`INSERT INTO servicios_casas (nro_casa, nombre_servicio) VALUES (?, ?) ON CONFLICT(nro_casa) DO UPDATE SET nombre_servicio=excluded.nombre_servicio`, [nro_casa, nombre_servicio]);
      await dbRun(`INSERT INTO inventario_mensual (mes, nro_maquina, nro_casa, fecha_incorporacion, hs_dia, calculo, unidad_negocio) VALUES (?, ?, ?, ?, ?, ?, ?)`, [mes, nro_maquina, nro_casa, fecha_inc, hs_dia, calculo, unidad_negocio]);
      importedCount++;
    }

    await dbRun(`INSERT INTO importes (filename, mes, fecha_importacion, total_filas) VALUES (?, ?, ?, ?)`, [file.originalname, mes, new Date().toISOString(), importedCount]);
    await dbRun('COMMIT');
    res.json({ success: true, count: importedCount, message: `Se importaron ${importedCount} filas para el período ${mes}.` });
  } catch (error) {
    await dbRun('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/mes/:mes
app.delete('/api/mes/:mes', authenticate, requireAdmin, async (req, res) => {
  const { mes } = req.params;
  try {
    await dbRun('BEGIN TRANSACTION');
    await dbRun('DELETE FROM inventario_mensual WHERE mes = ?', [mes]);
    await dbRun('DELETE FROM importes WHERE mes = ?', [mes]);
    await dbRun('COMMIT');
    res.json({ success: true, message: `Datos del período ${mes} eliminados correctamente.` });
  } catch (error) {
    await dbRun('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// GET /api/imports
app.get('/api/imports', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM importes ORDER BY fecha_importacion DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
