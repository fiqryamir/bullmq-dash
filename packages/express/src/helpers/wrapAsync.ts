import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const wrapAsync =
  (fn: RequestHandler): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
