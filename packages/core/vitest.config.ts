import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core',
    // Ambiente Node puro, sem jsdom: é assim que RNF-03 fica verificável —
    // qualquer acesso a DOM no core estoura no teste.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
