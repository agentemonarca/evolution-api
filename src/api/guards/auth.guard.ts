import { InstanceDto } from '@api/dto/instance.dto';
import { prismaRepository } from '@api/server.module';
import { Auth, configService, Database } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { ForbiddenException, UnauthorizedException } from '@exceptions';
import { CREATE_INSTANCE_ROUTE, FETCH_INSTANCES_ROUTE, isRoute } from '@utils/route-key';
import { NextFunction, Request, Response } from 'express';

const logger = new Logger('GUARD');

async function apikey(req: Request, _: Response, next: NextFunction) {
  const env = configService.get<Auth>('AUTHENTICATION').API_KEY;
  const key = req.get('apikey');
  const db = configService.get<Database>('DATABASE');

  if (!key) {
    throw new UnauthorizedException();
  }

  if (env.KEY === key) {
    return next();
  }

  // Crear instancias exige SIEMPRE la clave global. Se decide por la ruta resuelta por Express,
  // no por originalUrl.includes(): la query (`?x=/instance/fetchInstances`) no debe abrir nada.
  if (isRoute(req, CREATE_INSTANCE_ROUTE)) {
    throw new ForbiddenException('Missing global api key', 'The global api key must be set');
  }
  const param = req.params as unknown as InstanceDto;

  try {
    if (param?.instanceName) {
      const instance = await prismaRepository.instance.findUnique({
        where: { name: param.instanceName },
      });
      if (instance.token === key) {
        return next();
      }
    } else {
      if (isRoute(req, FETCH_INSTANCES_ROUTE) && db.SAVE_DATA.INSTANCE) {
        const instanceByKey = await prismaRepository.instance.findFirst({
          where: { token: key },
        });
        if (instanceByKey) {
          return next();
        }
      }
    }
  } catch (error) {
    logger.error(error);
  }

  throw new UnauthorizedException();
}

export const authGuard = { apikey };
