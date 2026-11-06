import { InstanceDto } from '@api/dto/instance.dto';
import { cache, prismaRepository, waMonitor } from '@api/server.module';
import { CacheConf, configService } from '@config/env.config';
import { BadRequestException, ForbiddenException, InternalServerErrorException, NotFoundException } from '@exceptions';
import { CREATE_INSTANCE_ROUTE, FETCH_INSTANCES_ROUTE, isRoute } from '@utils/route-key';
import { NextFunction, Request, Response } from 'express';

async function getInstance(instanceName: string) {
  try {
    const cacheConf = configService.get<CacheConf>('CACHE');

    const exists = !!waMonitor.waInstances[instanceName];

    if (cacheConf.REDIS.ENABLED && cacheConf.REDIS.SAVE_INSTANCES) {
      const keyExists = await cache.has(instanceName);

      return exists || keyExists;
    }

    return exists || (await prismaRepository.instance.findMany({ where: { name: instanceName } })).length > 0;
  } catch (error) {
    throw new InternalServerErrorException(error?.toString());
  }
}

export async function instanceExistsGuard(req: Request, _: Response, next: NextFunction) {
  if (isRoute(req, CREATE_INSTANCE_ROUTE) || isRoute(req, FETCH_INSTANCES_ROUTE)) {
    return next();
  }

  const param = req.params as unknown as InstanceDto;
  if (!param?.instanceName) {
    throw new BadRequestException('"instanceName" not provided.');
  }

  if (!(await getInstance(param.instanceName))) {
    throw new NotFoundException(`The "${param.instanceName}" instance does not exist`);
  }

  next();
}

export async function instanceLoggedGuard(req: Request, _: Response, next: NextFunction) {
  if (isRoute(req, CREATE_INSTANCE_ROUTE)) {
    const instance = req.body as InstanceDto;
    // El controlador hace trim() del nombre: se valida YA normalizado, si no " B " pasaría este
    // control y acabaría pisando (y, ante un error, borrando) la instancia existente "B".
    const name = typeof instance?.instanceName === 'string' ? instance.instanceName.trim() : '';
    if (!name) {
      throw new BadRequestException('"instanceName" not provided.');
    }
    instance.instanceName = name;

    const inDb = (await prismaRepository.instance.findMany({ where: { name } })).length > 0;
    if (inDb || (await getInstance(name))) {
      throw new ForbiddenException(`This name "${name}" is already in use.`);
    }

    if (waMonitor.waInstances[name]) {
      delete waMonitor.waInstances[name];
    }
  }

  next();
}
