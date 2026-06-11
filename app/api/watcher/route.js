import { db } from '../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const nombre = searchParams.get('nombre');
  const secret = searchParams.get('secret');

  // Clave interna para el watcher de Electron
  if (secret !== 'paytrack-watcher-2026') {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

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
