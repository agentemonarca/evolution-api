import { GetParticipant, GroupInvite } from '@api/dto/group.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { CREATE_INSTANCE_ROUTE, isRoute } from '@utils/route-key';
import { Request } from 'express';
import { JSONSchema7 } from 'json-schema';
import { validate } from 'jsonschema';

type DataValidate<T> = {
  request: Request;
  schema: JSONSchema7;
  ClassRef: any;
  execute: (instance: InstanceDto, data: T) => Promise<any>;
};

const logger = new Logger('Validate');

const PROTECTED_INSTANCE_FIELDS = ['instanceName', 'instanceId'] as const;

export function sanitizeUntrustedInput(
  source: Record<string, any> | undefined,
  allowed: readonly string[] = [],
): Record<string, any> {
  if (!source || typeof source !== 'object') return {};
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(source)) {
    if ((PROTECTED_INSTANCE_FIELDS as readonly string[]).includes(key) && !allowed.includes(key)) {
      logger.warn(`Ignoring attempt to override protected field "${key}" via untrusted input`);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * ¿Es la ruta cuyo `instanceName` SOLO puede venir del body? Hoy únicamente POST /instance/create,
 * que no lleva `:instanceName` en la URL. Se compara la ruta que Express resolvió
 * (`baseUrl` + `route.path`), NUNCA `originalUrl.includes(...)`: eso también casa con una query
 * como `/message/sendText/A?x=/instance/create` y reabriría el bypass entre instancias.
 */
export function isBodyInstanceNameRoute(request: Request): boolean {
  const params = (request?.params ?? {}) as Record<string, any>;
  if (params.instanceName !== undefined || params.instanceId !== undefined) return false;
  return isRoute(request, CREATE_INSTANCE_ROUTE);
}

export abstract class RouterBroker {
  constructor() {}
  public routerPath(path: string, param = true) {
    let route = '/' + path;
    param ? (route += '/:instanceName') : null;

    return route;
  }

  public async dataValidate<T>(args: DataValidate<T>) {
    const { request, schema, ClassRef, execute } = args;

    const ref = new ClassRef();
    const body = request.body;
    const instance = request.params as unknown as InstanceDto;

    if (request?.query && Object.keys(request.query).length > 0) {
      Object.assign(instance, sanitizeUntrustedInput(request.query as Record<string, any>));
    }

    if (isBodyInstanceNameRoute(request)) {
      // En /instance/create no hay :instanceName en la URL: el nombre de la instancia NUEVA solo
      // puede venir del body. Se deja pasar únicamente en esa ruta exacta (instanceId sigue
      // filtrado: lo genera el servidor). En cualquier otra ruta se sigue descartando.
      const allowed = typeof body?.instanceName === 'string' ? ['instanceName'] : [];
      Object.assign(instance, sanitizeUntrustedInput(body, allowed));
    }

    Object.assign(ref, body);

    const v = schema ? validate(ref, schema) : { valid: true, errors: [] };

    if (!v.valid) {
      const message: any[] = v.errors.map(({ stack, schema }) => {
        let message: string;
        if (schema['description']) {
          message = schema['description'];
        } else {
          message = stack.replace('instance.', '');
        }
        return message;
      });
      logger.error(message);
      throw new BadRequestException(message);
    }

    return await execute(instance, ref);
  }

  public async groupNoValidate<T>(args: DataValidate<T>) {
    const { request, ClassRef, schema, execute } = args;

    const instance = request.params as unknown as InstanceDto;

    const ref = new ClassRef();

    Object.assign(ref, request.body);

    const v = validate(ref, schema);

    if (!v.valid) {
      const message: any[] = v.errors.map(({ property, stack, schema }) => {
        let message: string;
        if (schema['description']) {
          message = schema['description'];
        } else {
          message = stack.replace('instance.', '');
        }
        return {
          property: property.replace('instance.', ''),
          message,
        };
      });
      logger.error([...message]);
      throw new BadRequestException(...message);
    }

    return await execute(instance, ref);
  }

  public async groupValidate<T>(args: DataValidate<T>) {
    const { request, ClassRef, schema, execute } = args;

    const instance = request.params as unknown as InstanceDto;
    const body = request.body;

    let groupJid = body?.groupJid;

    if (!groupJid) {
      if (request.query?.groupJid) {
        groupJid = request.query.groupJid;
      } else {
        throw new BadRequestException('The group id needs to be informed in the query', 'ex: "groupJid=120362@g.us"');
      }
    }

    if (!groupJid.endsWith('@g.us')) {
      groupJid = groupJid + '@g.us';
    }

    Object.assign(body, {
      groupJid: groupJid,
    });

    const ref = new ClassRef();

    Object.assign(ref, body);

    const v = validate(ref, schema);

    if (!v.valid) {
      const message: any[] = v.errors.map(({ property, stack, schema }) => {
        let message: string;
        if (schema['description']) {
          message = schema['description'];
        } else {
          message = stack.replace('instance.', '');
        }
        return {
          property: property.replace('instance.', ''),
          message,
        };
      });
      logger.error([...message]);
      throw new BadRequestException(...message);
    }

    return await execute(instance, ref);
  }

  public async inviteCodeValidate<T>(args: DataValidate<T>) {
    const { request, ClassRef, schema, execute } = args;

    const inviteCode = request.query as unknown as GroupInvite;

    if (!inviteCode?.inviteCode) {
      throw new BadRequestException(
        'The group invite code id needs to be informed in the query',
        'ex: "inviteCode=F1EX5QZxO181L3TMVP31gY" (Obtained from group join link)',
      );
    }

    const instance = request.params as unknown as InstanceDto;
    const body = request.body;

    const ref = new ClassRef();

    Object.assign(body, inviteCode);
    Object.assign(ref, body);

    const v = validate(ref, schema);

    if (!v.valid) {
      const message: any[] = v.errors.map(({ property, stack, schema }) => {
        let message: string;
        if (schema['description']) {
          message = schema['description'];
        } else {
          message = stack.replace('instance.', '');
        }
        return {
          property: property.replace('instance.', ''),
          message,
        };
      });
      logger.error([...message]);
      throw new BadRequestException(...message);
    }

    return await execute(instance, ref);
  }

  public async getParticipantsValidate<T>(args: DataValidate<T>) {
    const { request, ClassRef, schema, execute } = args;

    const getParticipants = request.query as unknown as GetParticipant;

    if (!getParticipants?.getParticipants) {
      throw new BadRequestException('The getParticipants needs to be informed in the query');
    }

    const instance = request.params as unknown as InstanceDto;
    const body = request.body;

    const ref = new ClassRef();

    Object.assign(body, getParticipants);
    Object.assign(ref, body);

    const v = validate(ref, schema);

    if (!v.valid) {
      const message: any[] = v.errors.map(({ property, stack, schema }) => {
        let message: string;
        if (schema['description']) {
          message = schema['description'];
        } else {
          message = stack.replace('instance.', '');
        }
        return {
          property: property.replace('instance.', ''),
          message,
        };
      });
      logger.error([...message]);
      throw new BadRequestException(...message);
    }

    return await execute(instance, ref);
  }
}
