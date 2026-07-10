import { db } from '../../../lib/supabase.js';

const SECRET_KEY = 'ba10e5cf30066fadd14b87f844ba1993de2ccb692be920426284ac3dc690a7cb';

function normalizar(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { secret, nombreCliente, monto } = body;

    if (secret !== SECRET_KEY) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!nombreCliente || !monto) {
      return Response.json({ error: 'Faltan datos: nombreCliente y monto son requeridos' }, { status: 400 });
    }

    const nombreNorm = normalizar(nombreCliente);

    const { data: clientes, error } = await db()
      .from('clientes')
      .select('*')
      .neq('estado', 'Archivado');

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const match = (clientes || []).find(c => normalizar(c.nombre) === nombreNorm);

    if (!match) {
      return Response.json({ ok: false, mensaje: 'No se encontro cliente con nombre: ' + nombreCliente });
    }

    const historial = [...(match.historial || []), {
      fecha: new Date().toISOString(),
      accion: 'Marco Pagado (via Keeper)',
      usuario: 'Sistema-Keeper'
    }];

    const { error: updateError } = await db()
      .from('clientes')
      .update({
        estado: 'Pagado',
        fecha_pago: new Date().toISOString().split('T')[0],
        historial,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id);

    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    return Response.json({ ok: true, mensaje: 'Cliente ' + match.nombre + ' marcado como pagado', clienteId: match.id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
