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

  const { data: del } = await db()
    .from('delegations')
    .select('*')
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

  // ACEPTAR: actualizar clientes
  if (del.tipo === 'total') {
    // Todos los clientes del owner que no tengan ya otra delegación activa
    await db()
      .from('clientes')
      .update({ assigned_to: username, delegation_id: id })
      .eq('creado_por', del.owner_id)
      .or('assigned_to.is.null,delegation_id.eq.' + id);
  } else {
    // Parcial: solo los clientes de delegation_clients
    const { data: dcList } = await db()
      .from('delegation_clients')
      .select('client_id')
      .eq('delegation_id', id);

    const clientIds = (dcList || []).map(r => r.client_id);
    if (clientIds.length > 0) {
      await db()
        .from('clientes')
        .update({ assigned_to: username, delegation_id: id })
        .in('id', clientIds);
    }
  }

  // Marcar como aceptada
  await db()
    .from('delegations')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', id);

  logActividad(null, 'DELEGACION_ACEPTADA', username, del.owner_id, id,
    `Delegación #${id} aceptada por ${username}. Tipo: ${del.tipo}.`);

  return Response.json({ ok: true, status: 'accepted' });
}
