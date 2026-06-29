export function env(Astro: any): Env {
  return Astro.locals.runtime.env as Env;
}
