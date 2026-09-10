const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
type EnvLike = Record<string, string | undefined>;

export const EXPERIMENTAL_PRODUCTS_ERROR =
  'Experimental products are disabled. Set ENABLE_EXPERIMENTAL_PRODUCTS=true only for local demo use.';

function envFlag(env: EnvLike, names: readonly string[]) {
  return names.some((name) => TRUE_VALUES.has((env[name] ?? '').trim().toLowerCase()));
}

export function areExperimentalProductsEnabled(env: EnvLike = process.env) {
  return envFlag(env, ['ENABLE_EXPERIMENTAL_PRODUCTS', 'NEXT_PUBLIC_ENABLE_EXPERIMENTAL_PRODUCTS']);
}

export function assertExperimentalProductsEnabled(enabled = areExperimentalProductsEnabled()) {
  if (!enabled) {
    throw new Error(EXPERIMENTAL_PRODUCTS_ERROR);
  }
}
