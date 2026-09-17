import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protege rutas internas (Scout Agent y cualquier otra que se agregue al matcher) con
// HTTP Basic Auth simple. Ver AGENTS.md § "Rutas protegidas" para cómo agregar más.
export const config = {
  matcher: ['/scout', '/scout/:path*', '/api/agents/scout', '/api/agents/scout/:path*'],
};

function unauthorized() {
  return new NextResponse('Autenticación requerida', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Amazon Business Engine", charset="UTF-8"' },
  });
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.SCOUT_AUTH_USER;
  const expectedPassword = process.env.SCOUT_AUTH_PASSWORD;

  // Fail closed: si las credenciales no están configuradas en el entorno, no hay forma
  // de validar acceso, así que se bloquea en vez de dejar pasar por defecto.
  if (!expectedUser || !expectedPassword) {
    return unauthorized();
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return unauthorized();
  }

  const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf-8');
  const separatorIndex = decoded.indexOf(':');
  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (user !== expectedUser || password !== expectedPassword) {
    return unauthorized();
  }

  return NextResponse.next();
}
