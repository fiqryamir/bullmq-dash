import type { AppControllerRoute, HTTPMethod } from '../typings/app';

/**
 * A route with the array forms of `AppControllerRoute` expanded into every
 * method-route pair — the shape server adapters register with their framework.
 */
export type RouteDef = {
  method: HTTPMethod;
  route: string;
  handler: AppControllerRoute['handler'];
};

export function expandRouteDefs(routes: AppControllerRoute[]): RouteDef[] {
  return routes.flatMap((routeDef) => {
    const methods = Array.isArray(routeDef.method) ? routeDef.method : [routeDef.method];
    const paths = Array.isArray(routeDef.route) ? routeDef.route : [routeDef.route];

    return methods.flatMap((method) =>
      paths.map((route) => ({ method, route, handler: routeDef.handler }))
    );
  });
}
