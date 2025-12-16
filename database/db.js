import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Use Render persistent disk
const dbPath = path.join('/var/data', 'db.sqlite'); // <-- persistent path
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

export default db;

