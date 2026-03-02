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
        const rl = await checkRateLimit(ip);
        if (rl.blocked) throw new Error(rl.message);

        const user = await verifyCredentials(credentials.username, credentials.password);

        if (!user) {
          await recordFailedAttempt(ip);
          auditLog('LOGIN_FAIL', credentials.username || '?', ip);
          throw new Error('Usuario o contraseña incorrectos');
        }

        await clearRateLimit(ip);
        auditLog('LOGIN_OK', user.username, ip);
        return { id: user.username, name: user.nombre, username: user.username, rol: user.rol, empresa_id: user.empresa_id || null };
      },
    }),

    // GoogleProvider solo se activa si las credenciales OAuth están configuradas
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({
          clientId:     process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorization: {
            params: {
              scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
              access_type: 'offline',
              prompt: 'consent',
            }
          }
        })]
      : []),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,    // 24 horas — expira al día siguiente
    updateAge: 60 * 60,      // Renovar cada hora
  },

  jwt: {
    maxAge: 24 * 60 * 60,
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.username   = user.username || user.email;
        token.rol        = user.rol;
        token.empresa_id = user.empresa_id || null;
      }
      // Para usuarios de Google: guardar access token y asignar rol
      if (account?.provider === 'google' && token.email) {
        token.rol = GOOGLE_ADMIN_EMAILS.includes(token.email) ? 'admin' : 'viewer';
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.username    = token.username;
        session.user.rol         = token.rol;
        session.user.empresa_id  = token.empresa_id || null;
        session.user.accessToken = token.accessToken || null;
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
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    pkceCodeVerifier: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.pkce.code_verifier'
        : 'next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 900,
      },
    },
    state: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.state'
        : 'next-auth.state',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 900,
      },
    },
  },
};
