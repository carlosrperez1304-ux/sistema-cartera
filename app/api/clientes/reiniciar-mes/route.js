import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf, auditLog, getIP } from '../../../../lib/security.js';

export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const rol = auth.session.user.rol;
  if (!['admin', 'supervisor_cobro', 'supervisor_contabilidad'].includes(rol)) {
    return Response.json({ error: 'Sin permisos para cierre de mes' }, { status: 403 });
  }

  const empresa_id = auth.session.user.empresa_id;

  // 1. Resetear todos los clientes EXCEPTO archivados
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
    .eq('empresa_id', empresa_id)
    .neq('estado', 'Archivado');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 2. Resetear subgrupos
  await db()
    .from('subgrupos_cliente')
    .update({
      monto: 0,
      estado: 'Pendiente',
      pdf_nombre: null,
      pdf_base64: null,
      fecha_cotizacion: null,
      fecha_notificacion: null,
      fecha_pago: null,
    })
    .eq('empresa_id', empresa_id);

  // 3. Eliminar todas las cotizaciones de la empresa
  await db()
    .from('cotizaciones')
    .delete()
    .eq('empresa_id', empresa_id);

  // 4. Registrar en audit log
  auditLog('MONTH_CLOSE', auth.session.user.username, getIP(req),
    `Cierre de mes ejecutado para empresa_id=${empresa_id}`);

  return Response.json({ ok: true });
}
