'use strict';

/**
 * Factory that returns an Express middleware that validates req.body,
 * req.params, or req.query against a Zod schema.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details },
      });
    }
    req[source] = result.data;   // replace with the parsed (coerced) value
    next();
  };
}

module.exports = { validate };
