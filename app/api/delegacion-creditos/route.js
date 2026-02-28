import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

const ROLES_VER_TODO = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];

function toFront(c) {
  return {
    id:               c.id,
    numeroOrden:      c.numero_orden      || '',
    cliente:          c.cliente           || '',
    monto:            c.monto !== null ? String(c.monto) : '',
    fechaInicio:      c.fecha_inicio      || '',
    plazoMeses:       c.plazo_meses       || '',
    fechaVencimiento: c.fecha_vencimiento || '',
    fechaPagoC:       c.fecha_pago_c      || '',
    estado:           c.estado            || 'Activo',
    comentario:       c.comentario        || '',
    creadoPor:        c.creado_por        || '',
    historial:        c.historial         || [],
    abonos: (c.abonos || []).map(a => ({
      id:           a.id,
      monto:        parseFloat(a.monto),
      fecha:        a.fecha,
      fechaFormato: a.fecha_formato || '',
    })),
  };
}

// GET — créditos delegados activamente al usuario actual
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

  // Admin/supervisor ve créditos de TODAS las delegaciones activas.
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
    .from('creditos')
    .select('*, abonos(*)')
    .in('creado_por', ownersDelegados)
    .order('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json((data || []).map(toFront));
}
