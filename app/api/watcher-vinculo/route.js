import { db } from '../../../lib/supabase.js';

const SECRET = process.env.WATCHER_SECRET || 'paytrack-watcher-2026';
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const clienteId = searchParams.get('cliente_id');

  if (secret !== SECRET) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!clienteId) return Response.json({ vinculado: false });

  const { data: cliente } = await db().from('clientes').select('*').eq('id', clienteId).maybeSingle();
  if (!cliente) return Response.json({ vinculado: false });

  const { data: vinculos } = await db()
    .from('clientes_vinculos')
    .select('*')
    .eq('empresa_id', cliente.empresa_id);

  const vinculo = (vinculos || []).find(v => v.ids.includes(cliente.id));

  if (!vinculo) return Response.json({ vinculado: false });

  const { data: clientesGrupo } = await db()
    .from('clientes')
    .select('*')
    .in('id', vinculo.ids);

  const todosListos = (clientesGrupo || []).every(c => parseFloat(c.monto || 0) > 0);

  if (!todosListos) {
    return Response.json({ vinculado: true, listo: false, nombreGrupo: vinculo.nombre, idsGrupo: vinculo.ids });
  }

  const hoy = new Date();
  const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const mesFactura = MESES[mesAnterior.getMonth()];
  const anio = mesAnterior.getFullYear();
  const anioActual = hoy.getFullYear();

  const desglose = clientesGrupo.map(c => '💰 ' + c.nombre + ': $' + parseFloat(c.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })).join('\n');
  const totalCombinado = clientesGrupo.reduce((s, c) => s + parseFloat(c.monto || 0), 0);

  const horaActual = hoy.getHours();
  const saludo = horaActual >= 5 && horaActual < 12 ? 'buenos días' : horaActual >= 12 && horaActual < 19 ? 'buenas tardes' : 'buenas noches';

  const mensajeCombinado = `Saludos ${saludo}!\nLa factura por EL MES DE ${mesFactura} ${anio}📃 ha sido generada.\n\n${desglose}\n💰 Total a pagar: $${totalCombinado.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n💠Recordandole: que la misma tiene un plazo hasta el dia 15 para el pago.\n⚠️LOS PAGOS SE REALIZAN A NUESTRAS CUENTAS DE BANCOS⚠️\nCUENTAS:\nA nombre: 7LABS\n🟢Reservas: 248 013348 5\n🔵Popular:     782 6584 05\n🟢BHD:         1587 811 0015\n🧾RNC: 130-82698-6`;

  return Response.json({
    vinculado: true,
    listo: true,
    nombreGrupo: vinculo.nombre,
    mensajeCombinado,
    idsGrupo: vinculo.ids,
  });
}
