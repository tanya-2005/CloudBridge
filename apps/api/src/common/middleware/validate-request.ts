import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Validates and replaces req.body/params/query with their parsed (and
 * type-coerced) values. Throws ZodError on failure, which the global
 * error handler translates into a 400.
 */
export function validateRequest({ body, params, query }: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (body) req.body = body.parse(req.body);
    if (params) Object.assign(req.params, params.parse(req.params));
    // Express 5 exposes req.query as a getter-only accessor, so it can't be
    // reassigned outright — define an own property on the instance instead.
    if (query) {
      Object.defineProperty(req, "query", {
        value: query.parse(req.query),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}
