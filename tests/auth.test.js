import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de next-auth para simular sesiones
vi.mock('next-auth', () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({
  db: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));

import { getServerSession } from 'next-auth';

function makeRequest(method = 'GET', body = null, headers = {}) {
  return {
    method,
    headers: new Map(Object.entries({ host: 'localhost:3000', ...headers })),
    json: async () => body,
    url: 'http://localhost:3000/api/test',
  };
}

describe('requireAuth', () => {
  it('rechaza request sin sesion', async () => {
    getServerSession.mockResolvedValue(null);
    const { requireAuth } = await import('../lib/security.js');
    const result = await requireAuth(makeRequest());
    expect(result.error).toBe('No autorizado');
    expect(result.status).toBe(401);
  });

  it('permite request con sesion valida', async () => {
    getServerSession.mockResolvedValue({ user: { username: 'CPEREZ', rol: 'admin' } });
    const { requireAuth } = await import('../lib/security.js');
    const result = await requireAuth(makeRequest());
    expect(result.session).toBeDefined();
    expect(result.error).toBeUndefined();
  });
});

describe('requireAdmin', () => {
  it('rechaza usuario con rol viewer', async () => {
    getServerSession.mockResolvedValue({ user: { username: 'USER1', rol: 'viewer' } });
    const { requireAdmin } = await import('../lib/security.js');
    const result = await requireAdmin(makeRequest());
    expect(result.error).toBe('Acceso denegado — solo administradores');
    expect(result.status).toBe(403);
  });

  it('permite usuario con rol admin', async () => {
    getServerSession.mockResolvedValue({ user: { username: 'CPEREZ', rol: 'admin' } });
    const { requireAdmin } = await import('../lib/security.js');
    const result = await requireAdmin(makeRequest());
    expect(result.session).toBeDefined();
  });
});

describe('checkCsrf', () => {
  it('bloquea request con origin diferente al host', async () => {
    const { checkCsrf } = await import('../lib/security.js');
    const req = makeRequest('POST', null, { origin: 'https://malicious.com', host: 'localhost:3000' });
    req.headers = { get: (k) => ({ origin: 'https://malicious.com', host: 'localhost:3000' }[k]) };
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it('permite request sin origin', async () => {
    const { checkCsrf } = await import('../lib/security.js');
    const req = { headers: { get: () => null } };
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });
});
