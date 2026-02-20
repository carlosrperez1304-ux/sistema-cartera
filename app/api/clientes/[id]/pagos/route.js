import { db } from '../../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../../lib/security.js';
import { getDelegationContext, logActividad } from '../../../../../lib/delegation.js';

// POST — registrar un pago para un cliente
export async function POST(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const clienteId = parseInt(rawId);
  const username  = auth.session.user.username;
  const userRol   = auth.session.user.rol || '';
  const esAdmin   = userRol === 'admin';

  // Verificar permisos de delegación
  if (!esAdmin) {
    const ctx = await getDelegationContext(clienteId, username);
    if (ctx && !ctx.esDueno && !ctx.esDelegatario) {
      return Response.json({ error: 'No tienes acceso a este cliente.' }, { status: 403 });
    }
    if (ctx && ctx.esDelegatario && ctx.permisos && (!ctx.permisos.can_register_payments || ctx.permisos.read_only)) {
      return Response.json({ error: 'No tienes permiso para registrar pagos en esta delegación.' }, { status: 403 });
    }
    if (ctx && ctx.esDelegatario) {
      logActividad(clienteId, 'PAGO_ADD', username, ctx.ownerId, ctx.delegationId,
        `Pago registrado en cliente #${clienteId} por delegado ${username}`);
    }
  }

  const body = await req.json();

  const { data, error } = await db().from('pagos').insert({
    cliente_id:    clienteId,
    monto:         parseFloat(body.monto),
    fecha:         body.fecha || new Date().toISOString(),
    fecha_formato: body.fechaFormato || '',
    nota:          body.nota || null,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    ok: true,
    pago: {
      id:          data.id,
      monto:       parseFloat(data.monto),
      fecha:       data.fecha,
      fechaFormato: data.fecha_formato || '',
      nota:        data.nota || '',
    },
  }, { status: 201 });
}

// DELETE — eliminar un pago específico
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const clienteId = parseInt(rawId);
  const username  = auth.session.user.username;
  const userRol   = auth.session.user.rol || '';
  const esAdmin   = userRol === 'admin';

  // Verificar permisos de delegación
  if (!esAdmin) {
    const ctx = await getDelegationContext(clienteId, username);
    if (ctx && !ctx.esDueno && !ctx.esDelegatario) {
      return Response.json({ error: 'No tienes acceso a este cliente.' }, { status: 403 });
    }
    if (ctx && ctx.esDelegatario && ctx.permisos && (!ctx.permisos.can_register_payments || ctx.permisos.read_only)) {
      return Response.json({ error: 'No tienes permiso para eliminar pagos en esta delegación.' }, { status: 403 });
    }
    if (ctx && ctx.esDelegatario) {
      logActividad(clienteId, 'PAGO_DEL', username, ctx.ownerId, ctx.delegationId,
        `Pago eliminado en cliente #${clienteId} por delegado ${username}`);
    }
  }

  const { searchParams } = new URL(req.url);
  const pagoId = parseInt(searchParams.get('pagoId'));
  if (!pagoId) return Response.json({ error: 'Falta pagoId' }, { status: 400 });

  const { error } = await db().from('pagos').delete().eq('id', pagoId).eq('cliente_id', clienteId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
