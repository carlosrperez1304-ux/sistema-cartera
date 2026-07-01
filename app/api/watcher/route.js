import { db } from '../../../lib/supabase.js';
const SECRET = 'paytrack-watcher-2026';
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const nombre = searchParams.get('nombre');
  if (secret !== SECRET) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!nombre) return Response.json(null);

  // 1. Buscar en clientes con contacto
  const { data, error } = await db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id, monto')
    .ilike('nombre', '%' + nombre + '%')
    .not('contacto', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!error && data) return Response.json({ ...data, _tipo: 'cliente' });

  // 2. Buscar en subgrupos
  const { data: sg } = await db()
    .from('subgrupos_cliente')
    .select('id, nombre, contacto, estado, empresa_id, monto, cliente_id')
    .ilike('nombre', '%' + nombre + '%')
    .limit(1)
    .maybeSingle();

  if (sg) {
    // Si el subgrupo no tiene contacto, buscar en cliente padre
    if (!sg.contacto) {
      const { data: padre } = await db()
        .from('clientes')
        .select('contacto')
        .eq('id', sg.cliente_id)
        .maybeSingle();
      sg.contacto = padre?.contacto || null;
    }
    return Response.json({ ...sg, _tipo: 'subgrupo' });
  }

  // 3. Buscar cliente aunque no tenga contacto
  const { data: clienteSinContacto } = await db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id, monto')
    .ilike('nombre', '%' + nombre + '%')
    .limit(1)
    .maybeSingle();
  if (clienteSinContacto) return Response.json({ ...clienteSinContacto, _tipo: 'cliente' });

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
