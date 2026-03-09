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

  // 1. Resetear todos los clientes
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

  // 2. Restaurar monto/estado de clientes que ya tienen cotizaciones subidas
  //    en el mes actual (no perder trabajo reciente al hacer cierre automático)
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const { data: cotsMes } = await db()
    .from('cotizaciones')
    .select('cliente_id, monto, fecha')
    .gte('fecha', inicioMes.toISOString())
    .not('monto', 'is', null)
    .order('fecha', { ascending: false });

  if (cotsMes && cotsMes.length > 0) {
    // Tomar solo la cotización más reciente por cliente
    const porCliente = {};
    for (const c of cotsMes) {
      if (!porCliente[c.cliente_id] && parseFloat(c.monto) > 0) {
        porCliente[c.cliente_id] = c;
      }
    }
    // Restaurar en batch
    for (const [clienteId, cot] of Object.entries(porCliente)) {
      await db()
        .from('clientes')
        .update({
          monto: parseFloat(cot.monto),
          estado: 'Cotizado',
          fecha_cotizacion: cot.fecha ? cot.fecha.split('T')[0] : null,
        })
        .eq('id', parseInt(clienteId));
    }
  }

  return Response.json({ ok: true });
}
