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
import ejs from 'ejs';
import express, {
  Router,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { wrapAsync } from './helpers/wrapAsync';

export class ExpressAdapter implements IServerAdapter {
  protected readonly app: Express;
  protected basePath = '';
  protected bullBoardQueues: BullBoardQueues | undefined;
  protected errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  protected uiConfig: UIConfig = {};

  constructor() {
    this.app = express();
  }

  public setBasePath(path: string): ExpressAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): ExpressAdapter {
    this.app.use(staticsRoute, express.static(staticsPath));

    return this;
  }

  public setViewsPath(viewPath: string): ExpressAdapter {
    this.app.set('view engine', 'ejs').set('views', viewPath);
    this.app.engine('ejs', ejs.renderFile);

    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): ExpressAdapter {
    if (!this.errorHandler) {
      throw new Error(`Please call 'setErrorHandler' before calling 'setApiRoutes'`);
    } else if (!this.bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before calling 'setApiRoutes'`);
    }
    const router = Router();
    router.use(express.json());

    expandRouteDefs(routes).forEach(({ method, route, handler }) => {
      const wrappedHandler = wrapAsync(async (req: Request, res: Response) => {
        const bullBoardRequest: BullBoardRequest = buildBullBoardRequest(
          this.bullBoardQueues!,
          this.uiConfig,
          {
            query: req.query,
            params: req.params,
            body: req.body,
            headers: req.headers,
          }
        );
        const response = await handler(bullBoardRequest);

        res.status(response.status || 200).json(response.body);
      });

      (router[method] as (path: string | string[], handler: RequestHandler) => void)(
        route,
        wrappedHandler
      );
    });

    router.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
      if (!this.errorHandler) {
        return next();
      }

      const response = this.errorHandler(err);
      return res.status(response.status || 500).send(response.body);
    });

    this.app.use(router);
    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): ExpressAdapter {
    const viewHandler = (_req: Request, res: Response) => {
      const { name, params } = routeDef.handler({
        basePath: this.basePath,
        uiConfig: this.uiConfig,
      });

      res.render(name, params);
    };

    this.app[routeDef.method](routeDef.route, viewHandler);
    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): ExpressAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  setUIConfig(config: UIConfig = {}): ExpressAdapter {
    this.uiConfig = config;
    return this;
  }

  public getRouter(): Express {
    return this.app;
  }
}
