/**
 * Estado reativo da rota corrente, sincronizado com `hashchange`.
 * A parte pura (parsing, rótulos) mora em `router.ts`.
 */

import { parseRoute, routeHref, type Route } from './router.js';

export function createRouter() {
  let current = $state<Route>(parseRoute(location.hash));

  function sync(): void {
    current = parseRoute(location.hash);
  }

  $effect(() => {
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
    };
  });

  return {
    get current(): Route {
      return current;
    },
    navigate(route: Route): void {
      location.hash = routeHref(route);
      sync();
    },
    sync,
  };
}

export type Router = ReturnType<typeof createRouter>;
