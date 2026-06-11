import { db } from '../../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const nombre = searchParams.get('nombre');
  if (!nombre) return Response.json(null);

  const { data, error } = await db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id')
    .ilike('nombre', '%' + nombre + '%')
    .limit(1)
    .single();

  if (error) return Response.json(null);
  return Response.json(data);
}
