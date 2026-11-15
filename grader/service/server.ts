/**
 * Starts the grading service. Settings come from environment variables
 * (see service/README.md); GRADER_API_KEY is required.
 *
 *   GRADER_API_KEY=... npx tsx service/server.ts
 */
import { ConfigError, startFromEnv } from './app';

try {
  const { service, port } = await startFromEnv(process.env);
  process.stdout.write(`Grader service listening on port ${port}\n`);

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`${signal}: finishing work in flight, then closing the browser\n`);
    service.close().then(
      () => process.exit(0),
      (error) => {
        process.stderr.write(`Shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
} catch (error) {
  process.stderr.write(`${error instanceof ConfigError ? error.message : `Could not start: ${error instanceof Error ? error.message : String(error)}`}\n`);
  process.exit(1);
}
