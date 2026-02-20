import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf, getUsers } from '../../../lib/security.js';
import { expirarDelegacionesVencidas } from '../../../lib/delegation.js';

const ROLES_EDITOR = ['editor', 'agente_cobro', 'contabilidad', 'supervisor_cobro', 'supervisor_contabilidad'];
const ROLES_VER_TODO = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];

function toFrontDelegacion(d, usuarios = {}) {
  return {
    id:             d.id,
    ownerId:        d.owner_id,
    ownerNombre:    usuarios[d.owner_id]?.nombre || d.owner_id,
    assignedUserId: d.assigned_user_id,
    assignedNombre: usuarios[d.assigned_user_id]?.nombre || d.assigned_user_id,
    tipo:           d.tipo,
    startDate:      d.start_date,
    endDate:        d.end_date,
    status:         d.status,
    permisos:       d.permisos || { editar: true, pagos: true, eliminar: false },
    cantidadClientes: d.cantidad_clientes || 0,
    createdAt:      d.created_at,
  };
}

// GET — delegaciones del usuario actual (como owner y como delegatario)
// ?pendientes=1  → solo las pendientes dirigidas al usuario (para notificación)
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const username   = auth.session.user.username;
  const userRol    = auth.session.user.rol || '';
  const puedeVerTodo = ROLES_VER_TODO.includes(userRol);

  // Expiry check lazy
  await expirarDelegacionesVencidas();

  const { searchParams } = new URL(req.url);
  const soloPendientes = searchParams.get('pendientes') === '1';

  const usuarios = await getUsers();

  if (soloPendientes) {
    // Solo las que están pending y dirigidas al usuario actual
    const { data } = await db()
      .from('delegations')
      .select('*')
      .eq('assigned_user_id', username)
      .eq('status', 'pending');

    // Para cada delegación, contar los clientes involucrados
    const result = await Promise.all((data || []).map(async (d) => {
      let cantidadClientes = 0;
      if (d.tipo === 'total') {
        const { count } = await db().from('clientes').select('id', { count: 'exact', head: true }).eq('creado_por', d.owner_id);
        cantidadClientes = count || 0;
      } else {
        const { count } = await db().from('delegation_clients').select('id', { count: 'exact', head: true }).eq('delegation_id', d.id);
        cantidadClientes = count || 0;
      }
      return toFrontDelegacion({ ...d, cantidad_clientes: cantidadClientes }, usuarios);
    }));

    return Response.json(result);
  }

  // Delegaciones que creé como owner
  let queryDueno = db().from('delegations').select('*').order('created_at', { ascending: false });
  if (puedeVerTodo) {
    // admin/supervisor ve todas
  } else {
    queryDueno = queryDueno.eq('owner_id', username);
  }
  const { data: comoDueno } = await queryDueno;

  // Delegaciones recibidas (soy el delegatario)
  const { data: comoRecibidas } = await db()
    .from('delegations')
    .select('*')
    .eq('assigned_user_id', username)
    .order('created_at', { ascending: false });

  // Enriquecer con cantidad de clientes
  async function enriquecer(list) {
    return Promise.all((list || []).map(async (d) => {
      let cantidadClientes = 0;
      if (d.tipo === 'total') {
        const { count } = await db().from('clientes').select('id', { count: 'exact', head: true }).eq('creado_por', d.owner_id);
        cantidadClientes = count || 0;
      } else {
        const { count } = await db().from('delegation_clients').select('id', { count: 'exact', head: true }).eq('delegation_id', d.id);
        cantidadClientes = count || 0;
      }
      return toFrontDelegacion({ ...d, cantidad_clientes: cantidadClientes }, usuarios);
    }));
  }

  const [dueno, recibidas] = await Promise.all([enriquecer(comoDueno), enriquecer(comoRecibidas)]);

  return Response.json({ comoDueno: dueno, comoRecibidas: recibidas });
}

// POST — crear delegación
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const username = auth.session.user.username;
  const userRol  = auth.session.user.rol || '';
  const puedeDelegar = ['admin', 'editor', ...ROLES_EDITOR].some(r => r === userRol) || userRol === 'admin';

  if (!puedeDelegar && userRol === 'viewer') {
    return Response.json({ error: 'No tienes permiso para delegar.' }, { status: 403 });
  }

  const body = await req.json();
  const { assignedUserId, startDate, endDate, tipo = 'total', clienteIds = [], permisos } = body;

  if (!assignedUserId) return Response.json({ error: 'Debes seleccionar un usuario.' }, { status: 400 });
  if (assignedUserId === username) return Response.json({ error: 'No puedes delegar a ti mismo.' }, { status: 400 });
  if (!startDate || !endDate) return Response.json({ error: 'Las fechas de inicio y fin son obligatorias.' }, { status: 400 });
  if (endDate <= startDate) return Response.json({ error: 'La fecha fin debe ser posterior a la fecha inicio.' }, { status: 400 });

  // Verificar que el usuario destino existe
  const usuarios = await getUsers();
  if (!usuarios[assignedUserId]) {
    return Response.json({ error: 'El usuario seleccionado no existe.' }, { status: 400 });
  }

  // Verificar conflictos de delegación activa
  if (tipo === 'total') {
    const { data: conflicto } = await db()
      .from('clientes')
      .select('id')
      .eq('creado_por', username)
      .not('delegation_id', 'is', null)
      .limit(1);

    if (conflicto && conflicto.length > 0) {
      return Response.json({ error: 'Ya tienes clientes con delegación activa. Cancela la delegación existente primero.' }, { status: 409 });
    }
  } else {
    // Parcial: verificar que ninguno de los clienteIds ya está delegado
    if (!clienteIds || clienteIds.length === 0) {
      return Response.json({ error: 'Debes seleccionar al menos un cliente para delegación parcial.' }, { status: 400 });
    }
    const { data: conflicto } = await db()
      .from('clientes')
      .select('id')
      .in('id', clienteIds)
      .not('delegation_id', 'is', null)
      .limit(1);

    if (conflicto && conflicto.length > 0) {
      return Response.json({ error: 'Uno o más clientes ya tienen una delegación activa.' }, { status: 409 });
    }
  }

  const permisosDefault = { editar: true, pagos: true, eliminar: false };
  const permisosFinales = permisos ? { ...permisosDefault, ...permisos } : permisosDefault;

  const { data: nueva, error } = await db()
    .from('delegations')
    .insert({
      owner_id:         username,
      assigned_user_id: assignedUserId,
      tipo,
      start_date:       startDate,
      end_date:         endDate,
      status:           'pending',
      permisos:         permisosFinales,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Si parcial, insertar relaciones delegation_clients
  if (tipo === 'parcial' && clienteIds.length > 0) {
    await db().from('delegation_clients').insert(
      clienteIds.map(cid => ({ delegation_id: nueva.id, client_id: cid }))
    );
  }

  return Response.json(toFrontDelegacion(nueva, usuarios), { status: 201 });
}
