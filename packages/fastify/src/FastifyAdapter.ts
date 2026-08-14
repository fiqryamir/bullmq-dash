import {
  buildBullBoardRequest,
  expandRouteDefs,
  type AppControllerRoute,
  type AppViewRoute,
  type BullBoardQueues,
  type BullBoardRequest,
  type ControllerHandlerReturnType,
  type IServerAdapter,
  type UIConfig,
} from '@bullmq-dash/api';
import fastifyStatic from '@fastify/static';
import pointOfView from '@fastify/view';
import ejs from 'ejs';
import type { FastifyPluginCallback, HTTPMethods } from 'fastify';

type FastifyRouteDef = {
  method: HTTPMethods;
  route: string;
  handler: AppControllerRoute['handler'];
};

export class FastifyAdapter implements IServerAdapter {
  protected basePath = '';
  protected bullBoardQueues: BullBoardQueues | undefined;
  protected errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  protected statics: { route: string; path: string } | undefined;
  protected viewPath: string | undefined;
  protected entryRoute: AppViewRoute | undefined;
  protected apiRoutes: FastifyRouteDef[] | undefined;
  protected uiConfig: UIConfig = {};

  public setBasePath(path: string): FastifyAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): FastifyAdapter {
    this.statics = { route: staticsRoute, path: staticsPath };
    return this;
  }

  public setViewsPath(viewPath: string): FastifyAdapter {
    this.viewPath = viewPath;
    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): FastifyAdapter {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): FastifyAdapter {
    this.apiRoutes = expandRouteDefs(routes).map(({ method, route, handler }) => ({
      method: method.toUpperCase() as HTTPMethods,
      route,
      handler,
    }));
    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): FastifyAdapter {
    this.entryRoute = routeDef;
    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): FastifyAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public setUIConfig(config: UIConfig = {}): FastifyAdapter {
    this.uiConfig = config;
    return this;
  }

  public registerPlugin(): FastifyPluginCallback<{ prefix?: string }> {
    return (fastify, opts, done) => {
      const { statics, viewPath, entryRoute, apiRoutes, bullBoardQueues, errorHandler } = this;

      if (!statics || !entryRoute || !viewPath || !apiRoutes || !bullBoardQueues || !errorHandler) {
        const missing = (
          [
            ['setStaticPath', statics],
            ['setEntryRoute', entryRoute],
            ['setViewsPath', viewPath],
            ['setApiRoutes', apiRoutes],
            ['setQueues', bullBoardQueues],
            ['setErrorHandler', errorHandler],
          ] as const
        ).find(([, value]) => !value);

        done(new Error(`Please call '${missing![0]}' before using 'registerPlugin'`));
        return;
      }

      if (opts.prefix && !this.basePath) {
        this.setBasePath(opts.prefix);
      }

      fastify.register(pointOfView, {
        engine: { ejs },
        root: viewPath,
      });

      fastify.register(fastifyStatic, {
        root: statics.path,
        prefix: statics.route,
      });

      const { method, route, handler } = entryRoute;
      const entryMethod = method.toUpperCase() as HTTPMethods;
      (Array.isArray(route) ? route : [route]).forEach((url) => {
        fastify.route({
          method: entryMethod,
          url,
          handler: (_request, reply) => {
            const { name, params } = handler({ basePath: this.basePath, uiConfig: this.uiConfig });
            return reply.view(name, params);
          },
        });
      });

      apiRoutes.forEach((route) => {
        fastify.route({
          method: route.method,
          url: route.route,
          handler: async (request, reply) => {
            const bullBoardRequest: BullBoardRequest = buildBullBoardRequest(
              bullBoardQueues,
              this.uiConfig,
              {
                query: request.query,
                params: request.params,
                body: request.body,
                headers: request.headers,
              }
            );
            const response = await route.handler(bullBoardRequest);

            return reply.status(response.status || 200).send(response.body);
          },
        });
      });

      fastify.setErrorHandler((error: Error, _request, reply) => {
        const response = errorHandler(error);
        return reply.status(response.status || 500).send(response.body);
      });

      done();
    };
  }
}
