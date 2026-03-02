import { requireAuth } from '../../../lib/security.js';
import { db } from '../../../lib/supabase.js';

async function getValidToken(username) {
  const { data } = await db().from('usuarios').select('gmail_token').eq('username', username).single();
  if (!data?.gmail_token) return null;
  
  const token = JSON.parse(data.gmail_token);
  
  // Si el token expiró, refrescarlo
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

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const accessToken = await getValidToken(auth.session.user.username);
  if (!accessToken) return Response.json({ error: 'Gmail no vinculado', linked: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const maxResults = searchParams.get('max') || 15;

  try {
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listData = await listRes.json();
    if (!listData.messages) return Response.json({ emails: [], linked: true });

    const emails = await Promise.all(
      listData.messages.slice(0, maxResults).map(async (msg) => {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const get = (name) => headers.find(h => h.name === name)?.value || '';
        return {
          id: msg.id,
          subject: get('Subject') || '(Sin asunto)',
          from: get('From'),
          date: get('Date'),
          snippet: msgData.snippet || '',
          unread: msgData.labelIds?.includes('UNREAD') || false,
        };
      })
    );
    return Response.json({ emails, linked: true });
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
