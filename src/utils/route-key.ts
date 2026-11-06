import { Request } from 'express';

/**
 * Identifica la ruta que Express RESOLVIÓ para esta petición, como "MÉTODO /base/ruta".
 * Las decisiones de seguridad deben usar esto y nunca `originalUrl.includes(...)`, que también
 * casa con la query string (p. ej. `/instance/create?x=/instance/fetchInstances`).
 * Devuelve '' si la petición no pasó por una ruta (middleware global).
 */
export function resolvedRouteKey(req: Request): string {
  const routePath = typeof req?.route?.path === 'string' ? req.route.path : undefined;
  if (routePath === undefined) return '';
  const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  return `${String(req.method).toUpperCase()} ${base}${routePath}`.toLowerCase();
}

export function isRoute(req: Request, key: string): boolean {
  return resolvedRouteKey(req) === key.toLowerCase();
}

export const CREATE_INSTANCE_ROUTE = 'POST /instance/create';
export const FETCH_INSTANCES_ROUTE = 'GET /instance/fetchInstances';
