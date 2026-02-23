import { db } from '../../../lib/supabase.js';
import { requireAuth, requireAdmin, checkCsrf } from '../../../lib/security.js';

const CLAVES_PERMITIDAS = ['meta_mensual', 'color_acento', 'recordatorio_dias', 'modo_compacto'];

// GET — leer toda la configuración del sistema
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const empresa_id = auth?.session?.user?.empresa_id || null;
  const baseQ = db().from('config');
  const { data, error } = await (empresa_id ? baseQ.eq('empresa_id', empresa_id) : baseQ).select('clave, valor');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const cfg = {};
  for (const { clave, valor } of (data || [])) {
    cfg[clave] = valor;
  }
  return Response.json(cfg);
}

// POST — actualizar una clave de configuración
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clave, valor } = await req.json();
  if (!CLAVES_PERMITIDAS.includes(clave)) {
    return Response.json({ error: `Clave '${clave}' no permitida.` }, { status: 400 });
  }

  const { error } = await db().from('config').upsert(
    { clave, valor: String(valor), updated_at: new Date().toISOString() },
    { onConflict: 'clave' }
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
