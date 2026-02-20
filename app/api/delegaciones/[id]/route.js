import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../lib/security.js';
import { logActividad } from '../../../../lib/delegation.js';

// PUT / DELETE — cancelar delegación (solo el owner puede cancelar)
async function cancelarDelegacion(req, params) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (!id || isNaN(id)) return Response.json({ error: 'ID inválido.' }, { status: 400 });

  const username = auth.session.user.username;
  const userRol  = auth.session.user.rol || '';
  const esAdmin  = userRol === 'admin';

  const { data: del } = await db()
    .from('delegations')
    .select('*')
    .eq('id', id)
    .single();

  if (!del) return Response.json({ error: 'Delegación no encontrada.' }, { status: 404 });
  if (!esAdmin && del.owner_id !== username) {
    return Response.json({ error: 'Solo el dueño puede cancelar la delegación.' }, { status: 403 });
  }
  if (['expired', 'cancelled', 'rejected'].includes(del.status)) {
    return Response.json({ error: `La delegación ya está en estado: ${del.status}.` }, { status: 400 });
  }

  // Si estaba accepted, revertir los clientes asignados
  if (del.status === 'accepted') {
    await db()
      .from('clientes')
      .update({ assigned_to: null, delegation_id: null })
      .eq('delegation_id', id);
  }

  await db()
    .from('delegations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);

  logActividad(null, 'DELEGACION_CANCELADA', username, del.owner_id, id,
    `Delegación #${id} cancelada por ${username}.`);

  return Response.json({ ok: true });
}

export async function PUT(req, { params }) {
  return cancelarDelegacion(req, params);
}

export async function DELETE(req, { params }) {
  return cancelarDelegacion(req, params);
}
