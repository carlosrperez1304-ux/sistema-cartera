import { db } from '../../../lib/supabase.js';
const SECRET = 'paytrack-watcher-2026';

function normalizar(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim();
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const nombre = searchParams.get('nombre');
  const usuario = searchParams.get('usuario');
  if (secret !== SECRET) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!nombre) return Response.json(null);

  const nombreNorm = normalizar(nombre);

  // 1. Buscar en clientes del usuario (o de toda la empresa si no se especifica usuario)
  let query = db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id, monto, creado_por')
    .not('contacto', 'is', null);
  if (usuario) query = query.eq('creado_por', usuario);
  const { data: candidatos, error } = await query;

  if (!error && candidatos) {
    // Match exacto normalizado primero
    let match = candidatos.find(c => normalizar(c.nombre) === nombreNorm);
    // Si no hay exacto, buscar el que INICIE con el nombre buscado (mas seguro que "incluye")
    if (!match) match = candidatos.find(c => normalizar(c.nombre).startsWith(nombreNorm));
    if (match) return Response.json({ ...match, _tipo: 'cliente' });
  }

  // 2. Buscar en subgrupos
  const { data: subgrupos } = await db()
    .from('subgrupos_cliente')
    .select('id, nombre, contacto, estado, empresa_id, monto, cliente_id');

  if (subgrupos) {
    let sg = subgrupos.find(s => normalizar(s.nombre) === nombreNorm);
    if (!sg) sg = subgrupos.find(s => normalizar(s.nombre).startsWith(nombreNorm));
    if (sg) {
      if (!sg.contacto) {
        const { data: padre } = await db().from('clientes').select('contacto').eq('id', sg.cliente_id).maybeSingle();
        sg.contacto = padre?.contacto || null;
      }
      return Response.json({ ...sg, _tipo: 'subgrupo' });
    }
  }

  // 3. Buscar cliente aunque no tenga contacto, respetando filtro de usuario
  let query2 = db()
    .from('clientes')
    .select('id, nombre, contacto, estado, empresa_id, monto, creado_por');
  if (usuario) query2 = query2.eq('creado_por', usuario);
  const { data: todosClientes } = await query2;

  if (todosClientes) {
    let match2 = todosClientes.find(c => normalizar(c.nombre) === nombreNorm);
    if (!match2) match2 = todosClientes.find(c => normalizar(c.nombre).startsWith(nombreNorm));
    if (match2) return Response.json({ ...match2, _tipo: 'cliente' });
  }

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
