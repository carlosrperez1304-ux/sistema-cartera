import { db } from '../../../lib/supabase.js';

// POST — validar código de activación (llamado por la app Electron)
export async function POST(req) {
  const { codigo, device_id } = await req.json();

  if (!codigo || !device_id) {
    return Response.json({ ok: false, error: 'Datos incompletos' }, { status: 400 });
  }

  const { data, error } = await db()
    .from('activaciones')
    .select('*')
    .eq('codigo', codigo.toUpperCase().trim())
    .single();

  if (error || !data) {
    return Response.json({ ok: false, error: 'Código inválido' });
  }

  if (!data.activo) {
    return Response.json({ ok: false, error: 'Esta licencia ha sido desactivada. Contacta al administrador.' });
  }

  // Si ya está vinculado a otro dispositivo, rechazar
  if (data.device_id && data.device_id !== device_id) {
    return Response.json({ ok: false, error: 'Este código ya está en uso en otro dispositivo' });
  }

  // Primera activación: vincular al dispositivo
  if (!data.device_id) {
    await db()
      .from('activaciones')
      .update({ device_id, fecha_activacion: new Date().toISOString() })
      .eq('id', data.id);
  }

  return Response.json({ ok: true, nombre_agente: data.nombre_agente });
}
