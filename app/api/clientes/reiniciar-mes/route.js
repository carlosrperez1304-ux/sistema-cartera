import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf, auditLog, getIP } from '../../../../lib/security.js';

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

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

  // 0. Bloquear todos los pagos existentes (ya no editables despues del cierre)
  await db()
    .from('pagos')
    .update({ bloqueado: true })
    .eq('empresa_id', empresa_id)
    .eq('bloqueado', false);

  // 0.5 Calcular y guardar el pendiente arrastrado de cada cliente ANTES de resetear
  const hoy = new Date();
  const mesQueTermina = MESES[hoy.getMonth() === 0 ? 11 : hoy.getMonth() - 1] + ' ' + (hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear());

  const { data: clientesActuales } = await db()
    .from('clientes')
    .select('id, monto, pendiente_arrastrado')
    .eq('empresa_id', empresa_id)
    .neq('estado', 'Archivado');

  for (const c of (clientesActuales || [])) {
    const montoFactura = parseFloat(c.monto || 0);
    const pendienteAnterior = parseFloat(c.pendiente_arrastrado || 0);
    if (montoFactura <= 0 && pendienteAnterior <= 0) continue;

    const { data: pagosCliente } = await db()
      .from('pagos')
      .select('monto')
      .eq('cliente_id', c.id);

    const totalPagado = (pagosCliente || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0);
    const pendienteEsteMes = Math.max(0, montoFactura - totalPagado);
    const pendienteAcumulado = pendienteAnterior + pendienteEsteMes;

    if (pendienteAcumulado > 0.01) {
      await db()
        .from('clientes')
        .update({
          pendiente_arrastrado: pendienteAcumulado,
          pendiente_arrastrado_mes: mesQueTermina,
        })
        .eq('id', c.id);
    } else {
      await db()
        .from('clientes')
        .update({
          pendiente_arrastrado: 0,
          pendiente_arrastrado_mes: null,
        })
        .eq('id', c.id);
    }
  }

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
