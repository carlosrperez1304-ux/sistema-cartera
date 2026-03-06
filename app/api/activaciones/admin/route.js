import { db } from '../../../../lib/supabase.js';
import { requireAuth } from '../../../../lib/security.js';

function generarCodigo() {
  // Caracteres sin ambigüedad (sin 0,O,1,I,l)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg()}-${seg()}-${seg()}`;
}

// GET — listar todos los códigos (solo admin)
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  if (auth.session.user.rol !== 'admin') return Response.json({ error: 'No autorizado' }, { status: 403 });

  const empresa_id = auth.session.user.empresa_id || 1;

  const { data, error } = await db()
    .from('activaciones')
    .select('id, codigo, nombre_agente, activo, device_id, fecha_activacion, created_at')
    .eq('empresa_id', empresa_id)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST — crear nuevo código (solo admin)
export async function POST(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  if (auth.session.user.rol !== 'admin') return Response.json({ error: 'No autorizado' }, { status: 403 });

  const { nombre_agente } = await req.json();
  if (!nombre_agente?.trim()) return Response.json({ error: 'Nombre del agente requerido' }, { status: 400 });

  const empresa_id = auth.session.user.empresa_id || 1;
  const codigo = generarCodigo();

  const { data, error } = await db()
    .from('activaciones')
    .insert({ codigo, nombre_agente: nombre_agente.trim(), empresa_id, activo: true })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// PATCH — activar/desactivar o liberar dispositivo (solo admin)
export async function PATCH(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  if (auth.session.user.rol !== 'admin') return Response.json({ error: 'No autorizado' }, { status: 403 });

  const { id, activo, release_device } = await req.json();

  const updates = {};
  if (typeof activo === 'boolean') updates.activo = activo;
  if (release_device) {
    updates.device_id = null;
    updates.fecha_activacion = null;
  }

  const { data, error } = await db()
    .from('activaciones')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
