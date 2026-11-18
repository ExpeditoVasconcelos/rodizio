import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { backupTo, closeDatabase, openDatabase } from '../database/connection.js';

/** `npm run backup` — copia consistente do banco real (pode ser executado com o servidor ligado). */
const config = loadConfig();
const source = path.join(config.dataDir, 'rodizio.db');
if (!fs.existsSync(source)) {
  console.error('Banco de dados ainda não existe:', source);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const dest = path.join(config.backupsDir, `rodizio-${stamp}-manual.db`);
const db = openDatabase(source);
backupTo(db, dest);
closeDatabase(db);
console.log('Backup criado em:', dest);

