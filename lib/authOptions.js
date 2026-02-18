import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { verifyCredentials, auditLog, checkRateLimit, recordFailedAttempt, clearRateLimit } from './security.js';

// Emails de Google que tienen rol de administrador (separados por comas en GOOGLE_ADMIN_EMAILS)
const GOOGLE_ADMIN_EMAILS = process.env.GOOGLE_ADMIN_EMAILS?.split(',').map(e => e.trim()).filter(Boolean) || [];

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials, req) {
        const ip = req?.headers?.['x-forwarded-for'] || req?.headers?.['x-real-ip'] || 'unknown';

        // Rate limiting
        const rl = checkRateLimit(ip);
        if (rl.blocked) throw new Error(rl.message);

        const user = await verifyCredentials(credentials.username, credentials.password);

        if (!user) {
          recordFailedAttempt(ip);
          auditLog('LOGIN_FAIL', credentials.username || '?', ip);
          throw new Error('Usuario o contraseña incorrectos');
        }

        clearRateLimit(ip);
        auditLog('LOGIN_OK', user.username, ip);
        return { id: user.username, name: user.nombre, username: user.username, rol: user.rol };
      },
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,     // 8 horas
    updateAge: 60 * 60,       // Renovar cada hora
  },

  jwt: {
    maxAge: 8 * 60 * 60,
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.username = user.username || user.email;
        token.rol      = user.rol;
      }
      // Para usuarios de Google: asignar rol según el email
      if (account?.provider === 'google' && token.email) {
        token.rol = GOOGLE_ADMIN_EMAILS.includes(token.email) ? 'admin' : 'viewer';
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.username = token.username;
        session.user.rol      = token.rol;
      }
      return session;
    },
  },

  pages: {
    signIn: '/',
    error:  '/',
  },

  // Cookies seguras con SameSite=strict (máxima protección CSRF)
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,                                          // JS no puede leerla
        sameSite: 'strict',                                     // Bloquea CSRF cross-site
        path: '/',
        secure: process.env.NODE_ENV === 'production',          // HTTPS solo en prod
      },
    },
  },
};
