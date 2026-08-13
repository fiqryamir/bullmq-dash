import type { ControllerHandlerReturnType } from '../typings/app';

export function errorHandler(error: Error): ControllerHandlerReturnType {
  return {
    status: 500,
    body: {
      error: 'Queue error',
      details: error.stack || error.message,
    },
  };
}
