import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Solo admins pueden acceder a gestión de usuarios
    if (pathname.startsWith('/api/usuarios') && req.method !== 'GET' && token?.rol !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Permitir acceso si hay token válido
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // Rutas públicas: login de NextAuth, página principal y activación de licencia
        if (pathname.startsWith('/api/auth')) return true;
        if (pathname === '/') return true;
        if (pathname === '/api/activaciones') return true;
        if (pathname === '/api/watcher') return true;
        if (pathname.startsWith('/api/subgrupos')) return true;
        if (pathname.startsWith('/api/recordatorios')) return true;
        if (pathname === '/api/leer-pdf') return true;
        // El resto de APIs requieren token
        if (pathname.startsWith('/api/')) return !!token;
        return true;
      },
    },
  }
);

export const config = {
  matcher: ['/api/:path*'],
};
