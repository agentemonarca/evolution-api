// Prueba de regresión: POST /instance/create debe recibir el instanceName del body,
// y ninguna otra ruta puede usar body/query para cambiar de instancia (bypass entre instancias).
// Ejecutar: npx tsx --test test/create-instance-name.test.ts
// Mismo orden de carga que main.ts (las rutas antes que RouterBroker), por la dependencia circular
// @exceptions -> index.router -> abstract.router.
// eslint-disable-next-line simple-import-sort/imports
import '@api/routes/index.router';
import { RouterBroker } from '@api/abstract/abstract.router';
import express, { Router } from 'express';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

class Dto {}

class TestRouter extends RouterBroker {
  public readonly router: Router = Router();
  constructor(paths: string[]) {
    super();
    for (const p of paths) {
      this.router.post(p, async (req, res) => {
        const seen = await this.dataValidate<any>({
          request: req,
          schema: null,
          ClassRef: Dto,
          execute: async (instance) => ({ ...instance }),
        });
        res.json(seen);
      });
    }
  }
}

let base = '';
let server: ReturnType<express.Express['listen']>;

before(async () => {
  const app = express();
  app.use(express.json());
  const instance = new TestRouter(['/create', '/restart/:instanceName']);
  const message = new TestRouter(['/sendText/:instanceName']);
  app.use('/instance', instance.router);
  app.use('/message', message.router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

async function post(path: string, body: any) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
}

test('create: toma instanceName del body', async () => {
  const r = await post('/instance/create', { instanceName: 'prueba-local', integration: 'WHATSAPP-BAILEYS' });
  assert.equal(r.json.instanceName, 'prueba-local');
  assert.equal(r.json.integration, 'WHATSAPP-BAILEYS');
});

test('create: instanceId del body sigue filtrado y la query no gana al body', async () => {
  const r = await post('/instance/create?instanceName=desde-query&instanceId=x', {
    instanceName: 'prueba-local',
    instanceId: 'id-inyectado',
  });
  assert.equal(r.json.instanceName, 'prueba-local');
  assert.equal(r.json.instanceId, undefined);
});

test('create: instanceName no-string no pasa', async () => {
  const r = await post('/instance/create', { instanceName: { $ne: null } });
  assert.equal(r.json.instanceName, undefined);
});

test('bypass cerrado: query ?instanceName en ruta con :instanceName', async () => {
  const r = await post('/message/sendText/A?instanceName=B', { number: '1' });
  assert.equal(r.json.instanceName, 'A');
});

test('bypass cerrado: "/instance/create" metido en la query no abre el body', async () => {
  const r = await post('/message/sendText/A?x=/instance/create', { instanceName: 'B', instanceId: 'B-id' });
  assert.equal(r.json.instanceName, 'A');
  assert.equal(r.json.instanceId, undefined);
});

test('bypass cerrado: body instanceName en otra ruta de /instance', async () => {
  const r = await post('/instance/restart/A?x=/instance/create', { instanceName: 'B' });
  assert.equal(r.json.instanceName, 'A');
});

test('route-key: la query no cambia la ruta resuelta; mayúsculas y barra final sí casan', async () => {
  const { resolvedRouteKey } = await import('@utils/route-key');
  const app = express();
  const r = Router();
  r.post('/create', (req, res) => res.json({ key: resolvedRouteKey(req) }));
  r.get('/fetchInstances', (req, res) => res.json({ key: resolvedRouteKey(req) }));
  app.use('/instance', r);
  const srv = app.listen(0);
  await new Promise((ok) => srv.once('listening', ok));
  const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const k = async (m: string, p: string) => (await (await fetch(b + p, { method: m })).json()).key;
  try {
    assert.equal(await k('POST', '/instance/create?x=/instance/fetchInstances'), 'post /instance/create');
    assert.equal(await k('POST', '/INSTANCE/CREATE'), 'post /instance/create');
    assert.equal(await k('POST', '/instance/create/'), 'post /instance/create');
    assert.equal(await k('GET', '/instance/fetchInstances?x=/instance/create'), 'get /instance/fetchinstances');
  } finally {
    srv.close();
  }
});
