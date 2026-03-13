import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf, sanitize } from '../../../lib/security.js';

const PLANTILLAS_DEFAULT = [
  { nombre: 'Primer Aviso',           texto: 'Estimado cliente, le informamos que tiene una factura pendiente de pago. Por favor comuníquese con nosotros.', orden: 1 },
  { nombre: 'Recordatorio',           texto: 'Le recordamos que tiene un saldo pendiente. Agradecemos su pronto pago.', orden: 2 },
  { nombre: 'Aviso de Vencimiento',   texto: 'Su factura está próxima a vencer. Le pedimos que realice el pago a la brevedad posible.', orden: 3 },
  { nombre: 'Requerimiento Urgente',  texto: 'Su cuenta presenta un saldo vencido. Es necesario que realice el pago de inmediato para evitar cargos adicionales.', orden: 4 },
  { nombre: 'Confirmación de Pago',   texto: 'Hemos recibido su pago. Muchas gracias por su puntualidad.', orden: 5 },
];

// GET — listar plantillas
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  let { data, error } = await db().from('plantillas').select('*').order('orden');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Sembrar defaults si la tabla está vacía
  if (!data || data.length === 0) {
    const { data: inserted, error: insertErr } = await db()
      .from('plantillas')
      .insert(PLANTILLAS_DEFAULT)
      .select();
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 });
    data = inserted;
  }

  return Response.json((data || []).map(p => ({
    id:     p.id,
    nombre: p.nombre,
    texto:  p.texto,
    orden:  p.orden,
  })));
}

// POST — crear plantilla
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.nombre || !body.texto) {
    return Response.json({ error: 'nombre y texto son obligatorios.' }, { status: 400 });
  }
  // FIX: Límite de tamaño + sanitización
  if (body.texto.length > 2000) {
    return Response.json({ error: 'El texto de la plantilla no puede superar 2000 caracteres.' }, { status: 400 });
  }

  const empresa_id = auth?.session?.user?.empresa_id || null;
  const { data, error } = await db().from('plantillas').insert({
    nombre:     sanitize(body.nombre, 128),
    texto:      body.texto.slice(0, 2000),
    orden:      body.orden ?? 99,
    empresa_id: empresa_id || null,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id, nombre: data.nombre, texto: data.texto, orden: data.orden }, { status: 201 });
}
