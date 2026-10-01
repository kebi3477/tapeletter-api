import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * e2e는 로컬 Postgres의 cassette_test DB를 쓴다 (TEST_DATABASE_URL로 바꿀 수 있다).
 * globalSetup이 스키마를 비우고 마이그레이션을 처음부터 적용한다.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // e2e는 실제 DB·Redis·HTTP를 거쳐서, 다른 작업이 CPU를 쓰는 기기에서는 기본 5초가 빠듯하다
    testTimeout: 20_000,
    hookTimeout: 30_000,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgres://localhost:5432/cassette_test',
      JWT_SECRET: 'e2e-test-secret-e2e-test-secret-0123456789',
      APPLE_CLIENT_IDS: 'app.tapeletter',
      GOOGLE_CLIENT_IDS:
        'web-1.apps.googleusercontent.com, web-2.apps.googleusercontent.com',
      KAKAO_APP_ID: '1234',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379',
      BULLMQ_PREFIX: 'cassette-e2e',
      THROTTLE_DISABLED: process.env.THROTTLE_DISABLED ?? 'true',
      JOBS_DISABLED: 'true',
      REPORT_WEBHOOK_URL: 'https://hooks.test/report',
      PUBLIC_BASE_URL: 'https://tapeletter.test',
      APP_STORE_URL_IOS: 'https://apps.apple.com/app/id1',
      APP_STORE_URL_ANDROID:
        'https://play.google.com/store/apps/details?id=app.tapeletter',
    },
  },
});
