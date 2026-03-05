import { db } from '../../../../lib/supabase.js';
import { requireAuth } from '../../../../lib/security.js';

// GET — lista de cliente_ids que ya tienen al menos un documento
// Usado por carga masiva para evitar duplicar documentos
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await db()
    .from('cotizaciones')
    .select('cliente_id');

  if (error) return Response.json({ ids: [] });

  // Deduplica — solo necesitamos saber SI tiene, no cuántos
  const ids = [...new Set((data || []).map(r => r.cliente_id).filter(Boolean))];
  return Response.json({ ids });
}
