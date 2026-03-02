import { db } from '../../../../lib/supabase.js';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/authOptions.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_code`);

  const session = await getServerSession(authOptions);
  if (!session) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_session`);

  try {
    // Intercambiar code por token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/gmail/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_token`);

    // Guardar token en la base de datos
    await db().from('usuarios').update({
      gmail_token: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry: Date.now() + (tokenData.expires_in * 1000),
      })
    }).eq('username', session.user.username);

    return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_ok=1`);
  } catch(e) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=${e.message}`);
  }
}
