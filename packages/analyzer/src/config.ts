import { readdirSync, realpathSync } from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import ts from 'typescript';
import type { Snapshot } from '@difftrail/git';
import { packageName } from './external-manifest.js';

export interface SnapshotConfig {
  readonly parsed: ts.ParsedCommandLine;
  readonly files: readonly string[];
}

export interface ExternalConfigExtend {
  readonly configPath: string;
  readonly specifier: string;
}

export interface ValidatedConfigRoot {
  readonly packageRoot: string;
  readonly specifier: string;
}

export function aliasMatches(pattern: string, specifier: string): boolean {
  const wildcard = pattern.indexOf('*');
  if (wildcard < 0) return pattern === specifier;
  return (
    specifier.startsWith(pattern.slice(0, wildcard)) &&
    specifier.endsWith(pattern.slice(wildcard + 1))
  );
}

function repositoryPath(snapshot: Snapshot, file: string): string | null {
  const local = relative(snapshot.directory, resolve(file));
  if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
    return null;
  return local ? local.split(sep).join('/') : '.';
}

/** Parses only committed files and records the inherited configuration files used. */
export function parseSnapshotConfig(
  snapshot: Snapshot,
  configPath: string,
  externalPackageRoots: readonly ValidatedConfigRoot[] = [],
): SnapshotConfig {
  const { host, readFiles, unrecoverable } = createSnapshotConfigHost(
    snapshot,
    configPath,
    externalPackageRoots,
  );
  const configFile = resolve(snapshot.directory, configPath);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFile,
    { ignoreDeprecations: '6.0' },
    host,
  );
  if (!parsed) {
    const diagnostic = unrecoverable();
    throw new Error(
      diagnostic
        ? ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
        : `TypeScript could not read configuration ${configPath}`,
    );
  }
  const errors = parsed.errors.filter(
    (diagnostic) => diagnostic.code !== 18003,
  );
  if (errors.length) {
    throw new Error(
      errors
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
        )
        .join('; '),
    );
  }
  return {
    parsed,
    files: [...readFiles].filter((file) => file.endsWith('.json')),
  };
}

function createSnapshotConfigHost(
  snapshot: Snapshot,
  configPath: string,
  providers: readonly ValidatedConfigRoot[],
): {
  readonly host: ts.ParseConfigFileHost;
  readonly readFiles: Set<string>;
  readonly unrecoverable: () => ts.Diagnostic | undefined;
} {
  const tracked = new Set(snapshot.paths);
  const context = createConfigHostContext(snapshot, configPath, providers);
  const readFiles = new Set<string>();
  let unrecoverable: ts.Diagnostic | undefined;
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      unrecoverable = diagnostic;
    },
    readFile: (file) => {
      const path = repositoryPath(snapshot, file);
      if (
        (!path || !tracked.has(path)) &&
        !isAllowedExternalFile(file, context)
      )
        return undefined;
      const contents = ts.sys.readFile(file);
      if (contents !== undefined && path && tracked.has(path))
        readFiles.add(path);
      return contents;
    },
    fileExists: (file) => {
      const path = repositoryPath(snapshot, file);
      return (
        (!!path && tracked.has(path) && ts.sys.fileExists(file)) ||
        (isAllowedExternalFile(file, context) && ts.sys.fileExists(file))
      );
    },
    readDirectory: (rootDir, extensions, _excludes, includes, depth) =>
      readConfigDirectory(
        snapshot,
        rootDir,
        extensions,
        includes,
        depth,
        context,
      ),
    directoryExists: (directory) => {
      const local = repositoryPath(snapshot, directory);
      if (local !== null && context.trackedDirectories.has(local)) return true;
      if (context.providerLinkDirectories.has(resolve(directory))) return true;
      return (
        isValidatedPackagePath(
          directory,
          context.allowedRoots,
          context.providerLinks,
        ) && ts.sys.directoryExists(directory)
      );
    },
    realpath: (path) => {
      const local = repositoryPath(snapshot, path);
      if (local !== null && tracked.has(local))
        return resolve(snapshot.directory, local);
      if (
        isValidatedPackagePath(
          path,
          context.allowedRoots,
          context.providerLinks,
        )
      ) {
        const candidate = realpathSync(path);
        if (context.allowedRoots.some((root) => isWithin(root, candidate)))
          return candidate;
      }
      return resolve(path);
    },
  };
  return { host, readFiles, unrecoverable: () => unrecoverable };
}

