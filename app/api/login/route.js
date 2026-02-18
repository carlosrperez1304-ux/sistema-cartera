/**
 * Este endpoint ya no se usa para el login principal —
 * NextAuth Credentials Provider lo maneja.
 * Se conserva solo para compatibilidad.
 */
export async function POST() {
  return Response.json({ ok: false, error: 'Usa el login principal' }, { status: 410 });
}
