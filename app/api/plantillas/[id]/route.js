import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../lib/security.js';

// PUT — actualizar plantilla
export async function PUT(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json();

  const update = {};
  if (body.nombre !== undefined) update.nombre = body.nombre;
  if (body.texto  !== undefined) update.texto  = body.texto;
  if (body.orden  !== undefined) update.orden  = body.orden;

  const { data, error } = await db()
    .from('plantillas')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id, nombre: data.nombre, texto: data.texto, orden: data.orden });
}

// DELETE — eliminar plantilla
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { error } = await db().from('plantillas').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
