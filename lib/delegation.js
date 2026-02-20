import { db } from './supabase.js';

/**
 * Obtiene el contexto de delegación para un cliente y usuario dado.
 * Retorna si el usuario es dueño, delegatario, los permisos activos y el ID de delegación.
 */
export async function getDelegationContext(clientId, username) {
  const { data: cliente } = await db()
    .from('clientes')
    .select('creado_por, assigned_to, delegation_id')
    .eq('id', clientId)
    .single();

  if (!cliente) return null;

  const esDueno = cliente.creado_por === username;
  const esDelegatario = cliente.assigned_to === username && !esDueno;

  if (esDueno) {
    return { esDueno: true, esDelegatario: false, permisos: null, delegationId: null, ownerId: username };
  }

  if (esDelegatario && cliente.delegation_id) {
    const { data: del } = await db()
      .from('delegations')
      .select('id, permisos, status, owner_id')
      .eq('id', cliente.delegation_id)
      .single();

    if (del && del.status === 'accepted') {
      return {
        esDueno: false,
        esDelegatario: true,
        permisos: del.permisos || { editar: true, pagos: true, eliminar: false },
        delegationId: del.id,
        ownerId: del.owner_id,
      };
    }
  }

  return { esDueno: false, esDelegatario: false, permisos: null, delegationId: null, ownerId: cliente.creado_por };
}

/**
 * Registra una acción en activity_logs.
 * Fire-and-forget — no bloquea la respuesta.
 */
export function logActividad(clientId, actionType, performedBy, ownerId, delegationId, description) {
  db().from('activity_logs').insert({
    client_id:     clientId    || null,
    action_type:   actionType,
    performed_by:  performedBy,
    owner_id:      ownerId     || null,
    delegation_id: delegationId || null,
    description:   description  || null,
  }).then(() => {}).catch(() => {});
}

/**
 * Expira automáticamente delegaciones vencidas (lazy expiry).
 * Se llama al inicio de GET /api/delegaciones y GET /api/clientes.
 */
export async function expirarDelegacionesVencidas() {
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: vencidas } = await db()
    .from('delegations')
    .select('id, owner_id, assigned_user_id')
    .eq('status', 'accepted')
    .lt('end_date', hoy);

  if (!vencidas || vencidas.length === 0) return;

  for (const del of vencidas) {
    // Resetear clientes asignados por esta delegación
    await db()
      .from('clientes')
      .update({ assigned_to: null, delegation_id: null })
      .eq('delegation_id', del.id);

    // Marcar delegación como expirada
    await db()
      .from('delegations')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', del.id);

    logActividad(null, 'DELEGACION_EXPIRADA', 'SISTEMA', del.owner_id, del.id,
      `Delegación #${del.id} expirada automáticamente. Clientes devueltos a ${del.owner_id}.`);
  }
}
