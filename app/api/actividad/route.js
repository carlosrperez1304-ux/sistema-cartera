import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

const ROLES_VER_TODO = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];

// GET — logs de actividad de delegados
// Query params: ?delegationId=X, ?clientId=X, ?desde=YYYY-MM-DD, ?hasta=YYYY-MM-DD
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const username   = auth.session.user.username;
  const userRol    = auth.session.user.rol || '';
  const puedeVerTodo = ROLES_VER_TODO.includes(userRol);

  const { searchParams } = new URL(req.url);
  const delegationId = searchParams.get('delegationId');
  const clientId     = searchParams.get('clientId');
  const desde        = searchParams.get('desde');
  const hasta        = searchParams.get('hasta');

  let query = db()
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  // Un usuario normal solo puede ver la actividad sobre sus propios clientes
  if (!puedeVerTodo) {
    query = query.eq('owner_id', username);
  }

  if (delegationId) query = query.eq('delegation_id', parseInt(delegationId));
  if (clientId)     query = query.eq('client_id', parseInt(clientId));
  if (desde)        query = query.gte('created_at', desde);
  if (hasta)        query = query.lte('created_at', hasta + 'T23:59:59Z');

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(data || []);
}
