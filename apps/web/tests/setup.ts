import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Cada teste começa numa URL limpa: o roteador e o RF-03 leem `location.hash`.
  history.replaceState(null, '', '/');
});
