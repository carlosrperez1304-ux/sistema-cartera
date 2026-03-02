import { requireAuth } from '../../../../lib/security.js';
import { db } from '../../../../lib/supabase.js';

// GET — generar URL de autorización de Gmail
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/gmail/callback`;
  const scope = 'https://www.googleapis.com/auth/gmail.readonly';

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

  return Response.json({ url });
}

// DELETE — desvincular Gmail
export async function DELETE(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const username = auth.session.user.username;
  await db().from('usuarios').update({ gmail_token: null }).eq('username', username);
  return Response.json({ ok: true });
}
