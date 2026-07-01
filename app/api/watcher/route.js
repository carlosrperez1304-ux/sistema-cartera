import { db } from '../../../lib/supabase.js';

const SECRET = 'paytrack-watcher-2026';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const nombre = searchParams.get('nombre');

  if (secret !== SECRET) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!nombre) return Response.json(null);

  // Buscar primero en clientes
  const { data, error } = await db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id, monto')
    .ilike('nombre', '%' + nombre + '%')
    .limit(1)
    .maybeSingle();

  if (!error && data) return Response.json({ ...data, _tipo: 'cliente' });

  // Si no encuentra en clientes, buscar en subgrupos
  const { data: sg, error: sgError } = await db()
    .from('subgrupos_cliente')
    .select('id, nombre, contacto, estado, empresa_id, monto, cliente_id')
    .ilike('nombre', '%' + nombre + '%')
    .limit(1)
    .maybeSingle();

  if (!sgError && sg) return Response.json({ ...sg, _tipo: 'subgrupo' });

  return Response.json(null);
}

export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const accion = searchParams.get('accion');
  const id = searchParams.get('id');

  if (secret !== SECRET) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!id || !accion) return Response.json({ error: 'faltan parametros' }, { status: 400 });

  const hoy = new Date().toISOString().split('T')[0];

  const tipo = searchParams.get('tipo') || 'cliente';
  const tabla = tipo === 'subgrupo' ? 'subgrupos_cliente' : 'clientes';

  if (accion === 'cotizado') {
    await db().from(tabla).update({ estado: 'Cotizado', fecha_cotizacion: hoy }).eq('id', id);
  }

  if (accion === 'actualizar-monto') {
    const monto = searchParams.get('monto');
    if (monto) {
      await db().from(tabla).update({ monto: parseFloat(monto) }).eq('id', id);
    }
  }

  if (accion === 'notificado') {
    await db().from(tabla).update({ estado: 'Notificado', fecha_notificacion: hoy }).eq('id', id);
  }

  return Response.json({ ok: true });
}
