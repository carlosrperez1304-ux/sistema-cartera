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
      .select('id, can_edit, can_register_payments, can_delete, read_only, status, owner_id')
      .eq('id', cliente.delegation_id)
      .single();

    if (del && del.status === 'accepted') {
      return {
        esDueno: false,
        esDelegatario: true,
        permisos: {
          can_edit:              del.can_edit              ?? true,
          can_register_payments: del.can_register_payments ?? true,
          can_delete:            del.can_delete            ?? false,
          read_only:             del.read_only             ?? false,
        },
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
export async function logActividad(
  clientId,
  actionType,
  performedBy,
  ownerId,
  delegationId,
  description
) {
  const { error } = await db()
    .from('activity_logs')
    .insert({
      client_id: clientId || null,
      action_type: actionType,
      performed_by: performedBy,
      owner_id: ownerId || null,
      delegation_id: delegationId || null,
      description: description || null,
    });

  if (error) {
    console.error('Error logActividad:', error.message);
  }
}

export async function expirarDelegacionesVencidas() {
  const { error } = await db().rpc('expire_delegations');

  if (error) {
    console.error('Error expirando delegations:', error.message);
    // No lanzamos error porque es una tarea secundaria
  }
}
