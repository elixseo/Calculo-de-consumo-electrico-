const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../consumo.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM usuario_servicios", (err, rows) => {
  if (err) console.error(err);
  else console.log(rows);
});
