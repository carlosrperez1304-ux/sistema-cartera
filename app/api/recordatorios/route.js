import { db } from '../../../lib/supabase.js';

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const empresa_id = searchParams.get('empresa_id');
  const mes = MESES[new Date().getMonth()];
  const anio = new Date().getFullYear();

  const { data, error } = await db()
    .from('recordatorios_enviados')
    .select('cliente_id')
    .eq('mes', mes)
    .eq('anio', anio)
    .eq('empresa_id', empresa_id);

  if (error) return Response.json([]);
  return Response.json(data.map(r => r.cliente_id));
}

export async function POST(req) {
  const { cliente_id, empresa_id } = await req.json();
  const mes = MESES[new Date().getMonth()];
  const anio = new Date().getFullYear();

  await db().from('recordatorios_enviados').upsert({
    cliente_id, mes, anio, empresa_id
  }, { onConflict: 'cliente_id,mes,anio' });

  return Response.json({ ok: true });
}
