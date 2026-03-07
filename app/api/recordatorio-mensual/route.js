import { db } from '../../../lib/supabase.js';

// Ejecutado automáticamente por Vercel Cron el día 13 de cada mes a las 9 AM
export async function GET(req) {
  // Verificar que viene del cron de Vercel
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

  // Guardar en config que hay recordatorio activo para este mes
  const { error } = await db()
    .from('config')
    .upsert(
      { clave: 'recordatorio_mes', valor: mesActual, updated_at: new Date().toISOString() },
      { onConflict: 'clave' }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Contar clientes pendientes para el log
  const { data: pendientes } = await db()
    .from('clientes')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'Notificado');

  console.log(`[recordatorio-mensual] Mes ${mesActual} — ${pendientes?.length ?? 0} clientes pendientes`);

  return Response.json({ ok: true, mes: mesActual });
}
