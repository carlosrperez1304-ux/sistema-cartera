import { requireAuth } from '../../../lib/security.js';
import { db } from '../../../lib/supabase.js';

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

function decodeBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  return '';
}

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const accessToken = await getValidToken(auth.session.user.username);
  if (!accessToken) return Response.json({ error: 'Gmail no vinculado', linked: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const maxResults = searchParams.get('max') || 15;
  const q = searchParams.get('q') || '';

  try {
    const query = q ? `in:inbox ${q}` : 'in:inbox';
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listData = await listRes.json();
    if (!listData.messages) return Response.json({ emails: [], linked: true });

    const emails = await Promise.all(
      listData.messages.slice(0, maxResults).map(async (msg) => {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const get = (name) => headers.find(h => h.name === name)?.value || '';
        const fromRaw = get('From');
        const fromMatch = fromRaw.match(/^(.*?)\s*<(.+)>$/);
        return {
          id: msg.id,
          threadId: msgData.threadId || msg.id,
          subject: get('Subject') || '(Sin asunto)',
          from: fromRaw,
          fromName: fromMatch ? fromMatch[1].trim().replace(/"/g, '') : fromRaw,
          fromEmail: fromMatch ? fromMatch[2] : fromRaw,
          date: get('Date'),
          snippet: msgData.snippet || '',
          body: decodeBody(msgData.payload),
          unread: msgData.labelIds?.includes('UNREAD') || false,
        };
      })
    );
    return Response.json({ emails, linked: true });
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — marcar como leído
export async function PATCH(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const accessToken = await getValidToken(auth.session.user.username);
  if (!accessToken) return Response.json({ error: 'Gmail no vinculado' }, { status: 401 });

  const { id } = await req.json();
  try {
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
    return Response.json({ ok: true });
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
