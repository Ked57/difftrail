import { isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import type { Snapshot } from '@difftrail/git';

export interface SnapshotConfig {
  readonly parsed: ts.ParsedCommandLine;
  readonly files: readonly string[];
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
): SnapshotConfig {
  const tracked = new Set(snapshot.paths);
  const readFiles = new Set<string>();
  let unrecoverable: ts.Diagnostic | undefined;
  const configFile = resolve(snapshot.directory, configPath);
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      unrecoverable = diagnostic;
    },
    readFile: (file) => {
      const path = repositoryPath(snapshot, file);
      if (!path || !tracked.has(path)) return undefined;
      const contents = ts.sys.readFile(file);
      if (contents !== undefined) readFiles.add(path);
      return contents;
    },
    fileExists: (file) => {
      const path = repositoryPath(snapshot, file);
      return !!path && tracked.has(path) && ts.sys.fileExists(file);
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
