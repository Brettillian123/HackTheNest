# weather-cache

A small HTTP service that caches weather lookups, so apps call the weather API less often.

## Install

Requires Node.js 20 or later.

```bash
npm ci
```

## Configuration

Set these environment variables before you start the service.

| Variable | What it does | Default | Required |
| --- | --- | --- | --- |
| `WEATHER_API_KEY` | Key for the upstream weather API | none | Yes |
| `CACHE_TTL_SECONDS` | How long a cached answer is kept, in seconds | `600` | No |
| `PORT` | Port the service listens on | `8080` | No |

The service does not start without `WEATHER_API_KEY`. Never commit the key to the repository.

## Run

```bash
npm start
```

Check that it is up:

```bash
curl http://localhost:8080/health
```

Output:

```text
ok
```

## Test

```bash
npm test
```

## Limits

- No rate limiting yet: a client can send any number of requests.
