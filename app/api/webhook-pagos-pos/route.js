import { db } from '../../../lib/supabase.js';

const SECRET_KEY = process.env.WEBHOOK_KEEPER_SECRET || 'ba10e5cf30066fadd14b87f844ba1993de2ccb692be920426284ac3dc690a7cb';
const MINUTOS_ESPERA_PARCIAL = 5;

function normalizar(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { secret, nombreCliente, monto, nota } = body;

    if (secret !== SECRET_KEY) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const matchOrden = (nota || '').match(/#\s*(\d+)/);
    if (!matchOrden) {
      return Response.json({ ok: false, mensaje: 'No se encontro numero de orden en la referencia, se ignora (posible compra normal, no credito)' });
    }
    const numeroOrden = matchOrden[1];
    const nombreNorm = normalizar(nombreCliente);
    const montoPagado = parseFloat(monto);

    const { data: creditos, error } = await db()
      .from('creditos')
      .select('*, abonos(*)')
      .eq('numero_orden', numeroOrden);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const credito = (creditos || []).find(c => normalizar(c.cliente) === nombreNorm || normalizar(c.cliente).includes(nombreNorm) || nombreNorm.includes(normalizar(c.cliente)));

    if (!credito) {
      return Response.json({ ok: false, mensaje: 'No se encontro un credito para "' + nombreCliente + '" con orden #' + numeroOrden + ', se ignora (posible compra normal, no credito)' });
    }

    // Registrar el abono
    await db().from('abonos').insert({
      credito_id: credito.id,
      monto: montoPagado,
      fecha: new Date().toISOString(),
      fecha_formato: new Date().toLocaleDateString('es-DO'),
    });

    // Sumar TODOS los abonos acumulados de este credito (incluyendo el que acabamos de insertar)
    const { data: abonosCredito } = await db()
      .from('abonos')
      .select('monto')
      .eq('credito_id', credito.id);

    const totalAbonado = (abonosCredito || []).reduce((s, a) => s + parseFloat(a.monto || 0), 0);
    const montoCredito = parseFloat(credito.monto || 0);
    const restante = montoCredito - totalAbonado;
    const esCreditoSaldado = restante < 100;

    const historial = [...(credito.historial || []), {
      fecha: new Date().toISOString(),
      accion: 'Abono registrado (automatico)',
      usuario: 'Sistema'
    }];

    await db()
      .from('creditos')
      .update({
        estado: esCreditoSaldado ? 'Pagado' : credito.estado,
        historial,
        updated_at: new Date().toISOString(),
      })
      .eq('id', credito.id);

    const { data: clienteData } = await db()
      .from('clientes')
      .select('contacto')
      .ilike('nombre', '%' + credito.cliente + '%')
      .not('contacto', 'is', null)
      .limit(1)
      .maybeSingle();

    const contacto = clienteData?.contacto || null;

    if (contacto) {
      let mensajeNotif;
      let programadaPara;

      if (esCreditoSaldado) {
        mensajeNotif = '\u2705 Muchas gracias por su pago.\n\ud83d\udccb Su orden #' + numeroOrden + '\n\ud83d\udcb0 De su credito de: $' + montoCredito.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '\n\ud83c\udf89 Fue saldada completamente.';
        programadaPara = new Date().toISOString();
      } else {
        mensajeNotif = '\u2705 Muchas gracias por su abono.\nRecordando que:\n\n\ud83d\udccb Orden: #' + numeroOrden + '\n\ud83d\udcb0 Su credito fue de: $' + montoCredito.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '\n\ud83d\udcb5 Su pago acumulado es de: $' + totalAbonado.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '\n\u26a0\ufe0f Su restante a pagar es de: $' + restante.toLocaleString('en-US', { minimumFractionDigits: 2 });
        const futuro = new Date();
        futuro.setMinutes(futuro.getMinutes() + MINUTOS_ESPERA_PARCIAL);
        programadaPara = futuro.toISOString();
      }

      // Si ya existe una notificacion pendiente para este credito (abono parcial anterior), la reemplazamos
      await db().from('notificaciones_pendientes').delete().eq('credito_id', credito.id).eq('enviado', false);

      await db().from('notificaciones_pendientes').insert({
        cliente_id: null,
        credito_id: credito.id,
        contacto: contacto,
        nombre: credito.cliente,
        mensaje: mensajeNotif,
        enviado: false,
        programada_para: programadaPara,
        agente: credito.creado_por || null,
      });
    }

    return Response.json({ ok: true, mensaje: 'Credito orden #' + numeroOrden + ' - Total abonado: $' + totalAbonado + ' de $' + montoCredito, esCreditoSaldado });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
