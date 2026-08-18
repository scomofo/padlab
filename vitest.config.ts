import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Most of what's worth testing is pure logic; files that need DOM or
    // localStorage opt in with a `@vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['tests/**/*.test.{ts,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/lib/**/*.mjs', 'scripts/validators/**/*.mjs'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx'],
    },
  },
})
