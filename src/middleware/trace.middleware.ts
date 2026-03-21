import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const TraceContext = new AsyncLocalStorage<Map<string, string>>();

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const traceId = (req.headers['x-trace-id'] as string) || uuidv4();
    const store = new Map<string, string>();
    store.set('traceId', traceId);

    TraceContext.run(store, () => {
      res.setHeader('x-trace-id', traceId);
      next();
    });
  }
}
