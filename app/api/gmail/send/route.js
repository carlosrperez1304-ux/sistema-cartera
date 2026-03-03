import { requireAuth } from '../../../../lib/security.js';
import { db } from '../../../../lib/supabase.js';

async function getValidToken(username) {
  const { data } = await db().from('usuarios').select('gmail_token').eq('username', username).single();
  if (!data?.gmail_token) return null;
  const token = JSON.parse(data.gmail_token);
  if (Date.now() > token.expiry - 60000 && token.refresh_token) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const newToken = await res.json();
    if (newToken.access_token) {
      const updated = { ...token, access_token: newToken.access_token, expiry: Date.now() + (newToken.expires_in * 1000) };
      await db().from('usuarios').update({ gmail_token: JSON.stringify(updated) }).eq('username', username);
      return updated.access_token;
    }
    return null;
  }
  return token.access_token;
}

export async function POST(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const accessToken = await getValidToken(auth.session.user.username);
  if (!accessToken) return Response.json({ error: 'Gmail no vinculado' }, { status: 401 });

  const { to, subject, body, threadId } = await req.json();
  if (!to || !subject || !body) return Response.json({ error: 'Faltan campos' }, { status: 400 });

  try {
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const encoded = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded, ...(threadId ? { threadId } : {}) }),
    });

    const data = await res.json();
    if (data.error) return Response.json({ error: data.error.message }, { status: 500 });
    return Response.json({ ok: true, id: data.id });
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
