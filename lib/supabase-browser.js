/**
 * Cliente Supabase para el BROWSER — CartaMaster
 *
 * Usa la anon key (pública, segura de exponer).
 * Solo se usa para suscripciones Realtime.
 * Todos los accesos a datos siguen pasando por los API routes
 * (que usan la SERVICE_ROLE_KEY del servidor).
 */
import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabaseBrowser() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || key === 'TU_ANON_KEY_AQUI') {
    console.warn('[Realtime] Falta NEXT_PUBLIC_SUPABASE_ANON_KEY — Realtime desactivado.');
    return null;
  }

  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });

  return _client;
}
