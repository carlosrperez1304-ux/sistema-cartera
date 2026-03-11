import { db } from '../../../../lib/supabase.js';
import { requireAdmin, checkCsrf } from '../../../../lib/security.js';

// POST — elimina todos los documentos de un agente y reinicia sus clientes
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { username } = await req.json();
  if (!username) return Response.json({ error: 'username requerido' }, { status: 400 });

  // 1. Obtener IDs de clientes del agente
  const { data: clientesData, error: cError } = await db()
    .from('clientes')
    .select('id')
    .eq('creado_por', username);

  if (cError) return Response.json({ error: cError.message }, { status: 500 });

  const ids = (clientesData || []).map(c => c.id);
  if (ids.length === 0) return Response.json({ deleted: 0, reset: 0 });

  // 2. Eliminar todas las cotizaciones de esos clientes
  const { error: dError } = await db()
    .from('cotizaciones')
    .delete()
    .in('cliente_id', ids);

  if (dError) return Response.json({ error: dError.message }, { status: 500 });

  // 3. Reiniciar estado y monto de los clientes que estaban Cotizados/Notificados
  const { data: resetData, error: rError } = await db()
    .from('clientes')
    .update({ estado: 'No Generaron', monto: null, fecha_cotizacion: null })
    .in('id', ids)
    .in('estado', ['Cotizado', 'Notificado'])
    .select('id');

  if (rError) return Response.json({ error: rError.message }, { status: 500 });

  return Response.json({ deleted: ids.length, reset: (resetData || []).length });
}
