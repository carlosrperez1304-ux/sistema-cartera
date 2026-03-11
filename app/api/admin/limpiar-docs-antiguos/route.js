import { db } from '../../../../lib/supabase.js';

// POST — elimina cotizaciones del mes anterior (llamado por cron o reiniciar-mes)
// También acepta llamadas del cron de Vercel (sin sesión, con Authorization header)
export async function POST(req) {
  // Verificar que es el cron de Vercel o una petición autenticada
  const authHeader = req.headers.get('authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    // Si no es cron, verificar que es admin
    const { requireAdmin } = await import('../../../../lib/security.js');
    const auth = await requireAdmin(req);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Eliminar cotizaciones con más de 30 días O del mes anterior (lo que sea antes)
  const hace30Dias = new Date();
  hace30Dias.setDate(hace30Dias.getDate() - 30);

  const primerDiaMesActual = new Date();
  primerDiaMesActual.setDate(1);
  primerDiaMesActual.setHours(0, 0, 0, 0);

  // Corte = el más antiguo entre "hace 30 días" y "inicio del mes actual"
  // Esto asegura que documentos del mes actual nunca se borren antes de 30 días
  const fechaCorte = hace30Dias < primerDiaMesActual ? primerDiaMesActual : hace30Dias;

  const { data: deleted, error } = await db()
    .from('cotizaciones')
    .delete()
    .lt('fecha', fechaCorte.toISOString())
    .select('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const count = (deleted || []).length;
  console.log(`[limpiar-docs] Eliminados ${count} documentos anteriores a ${fechaCorte.toISOString().split('T')[0]}`);

  return Response.json({ ok: true, eliminados: count, fechaCorte: fechaCorte.toISOString().split('T')[0] });
}
