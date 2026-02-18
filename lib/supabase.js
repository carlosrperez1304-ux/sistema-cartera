/**
 * Cliente Supabase (PostgreSQL) — CartaMaster
 * Solo se usa en server-side (API routes). Nunca exponer al cliente.
 */
import { createClient } from '@supabase/supabase-js';

let _client = null;

export function db() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '❌ Faltan variables de entorno: agrega SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local'
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
