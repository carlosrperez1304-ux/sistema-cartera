import { db } from '../../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../../lib/security.js';
import { logActividad } from '../../../../../lib/delegation.js';

// POST — aceptar o rechazar una delegación (solo el assigned_user_id)
export async function POST(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (!id || isNaN(id)) return Response.json({ error: 'ID inválido.' }, { status: 400 });

  const username = auth.session.user.username;
  const body = await req.json();
  const { accion } = body; // 'aceptar' | 'rechazar'

  if (!['aceptar', 'rechazar'].includes(accion)) {
    return Response.json({ error: 'Acción inválida. Usa: aceptar o rechazar.' }, { status: 400 });
  }

  // Verificar que la delegación existe y está dirigida al usuario actual
  const { data: del } = await db()
    .from('delegations')
    .select('id, assigned_user_id, owner_id, status')
    .eq('id', id)
    .single();

  if (!del) return Response.json({ error: 'Delegación no encontrada.' }, { status: 404 });
  if (del.assigned_user_id !== username) {
    return Response.json({ error: 'Solo el usuario receptor puede responder esta delegación.' }, { status: 403 });
  }
  if (del.status !== 'pending') {
    return Response.json({ error: `La delegación ya fue respondida (${del.status}).` }, { status: 400 });
  }

  if (accion === 'rechazar') {
    await db()
      .from('delegations')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);

    logActividad(null, 'DELEGACION_RECHAZADA', username, del.owner_id, id,
      `Delegación #${id} rechazada por ${username}.`);

    return Response.json({ ok: true, status: 'rejected' });
  }

  // ACEPTAR: usar RPC atómica para evitar race conditions
  const { data: rpcResult, error: rpcError } = await db()
    .rpc('accept_delegation', { p_delegation_id: id, p_user_id: username });

  if (rpcError) {
    return Response.json({ error: rpcError.message || 'Error al aceptar la delegación.' }, { status: 500 });
  }

  if (!rpcResult?.ok) {
    return Response.json({ error: rpcResult?.error || 'Error desconocido en RPC.' }, { status: 400 });
  }

  return Response.json({ ok: true, status: 'accepted', clientesAsignados: rpcResult.clientes_asignados });
}
