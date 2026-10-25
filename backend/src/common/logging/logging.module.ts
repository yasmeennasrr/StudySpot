import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Structured JSON logs with a request ID on every line. The ID comes from the
 * X-Request-Id header when the client sends a safe one, otherwise it is
 * generated, and it is echoed back in the response header and in error bodies.
 * Inject PinoLogger in any service and its lines carry the same ID, so one
 * request can be traced through API -> module -> module -> repository.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL', 'info'),
          genReqId: (req, res) => {
            const incoming = req.headers[REQUEST_ID_HEADER];
            const id =
              typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          customProps: (req) => ({ requestId: (req as { id?: unknown }).id }),
          redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
          transport:
            config.get<string>('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
