const routerAuto = new Set(['vue-router/auto', 'vue-router/auto-routes']);

export interface IconSpecifier {
  readonly collection: string;
  readonly name: string;
}

export function iconSpecifier(specifier: string): IconSpecifier | undefined {
  const match = /^~icons\/([^/]+)\/([^/]+)$/.exec(specifier);
  const collection = match?.[1];
  const name = match?.[2];
  if (!collection || !name || !isIconToken(collection) || !isIconToken(name))
    return undefined;
  return { collection, name };
}

export function isRouterAuto(specifier: string): boolean {
  return routerAuto.has(specifier);
}

/** Package that proves a virtual specifier, when it is not a committed file. */
export function evidencePackageName(specifier: string): string | undefined {
  const icon = iconSpecifier(specifier);
  if (icon) return `@iconify-json/${icon.collection}`;
  if (isRouterAuto(specifier)) return 'unplugin-vue-router';
  return undefined;
}

function isIconToken(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);
}
