import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `npm test` leaves out test/properties.test.ts (several minutes) via --exclude in package.json;
    // `npm run test:properties` runs only that file and `npm run test:all` runs everything.
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One headless browser at a time.
    fileParallelism: false,
  },
});
