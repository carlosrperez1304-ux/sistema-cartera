import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

const ROLES_VER_TODO = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];

function toFront(c) {
  return {
    id:                 c.id,
    nombre:             c.nombre,
    contacto:           c.contacto            || '',
    estado:             c.estado              || 'Cotizado',
    fechaCotizacion:    c.fecha_cotizacion    || '',
    fechaNotificacion:  c.fecha_notificacion  || '',
    fechaPago:          c.fecha_pago          || '',
    fechaFacturacion:   c.fecha_facturacion   || '',
    fechaSuspension:    c.fecha_suspension    || '',
    mes:                c.mes                 || '',
    año:                c.anio                || '',
    monto:              c.monto !== null ? String(c.monto) : '',
    codigoCliente:      (c.codigo_cliente !== null && c.codigo_cliente !== undefined)
                          ? String(c.codigo_cliente) : '',
    creadoPor:          c.creado_por          || '',
    assignedTo:         c.assigned_to         || '',
    delegationId:       c.delegation_id       || null,
    comentario:         c.comentario          || '',
    nota:               c.nota                || '',
    suspendido:         c.suspendido          || false,
    tags:               c.tags                || [],
    historial:          c.historial           || [],
    pagosRealizados: (c.pagos || []).map(p => ({
      id:           p.id,
      monto:        parseFloat(p.monto),
      fecha:        p.fecha,
      fechaFormato: p.fecha_formato || '',
      nota:         p.nota || '',
    })),
  };
}

// GET — clientes delegados activamente al usuario actual
// Condiciones de delegación activa:
//   status = 'Activa'  AND  start_date <= hoy  AND  end_date >= hoy
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const userRol      = auth.session.user.rol || '';
  const username     = auth.session.user.username || '';
  const puedeVerTodo = ROLES_VER_TODO.includes(userRol);

  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

  // Buscar delegaciones activas vigentes
  let delQuery = db()
    .from('delegations')
    .select('owner_id')
    .eq('status', 'accepted')
    .lte('start_date', today)
    .gte('end_date', today);

  // Admin/supervisor ve clientes de TODAS las delegaciones activas.
  // Agente solo ve los delegados hacia él.
  if (!puedeVerTodo) {
    delQuery = delQuery.eq('assigned_user_id', username);
  }

  const { data: delegations, error: delError } = await delQuery;
  if (delError) return Response.json({ error: delError.message }, { status: 500 });

  const ownersDelegados = (delegations || []).map(d => d.owner_id);

  // Sin delegaciones activas → lista vacía (no mezclar con cartera propia)
  if (ownersDelegados.length === 0) return Response.json([]);

  const { data, error } = await db()
    .from('clientes')
    .select('*, pagos(*)')
    .in('creado_por', ownersDelegados)
    .order('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json((data || []).map(toFront));
}
