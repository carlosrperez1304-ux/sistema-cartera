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

// PATCH — aceptar o rechazar delegación (solo el delegatario)
export async function PATCH(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (!id || isNaN(id)) return Response.json({ error: 'ID inválido.' }, { status: 400 });

  const username = auth.session.user.username;
  const body = await req.json();
  const { accion } = body; // 'accept' | 'reject'

  const { data: del } = await db().from('delegations').select('*').eq('id', id).single();
  if (!del) return Response.json({ error: 'Delegación no encontrada.' }, { status: 404 });
  if (del.assigned_user_id !== username) return Response.json({ error: 'No autorizado.' }, { status: 403 });
  if (del.status !== 'pending') return Response.json({ error: 'La delegación no está pendiente.' }, { status: 400 });

  if (accion === 'accept') {
    // Actualizar clientes asignados
    if (del.tipo === 'total') {
      await db().from('clientes')
        .update({ assigned_to: username, delegation_id: id })
        .eq('creado_por', del.owner_id);
    } else {
      const { data: dc } = await db().from('delegation_clients').select('client_id').eq('delegation_id', id);
      const ids = (dc || []).map(r => r.client_id);
      if (ids.length > 0) {
        await db().from('clientes')
          .update({ assigned_to: username, delegation_id: id })
          .in('id', ids);
      }
    }
    await db().from('delegations').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', id);
    logActividad(null, 'DELEGACION_ACEPTADA', username, del.owner_id, id, `Delegación #${id} aceptada por ${username}.`);
    return Response.json({ ok: true, status: 'accepted' });
  }

  if (accion === 'reject') {
    await db().from('delegations').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
    logActividad(null, 'DELEGACION_RECHAZADA', username, del.owner_id, id, `Delegación #${id} rechazada por ${username}.`);
    return Response.json({ ok: true, status: 'rejected' });
  }

  return Response.json({ error: 'Acción inválida.' }, { status: 400 });
}

// PATCH — aceptar o rechazar delegación (solo el delegatario)
export async function PATCH(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (!id || isNaN(id)) return Response.json({ error: 'ID inválido.' }, { status: 400 });

  const username = auth.session.user.username;
  const body = await req.json();
  const { accion } = body; // 'accept' | 'reject'

  const { data: del } = await db().from('delegations').select('*').eq('id', id).single();
  if (!del) return Response.json({ error: 'Delegación no encontrada.' }, { status: 404 });
  if (del.assigned_user_id !== username) return Response.json({ error: 'No autorizado.' }, { status: 403 });
  if (del.status !== 'pending') return Response.json({ error: 'La delegación no está pendiente.' }, { status: 400 });

  if (accion === 'accept') {
    // Actualizar clientes asignados
    if (del.tipo === 'total') {
      await db().from('clientes')
        .update({ assigned_to: username, delegation_id: id })
        .eq('creado_por', del.owner_id);
    } else {
      const { data: dc } = await db().from('delegation_clients').select('client_id').eq('delegation_id', id);
      const ids = (dc || []).map(r => r.client_id);
      if (ids.length > 0) {
        await db().from('clientes')
          .update({ assigned_to: username, delegation_id: id })
          .in('id', ids);
      }
    }
    await db().from('delegations').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', id);
    logActividad(null, 'DELEGACION_ACEPTADA', username, del.owner_id, id, `Delegación #${id} aceptada por ${username}.`);
    return Response.json({ ok: true, status: 'accepted' });
  }

  if (accion === 'reject') {
    await db().from('delegations').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
    logActividad(null, 'DELEGACION_RECHAZADA', username, del.owner_id, id, `Delegación #${id} rechazada por ${username}.`);
    return Response.json({ ok: true, status: 'rejected' });
  }

  return Response.json({ error: 'Acción inválida.' }, { status: 400 });
}
