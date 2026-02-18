/**
 * Ejecutar una sola vez para migrar contraseñas a bcrypt:
 *   node scripts/hash-passwords.mjs
 */
import bcrypt from 'bcryptjs';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, '../data/users.json');

const users = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
let migrated = 0;

for (const [key, u] of Object.entries(users)) {
  if (!u.pass.startsWith('$2')) {          // No es bcrypt todavía
    users[key].pass = bcrypt.hashSync(u.pass, 12);
    migrated++;
    console.log(`✓ ${key} migrado`);
  } else {
    console.log(`  ${key} ya tiene hash`);
  }
}

writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
console.log(`\n✅ ${migrated} contraseña(s) hasheadas. Archivo actualizado.`);
