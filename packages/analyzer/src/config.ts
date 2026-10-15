import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
  return local.split(sep).join('/');
}

/** Parses only committed files and records the inherited configuration files used. */
export function parseSnapshotConfig(
  snapshot: Snapshot,
  configPath: string,
  externalPackageRoots: readonly string[] = [],
): SnapshotConfig {
  const tracked = new Set(snapshot.paths);
  const allowedRoots = externalPackageRoots.map((root) => {
    try {
      return realpathSync(root);
    } catch {
      return resolve(root);
    }
  });
  const readFiles = new Set<string>();
  let unrecoverable: ts.Diagnostic | undefined;
  const configFile = resolve(snapshot.directory, configPath);
  const isAllowedExternalFile = (file: string): boolean => {
    let candidate: string;
    try {
      candidate = realpathSync(file);
    } catch {
      return false;
    }
    return allowedRoots.some((root) => isWithin(root, candidate));
  };
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      unrecoverable = diagnostic;
    },
    readFile: (file) => {
      const path = repositoryPath(snapshot, file);
      if ((!path || !tracked.has(path)) && !isAllowedExternalFile(file))
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
        (isAllowedExternalFile(file) && ts.sys.fileExists(file))
      );
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFile,
    { ignoreDeprecations: '6.0' },
    host,
  );
  if (!parsed)
    throw new Error(
      unrecoverable
        ? ts.flattenDiagnosticMessageText(unrecoverable.messageText, ' ')
        : `TypeScript could not read configuration ${configPath}`,
    );
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
