import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

// GET — todos los documentos (sin base64) del usuario actual, agrupados por cliente_id
// Usado por la pestaña Documentos al abrirse para cargar todo de una sola llamada
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const username   = auth.session.user.username;
  const empresa_id = auth.session.user.empresa_id || null;
  const rol        = auth.session.user.rol || '';

  // 1. Obtener IDs de clientes visibles para este usuario
  let clientesQuery = db().from('clientes').select('id');
  if (empresa_id) clientesQuery = clientesQuery.eq('empresa_id', empresa_id);
  if (rol !== 'admin' && rol !== 'contabilidad') {
    clientesQuery = clientesQuery.or(`creado_por.eq.${username},assigned_to.eq.${username}`);
  }
  const { data: clientesData, error: cError } = await clientesQuery;
  if (cError) return Response.json({});

  const ids = (clientesData || []).map(c => c.id);
  if (ids.length === 0) return Response.json({});

  // 2. Obtener cotizaciones sin base64 para esos clientes
  const { data, error } = await db()
    .from('cotizaciones')
    .select('id, cliente_id, nombre, fecha, monto, estado, tipo')
    .in('cliente_id', ids)
    .order('fecha', { ascending: false });

  if (error) return Response.json({});

  // 3. Agrupar por cliente_id
  const grouped = {};
  (data || []).forEach(c => {
    if (!grouped[c.cliente_id]) grouped[c.cliente_id] = [];
    grouped[c.cliente_id].push({
      id:     c.id,
      nombre: c.nombre,
      base64: null,
      fecha:  c.fecha,
      monto:  c.monto ? parseFloat(c.monto) : null,
      estado: c.estado || 'Cotizado',
      tipo:   c.tipo   || 'subido',
    });
  });

  return Response.json(grouped);
}