interface ConfigHostContext {
  readonly allowedRoots: readonly string[];
  readonly trackedDirectories: ReadonlySet<string>;
  readonly providerLinks: readonly string[];
  readonly providerLinkDirectories: ReadonlySet<string>;
}

function createConfigHostContext(
  snapshot: Snapshot,
  configPath: string,
  providers: readonly ValidatedConfigRoot[],
): ConfigHostContext {
  const packageRoots = providers.map((provider) => provider.packageRoot);
  const allowedRoots = [
    ...new Set(
      packageRoots.flatMap((root) => {
        try {
          return [resolve(root), realpathSync(root)];
        } catch {
          return [resolve(root)];
        }
      }),
    ),
  ];
  const providerLinks = validatedPackageLinks(snapshot, configPath, providers);
  return {
    allowedRoots,
    trackedDirectories: trackedDirectoriesFor(snapshot.paths),
    providerLinks,
    providerLinkDirectories: providerLinkDirectoriesFor(
      snapshot,
      providerLinks,
    ),
  };
}

function isAllowedExternalFile(
  file: string,
  context: ConfigHostContext,
): boolean {
  if (
    !isValidatedPackagePath(file, context.allowedRoots, context.providerLinks)
  )
    return false;
  try {
    const candidate = realpathSync(file);
    return context.allowedRoots.some((root) => isWithin(root, candidate));
  } catch {
    return false;
  }
}

function readConfigDirectory(
  snapshot: Snapshot,
  rootDir: string,
  extensions: readonly string[] | undefined,
  includes: readonly string[] | undefined,
  depth: number | undefined,
  context: ConfigHostContext,
): string[] {
  for (const include of includes ?? []) {
    const base = includeBase(rootDir, include);
    const local = repositoryPath(snapshot, base);
    if (
      (local === null || !context.trackedDirectories.has(local)) &&
      !isValidatedPackagePath(base, context.allowedRoots, context.providerLinks)
    )
      throw new Error(
        `configuration include ${include} resolves outside the committed snapshot and validated installed package roots`,
      );
  }
  const localRoot = repositoryPath(snapshot, rootDir);
  const rootIsTracked =
    localRoot !== null && context.trackedDirectories.has(localRoot);
  const files = rootIsTracked
    ? snapshot.paths
        .filter((path) => isPathWithin(localRoot, path))
        .map((path) => resolve(snapshot.directory, path))
        .filter((path) => withinDepth(rootDir, path, depth))
    : isValidatedPackagePath(
          rootDir,
          context.allowedRoots,
          context.providerLinks,
        )
      ? safePackageFiles(rootDir, depth)
      : [];
  return files.filter(
    (file) => !extensions?.length || extensions.includes(extname(file)),
  );
}

function trackedDirectoriesFor(paths: readonly string[]): Set<string> {
  const directories = new Set(['.']);
  for (const path of paths) {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index++)
      directories.add(parts.slice(0, index).join('/'));
  }
  return directories;
}

function includeBase(rootDir: string, include: string): string {
  const pattern = resolve(
    isAbsolute(include) ? include : resolve(rootDir, include),
  );
  const segments = pattern.split(sep);
  const wildcard = segments.findIndex((segment) => /[*?{}]/.test(segment));
  if (wildcard < 0) return dirname(pattern);
  const prefix = segments.slice(0, wildcard).join(sep);
  return prefix || sep;
}

