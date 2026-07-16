const xlsx = require('xlsx');
const path = require('path');
const { initDatabase, dbRun } = require('./database');

const excelPath = path.join(__dirname, 'Consumoelectrico.xlsx');
const TARGET_MONTH = '2025-06'; // Representing JUNIO 2025 as seen in images

function parseExcelDate(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    // 25569 is the difference in days between 1900-01-01 and 1970-01-01
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

async function runSeed() {
  try {
    console.log('Initializing database schema...');
    await initDatabase();

    console.log('Reading Excel file:', excelPath);
    const workbook = xlsx.readFile(excelPath);
    const sheetName = 'Hoja1';
    
    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(`Sheet "${sheetName}" not found in Excel workbook.`);
    }

    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`Successfully read Excel sheet. Total rows to import: ${data.length}`);

    // Begin seed process
    console.log('Clearing existing data for month:', TARGET_MONTH);
    await dbRun('DELETE FROM inventario_mensual WHERE mes = ?', [TARGET_MONTH]);
    await dbRun('DELETE FROM importes WHERE mes = ?', [TARGET_MONTH]);

    let importedCount = 0;

    for (const row of data) {
      // Map columns by exact Excel headers
      const nro_maquina = parseInt(row['Nro Inventario']) || null;
      const maquina = row['Inventario de Maquinarias por Nro.Descripción'] || '';
      const marca = row['Marcas.Descripción'] || '';
      const modelo = row['Modelos.Descripción'] || '';
      const fecha_inc = parseExcelDate(row['Fecha de Incorporación']);
      const nro_casa = parseInt(row['Casa']) || null;
      const potencia = parseFloat(row['potencia']) || 0;
      const hs_dia = parseFloat(row['Hs-dia']) || 0;
      const nombre_servicio = row['NombreServicio'] || '';

      if (!nro_maquina || !nro_casa) {
        // Skip header or invalid row
        continue;
      }

      // Determine business unit based on service name
      const isCeiling = nombre_servicio.toLowerCase().includes('ceiling') || 
                        nombre_servicio.toLowerCase().includes('solution');
      const unidad_negocio = isCeiling ? 'Ceiling Solution S.A.' : 'Limpiolux S.A.';

      // Calculate consumption
      const calculo = potencia * hs_dia;

      // 1. Insert/Update Master Machine Power Rating
      await dbRun(`
        INSERT INTO maquinas_potencia (nro_maquina, maquina, marca, modelo, potencia)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(nro_maquina) DO UPDATE SET
          maquina = excluded.maquina,
          marca = excluded.marca,
          modelo = excluded.modelo,
          potencia = CASE WHEN excluded.potencia > 0 THEN excluded.potencia ELSE potencia END
      `, [nro_maquina, maquina, marca, modelo, potencia]);

      // 2. Insert/Update Master Service Name
      await dbRun(`
        INSERT INTO servicios_casas (nro_casa, nombre_servicio)
        VALUES (?, ?)
        ON CONFLICT(nro_casa) DO UPDATE SET
          nombre_servicio = excluded.nombre_servicio
      `, [nro_casa, nombre_servicio]);

      // 3. Insert into Monthly Inventory Record
      await dbRun(`
        INSERT INTO inventario_mensual (mes, nro_maquina, nro_casa, fecha_incorporacion, hs_dia, calculo, unidad_negocio)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [TARGET_MONTH, nro_maquina, nro_casa, fecha_inc, hs_dia, calculo, unidad_negocio]);

      importedCount++;
    }

    // 4. Record Import History
    await dbRun(`
      INSERT INTO importes (filename, mes, fecha_importacion, total_filas)
      VALUES (?, ?, ?, ?)
    `, ['Consumoelectrico.xlsx', TARGET_MONTH, new Date().toISOString(), importedCount]);

    console.log(`Seed completed successfully! Imported ${importedCount} rows.`);
    process.exit(0);

  } catch (error) {
    console.error('Seed script failed:', error);
    process.exit(1);
  }
}

// Execute the seed if run directly
if (require.main === module) {
  runSeed();
}
