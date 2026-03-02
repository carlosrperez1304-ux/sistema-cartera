import { db } from '../../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('Gmail callback - code:', !!code, 'state:', state, 'error:', error);

  if (error) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=${error}`);
  if (!code) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_code`);
  if (!state) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_state`);

  try {
    const username = Buffer.from(state, 'base64').toString('utf8');
    console.log('Gmail callback - username:', username);

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
    console.log('Gmail callback - token error:', tokenData.error, 'has token:', !!tokenData.access_token);

    if (!tokenData.access_token) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=no_token_${tokenData.error}`);

    const { error: dbError } = await db().from('usuarios').update({
      gmail_token: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry: Date.now() + (tokenData.expires_in * 1000),
      })
    }).eq('username', username);

    console.log('Gmail callback - db error:', dbError);

    if (dbError) return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=db_${dbError.message}`);

    return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_ok=1`);
  } catch(e) {
    console.log('Gmail callback - exception:', e.message);
    return Response.redirect(`${process.env.NEXTAUTH_URL}/?gmail_error=${encodeURIComponent(e.message)}`);
  }
}