function isValidatedPackagePath(
  path: string,
  roots: readonly string[],
  links: readonly string[],
): boolean {
  const candidate = resolve(path);
  if (
    !roots.some((root) => isWithin(root, candidate)) &&
    !links.some((link) => isWithin(link, candidate))
  )
    return false;
  try {
    const canonical = realpathSync(candidate);
    return roots.some((root) => isWithin(root, canonical));
  } catch {
    return false;
  }
}

function validatedPackageLinks(
  snapshot: Snapshot,
  configPath: string,
  providers: readonly ValidatedConfigRoot[],
): string[] {
  const root = resolve(snapshot.directory);
  const directories: string[] = [];
  let directory = dirname(resolve(root, configPath));
  while (isWithin(root, directory)) {
    directories.push(directory);
    if (directory === root) break;
    directory = dirname(directory);
  }
  const links = new Set<string>();
  for (const provider of providers) {
    const name = packageName(provider.specifier);
    if (!name) continue;
    for (const base of directories)
      links.add(resolve(base, 'node_modules', name));
  }
  return [...links];
}

function providerLinkDirectoriesFor(
  snapshot: Snapshot,
  links: readonly string[],
): Set<string> {
  const root = resolve(snapshot.directory);
  const directories = new Set<string>();
  for (const link of links) {
    let directory = dirname(link);
    while (isWithin(root, directory)) {
      directories.add(directory);
      if (directory === root) break;
      directory = dirname(directory);
    }
  }
  return directories;
}

function isPathWithin(root: string, path: string): boolean {
  return root === '.' || path.startsWith(`${root}/`);
}

function withinDepth(
  root: string,
  path: string,
  depth: number | undefined,
): boolean {
  if (depth === undefined) return true;
  const relativePath = relative(root, path);
  return relativePath.split(sep).length <= depth + 1;
}

function safePackageFiles(root: string, depth: number | undefined): string[] {
  const files: string[] = [];
  const visit = (directory: string, level: number): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isFile()) files.push(path);
      else if (entry.isDirectory() && (depth === undefined || level < depth))
        visit(path, level + 1);
    }
  };
  visit(resolve(root), 0);
  return files;
}

/** Finds package-based extends clauses without resolving or executing a config. */
export function externalConfigExtends(
  snapshot: Snapshot,
  configPath: string,
): ExternalConfigExtend[] {
  const tracked = new Set(snapshot.paths);
  const visited = new Set<string>();
  const references: ExternalConfigExtend[] = [];
  const visit = (path: string): void => {
    if (visited.has(path)) return;
    visited.add(path);
    const parsed = ts.parseConfigFileTextToJson(
      path,
      ts.sys.readFile(resolve(snapshot.directory, path)) ?? '',
    );
    if (parsed.error)
      throw new Error(
        `${path}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, ' ')}`,
      );
    if (!isRecord(parsed.config)) return;
    const extendsValue = parsed.config.extends;
    const extendsList = Array.isArray(extendsValue)
      ? extendsValue
      : [extendsValue];
    for (const item of extendsList) {
      if (typeof item !== 'string') continue;
      if (item.startsWith('.') || item.startsWith('/')) {
        const local = trackedLocalConfig(snapshot, path, item, tracked);
        if (local) visit(local);
        continue;
      }
      if (packageName(item))
        references.push({ configPath: path, specifier: item });
    }
  };
  if (tracked.has(configPath)) visit(configPath);
  return references;
}

function trackedLocalConfig(
  snapshot: Snapshot,
  configPath: string,
  specifier: string,
  tracked: ReadonlySet<string>,
): string | undefined {
  const base = resolve(
    dirname(resolve(snapshot.directory, configPath)),
    specifier,
  );
  const candidates = /\.json$/i.test(base)
    ? [base]
    : [base, `${base}.json`, resolve(base, 'tsconfig.json')];
  return candidates
    .map((candidate) => repositoryPath(snapshot, candidate))
    .find(
      (candidate): candidate is string => !!candidate && tracked.has(candidate),
    );
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
