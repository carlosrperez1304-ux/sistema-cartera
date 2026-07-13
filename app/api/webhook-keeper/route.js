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
    const montoPagado = parseFloat(monto);

    const { data: clientes, error } = await db()
      .from('clientes')
      .select('*')
      .neq('estado', 'Archivado');

    if (error) return Response.json({ error: error.message }, { status: 500 });

    let match = (clientes || []).find(c => normalizar(c.nombre) === nombreNorm);

    if (!match) {
      // Busqueda de respaldo: nombres que empiecen igual (ej: "Virgilio" encuentra "Virgilio Sport")
      const candidatos = (clientes || []).filter(c => {
        const cNorm = normalizar(c.nombre);
        return cNorm.startsWith(nombreNorm) || nombreNorm.startsWith(cNorm);
      });

      if (candidatos.length === 1) {
        match = candidatos[0];
      } else if (candidatos.length > 1) {
        // Desempatar usando el monto: buscar el candidato cuyo monto coincida con el pago recibido
        const montoPagadoNum = parseFloat(monto);
        const porMonto = candidatos.find(c => Math.abs(parseFloat(c.monto || 0) - montoPagadoNum) < 0.01);
        if (porMonto) {
          match = porMonto;
        } else {
          return Response.json({ ok: false, mensaje: 'Se encontraron ' + candidatos.length + ' clientes similares a "' + nombreCliente + '" y ninguno coincide con el monto. Verificar manualmente: ' + candidatos.map(c => c.nombre).join(', ') });
        }
      }
    }

    if (!match) {
      return Response.json({ ok: false, mensaje: 'No se encontro cliente con nombre: ' + nombreCliente });
    }

    // Verificar si este cliente esta vinculado a otros
    const { data: vinculos } = await db()
      .from('clientes_vinculos')
      .select('*')
      .eq('empresa_id', match.empresa_id);

    const vinculo = (vinculos || []).find(v => v.ids.includes(match.id));
    const idsGrupo = vinculo ? vinculo.ids : [match.id];
    const nombreGrupo = vinculo ? vinculo.nombre : match.nombre;

    const clientesGrupo = (clientes || []).filter(c => idsGrupo.includes(c.id));
    const montoFacturaTotal = clientesGrupo.reduce((s, c) => s + parseFloat(c.monto || 0), 0);

    const hoy = new Date();
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesFactura = MESES[mesAnterior.getMonth()] + ' ' + mesAnterior.getFullYear();

    // Registrar el pago a nombre del cliente real que llego desde Keeper
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

    // Sumar TODOS los pagos acumulados de TODOS los clientes del grupo vinculado
    const { data: pagosGrupo } = await db()
      .from('pagos')
      .select('monto')
      .in('cliente_id', idsGrupo);

    const totalPagado = (pagosGrupo || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0);

    const pendienteArrastradoTotal = clientesGrupo.reduce((s, c) => s + parseFloat(c.pendiente_arrastrado || 0), 0);
    const totalADeber = montoFacturaTotal + pendienteArrastradoTotal;
    const restante = totalADeber - totalPagado;
    const esPagoCompleto = restante <= 0.01;

    // Actualizar el estado de TODOS los clientes del grupo
    for (const c of clientesGrupo) {
      const historial = [...(c.historial || []), {
        fecha: new Date().toISOString(),
        accion: 'Marco Pagado (via Keeper' + (vinculo ? ' - grupo: ' + nombreGrupo : '') + ')',
        usuario: 'Sistema-Keeper'
      }];
      await db()
        .from('clientes')
        .update({
          estado: esPagoCompleto ? 'Pagado' : c.estado,
          fecha_pago: esPagoCompleto ? new Date().toISOString().split('T')[0] : c.fechaPago,
          historial,
          pendiente_arrastrado: esPagoCompleto ? 0 : (c.pendiente_arrastrado || 0),
          pendiente_arrastrado_mes: esPagoCompleto ? null : c.pendiente_arrastrado_mes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', c.id);
    }

    // Notificar solo al cliente que hizo el pago (o al principal del grupo si tiene contacto)
    const clienteContacto = match.contacto ? match : clientesGrupo.find(c => c.contacto);
    if (clienteContacto?.contacto) {
      let mensajeNotif;
      let programadaPara;

        if (esPagoCompleto) {
          mensajeNotif = '\u2705 Muchas gracias por su pago.';
          programadaPara = new Date().toISOString();
        } else {
          let desglose = '';
          if (vinculo && clientesGrupo.length > 1) {
            desglose = clientesGrupo.map(c => '\n- ' + c.nombre + ': $' + parseFloat(c.monto||0).toLocaleString('en-US',{minimumFractionDigits:2})).join('') + '\n';
          }
          mensajeNotif = '\u2705 Muchas gracias por su pago.\nRecordando que:\n\n\ud83d\udcb0 Su factura fue de: $' + totalADeber.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '\n' + desglose + '\ud83d\udcb5 Su pago acumulado es de: $' + totalPagado.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '\n\u26a0\ufe0f Su restante a pagar es de: $' + restante.toLocaleString('en-US', { minimumFractionDigits: 2 });
          const futuro = new Date();
          futuro.setMinutes(futuro.getMinutes() + MINUTOS_ESPERA_PARCIAL);
          programadaPara = futuro.toISOString();
        }

      await db().from('notificaciones_pendientes').delete().in('cliente_id', idsGrupo).eq('enviado', false);

      await db().from('notificaciones_pendientes').insert({
        cliente_id: clienteContacto.id,
        contacto: clienteContacto.contacto,
        nombre: nombreGrupo,
        mensaje: mensajeNotif,
        enviado: false,
        programada_para: programadaPara,
        agente: clienteContacto.creado_por || match.creado_por || null,
      });
    }

    return Response.json({ ok: true, mensaje: 'Grupo ' + nombreGrupo + ' - Total pagado: $' + totalPagado + ' de $' + totalADeber, esPagoCompleto });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
