import { db } from '../../../../lib/supabase.js';
import { requireAuth } from '../../../../lib/security.js';

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const nombre = searchParams.get('nombre');
  if (!nombre) return Response.json(null);

  const { data, error } = await db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id')
    .ilike('nombre', '%' + nombre + '%')
    .limit(1)
    .maybeSingle();

  if (error) return Response.json(null);
  return Response.json(data);
}
