import { requireAuth } from '../../../lib/security.js';

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const accessToken = auth.session.user.accessToken;
  if (!accessToken) return Response.json({ error: 'No hay token de Gmail. Inicia sesión con Google.' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const maxResults = searchParams.get('max') || 10;

  try {
    // Obtener lista de mensajes
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listData = await listRes.json();
    if (!listData.messages) return Response.json({ emails: [] });

    // Obtener detalles de cada mensaje
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

    return Response.json({ emails });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
