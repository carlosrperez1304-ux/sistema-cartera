import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Solo admins pueden acceder a gestión de usuarios
    if (pathname.startsWith('/api/usuarios') && token?.rol !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Permitir acceso si hay token válido
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // Rutas públicas: login de NextAuth y página principal (maneja su propio auth)
        if (pathname.startsWith('/api/auth')) return true;
        if (pathname === '/') return true;
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
