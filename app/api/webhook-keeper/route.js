import { db } from '../../../lib/supabase.js';

const SECRET_KEY = 'ba10e5cf30066fadd14b87f844ba1993de2ccb692be920426284ac3dc690a7cb';
const MINUTOS_ESPERA_PARCIAL = 5;
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

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

    const montoPagado = parseFloat(monto);
    const montoFactura = parseFloat(match.monto || 0);

    const hoy = new Date();
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesFactura = MESES[mesAnterior.getMonth()] + ' ' + mesAnterior.getFullYear();

    // Registrar este pago en la tabla pagos
    await db().from('pagos').insert({
      cliente_id: match.id,
      cliente_nombre: match.nombre,
      monto: montoPagado,
      fecha: new Date().toISOString(),
      fecha_formato: new Date().toLocaleDateString('es-DO'),
      fecha_pago: new Date().toISOString().split('T')[0],
      banco: 'Keeper',
      referencia: 'Sincronizado desde Keeper',
      tipo_negocio: 'Servicio y Repuestos',
      estado: 'pendiente',
      creado_por: 'Sistema-Keeper',
      mes_factura: mesFactura,
    });

    // Sumar TODOS los pagos acumulados de este cliente (incluyendo el que acabamos de insertar)
    const { data: pagosCliente } = await db()
      .from('pagos')
      .select('monto')
      .eq('cliente_id', match.id);

    const totalPagado = (pagosCliente || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0);
    const pendienteArrastrado = parseFloat(match.pendiente_arrastrado || 0);
    const totalADeber = montoFactura + pendienteArrastrado;
    const restante = totalADeber - totalPagado;
    const esPagoCompleto = restante <= 0.01;

    const historial = [...(match.historial || []), {
      fecha: new Date().toISOString(),
      accion: 'Marco Pagado (via Keeper)',
      usuario: 'Sistema-Keeper'
    }];

    const { error: updateError } = await db()
      .from('clientes')
      .update({
        estado: esPagoCompleto ? 'Pagado' : match.estado,
        fecha_pago: esPagoCompleto ? new Date().toISOString().split('T')[0] : match.fechaPago,
        historial,
        pendiente_arrastrado: esPagoCompleto ? 0 : pendienteArrastrado,
        pendiente_arrastrado_mes: esPagoCompleto ? null : match.pendiente_arrastrado_mes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id);

    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    if (match.contacto) {
      let mensajeNotif;
      let programadaPara;

      if (esPagoCompleto) {
        mensajeNotif = 'Muchas gracias por su pago.';
        programadaPara = new Date().toISOString();
      } else {
        mensajeNotif = 'Muchas gracias por su pago. Recordando que su factura fue de $' + totalADeber.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' y su pago acumulado es de $' + totalPagado.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ', el restante a pagar es de $' + restante.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '.';
        const futuro = new Date();
        futuro.setMinutes(futuro.getMinutes() + MINUTOS_ESPERA_PARCIAL);
        programadaPara = futuro.toISOString();
      }

      await db().from('notificaciones_pendientes').delete().eq('cliente_id', match.id).eq('enviado', false);

      await db().from('notificaciones_pendientes').insert({
        cliente_id: match.id,
        contacto: match.contacto,
        nombre: match.nombre,
        mensaje: mensajeNotif,
        enviado: false,
        programada_para: programadaPara,
      });
    }

    return Response.json({ ok: true, mensaje: 'Cliente ' + match.nombre + ' - Total pagado: $' + totalPagado + ' de $' + montoFactura, clienteId: match.id, esPagoCompleto });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
