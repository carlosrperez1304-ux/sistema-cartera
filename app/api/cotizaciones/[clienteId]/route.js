import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../lib/security.js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET — documentos de un cliente (incluye base64 para previsualización)
export async function GET(req, { params }) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clienteId: rawClienteId } = await params;
  const clienteId = parseInt(rawClienteId);
  const { data, error } = await db()
    .from('cotizaciones')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json((data || []).map(c => ({
    id:     c.id,
    nombre: c.nombre,
    base64: c.datos,
    fecha:  c.fecha,
    monto:  c.monto ? parseFloat(c.monto) : null,
    estado: c.estado || 'Cotizado',
    tipo:   c.tipo   || 'subido',
  })));
}

// POST — subir documento para un cliente
export async function POST(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clienteId: rawClienteId } = await params;
  const clienteId = parseInt(rawClienteId);
  const body      = await req.json();

  const { data, error } = await db().from('cotizaciones').insert({
    cliente_id: clienteId,
    nombre:     body.nombre   || null,
    datos:      body.base64   || null,
    monto:      body.monto    ? parseFloat(body.monto) : null,
    fecha:      body.fecha    || new Date().toISOString(),
    estado:     body.estado   || 'Cotizado',
    tipo:       body.tipo     || 'subido',
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    id:     data.id,
    nombre: data.nombre,
    base64: data.datos,
    fecha:  data.fecha,
    monto:  data.monto ? parseFloat(data.monto) : null,
    estado: data.estado || 'Cotizado',
    tipo:   data.tipo   || 'subido',
  }, { status: 201 });
}
