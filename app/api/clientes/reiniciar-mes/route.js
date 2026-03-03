import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../lib/security.js';

export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  // Solo admin o supervisor puede hacer cierre de mes
  const rol = auth.session.user.rol;
  if (!['admin', 'supervisor_cobro', 'supervisor_contabilidad'].includes(rol)) {
    return Response.json({ error: 'Sin permisos para cierre de mes' }, { status: 403 });
  }

  const empresa_id = auth.session.user.empresa_id;

  const { error } = await db()
    .from('clientes')
    .update({
      monto: 0,
      estado: 'No Generaron',
      fecha_pago: null,
      fecha_cotizacion: null,
      fecha_notificacion: null,
      fecha_facturacion: null,
      suspendido: false,
    })
    .eq('empresa_id', empresa_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
