import { db } from '../../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_code`);
  if (!state) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_state`);

  try {
    const username = Buffer.from(state, 'base64').toString('utf8');
    if (!username) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=invalid_state`);

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

    // Guardar token en la BD
    const { error } = await db().from('usuarios').update({
      gmail_token: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry: Date.now() + (tokenData.expires_in * 1000),
      })
    }).eq('username', username);

    if (error) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=db_error`);

    return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_ok=1`);
  } catch(e) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=${encodeURIComponent(e.message)}`);
  }
}
