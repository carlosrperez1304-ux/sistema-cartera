import { db } from '../../../lib/supabase.js';

const SECRET = 'paytrack-watcher-2026';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const nombre = searchParams.get('nombre');

  if (secret !== SECRET) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!nombre) return Response.json(null);

  const { data, error } = await db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id, monto')
    .ilike('nombre', '%' + nombre + '%')
    .limit(1)
    .maybeSingle();

  if (error) return Response.json(null);
  return Response.json(data);
}

export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const accion = searchParams.get('accion');
  const id = searchParams.get('id');

  if (secret !== SECRET) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!id || !accion) return Response.json({ error: 'faltan parametros' }, { status: 400 });

  const hoy = new Date().toISOString().split('T')[0];

  if (accion === 'cotizado') {
    await db().from('clientes').update({
      estado: 'Cotizado',
      fecha_cotizacion: hoy,
    }).eq('id', id);
  }

  if (accion === 'notificado') {
    await db().from('clientes').update({
      estado: 'Notificado',
      fecha_notificacion: hoy,
    }).eq('id', id);
  }

  return Response.json({ ok: true });
}
