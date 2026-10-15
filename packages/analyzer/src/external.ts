import { isDeepStrictEqual } from 'node:util';
import { builtinModules } from 'node:module';
import { readFileSync as fsReadFileSync } from 'node:fs';
import { access, mkdir, readFile, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Snapshot } from '@difftrail/git';

interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly optionalDependencies?: unknown;
  readonly peerDependencies?: unknown;
}

interface ExternalPackageEvidence {
  readonly name: string;
  readonly packageRoot: string;
  readonly manifest: string;
  readonly lockfile: string;
}

interface NpmLockState {
  readonly committedPackages: Record<string, unknown>;
  readonly installedPackages: Record<string, unknown>;
  readonly lockfile: string;
}

interface PnpmLockState {
  readonly importers: Record<string, unknown>;
  readonly installedRoot: string;
  readonly lockfile: string;
}

export interface ExternalEvidence {
  readonly byImporterAndSpecifier: ReadonlyMap<string, ExternalPackageEvidence>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function packageName(specifier: string): string | undefined {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#')
  )
    return undefined;
  if (specifier.startsWith('node:')) return undefined;
  const name = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] ?? '');
  return builtinModules.includes(name) ||
    builtinModules.includes(`node:${name}`)
    ? undefined
    : name;
}

function packagePath(name: string): string {
  return join('node_modules', ...name.split('/'));
}

function readJson(snapshot: Snapshot, path: string): unknown {
  if (!snapshot.paths.includes(path))
    throw new Error(`required committed file ${path} is missing`);
  return JSON.parse(
    fsReadFileSync(resolve(snapshot.directory, path), 'utf8'),
  ) as unknown;
}

interface DependencyDeclaration {
  readonly section:
    | 'dependencies'
    | 'devDependencies'
    | 'optionalDependencies'
    | 'peerDependencies';
  readonly specifier: string;
}

function dependencyDeclaration(
  manifest: PackageManifest,
  name: string,
): DependencyDeclaration | undefined {
  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ] as const) {
    const field = manifest[section];
    if (isRecord(field) && typeof field[name] === 'string')
      return { section, specifier: field[name] };
  }
  return undefined;
}

function importerManifest(snapshot: Snapshot, importer: string): string {
  const parts = importer.split('/');
  while (parts.length) {
    const candidate = [...parts, 'package.json'].join('/');
    if (snapshot.paths.includes(candidate)) return candidate;
    parts.pop();
  }
  if (snapshot.paths.includes('package.json')) return 'package.json';
  throw new Error(`source ${importer} has no committed package manifest`);
}

function lockImporter(manifest: string): string {
  const directory = dirname(manifest).split('\\').join('/');
  return directory;
}

async function ensureSnapshotLink(
  snapshot: Snapshot,
  name: string,
  installedRoot: string,
): Promise<void> {
  const destination = join(snapshot.directory, packagePath(name));
  try {
    await access(destination);
  } catch {
    await mkdir(dirname(destination), { recursive: true });
    await symlink(
      installedRoot,
      destination,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
}

function readInstalledJson(path: string): Promise<unknown> {
  return readFile(path, 'utf8')
    .then((contents) => JSON.parse(contents) as unknown)
    .catch((error: unknown) => {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(
        `required installed dependency evidence ${path} is unavailable: ${cause}`,
      );
    });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} is malformed`);
  return value;
}

async function prepareNpmEvidence(
  snapshot: Snapshot,
  requests: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
): Promise<Map<string, ExternalPackageEvidence>> {
  const lockfile = 'package-lock.json';
  if (!snapshot.paths.includes(lockfile))
    throw new Error('package-lock.json is missing from the committed snapshot');
  const committed = requireRecord(readJson(snapshot, lockfile), lockfile);
  const state = await loadNpmLockState(snapshot, committed, lockfile);
  const evidence = new Map<string, ExternalPackageEvidence>();
  for (const [manifestPath, packages] of requests)
    await addNpmImporterEvidence(
      snapshot,
      state,
      manifestPath,
      packages,
      evidence,
    );
  return evidence;
}

async function loadNpmLockState(
  snapshot: Snapshot,
  committed: Record<string, unknown>,
  lockfile: string,
): Promise<NpmLockState> {
  const lockVersion = committed.lockfileVersion;
  if (lockVersion !== 2 && lockVersion !== 3)
    throw new Error(
      `unsupported npm package-lock version ${String(lockVersion)}`,
    );
  const committedPackages = requireRecord(
    committed.packages,
    `${lockfile} packages`,
  );
  const installedLockPath = join(
    snapshot.repositoryRoot,
    'node_modules',
    '.package-lock.json',
  );
  const installed = requireRecord(
    await readInstalledJson(installedLockPath),
    'node_modules/.package-lock.json',
  );
  if (installed.lockfileVersion !== lockVersion)
    throw new Error(
      'installed npm lockfile version differs from the committed snapshot',
    );
  return {
    committedPackages,
    installedPackages: requireRecord(
      installed.packages,
      'node_modules/.package-lock.json packages',
    ),
    lockfile,
  };
}

async function addNpmImporterEvidence(
  snapshot: Snapshot,
  state: NpmLockState,
  manifestPath: string,
  names: ReadonlyMap<string, ReadonlySet<string>>,
  evidence: Map<string, ExternalPackageEvidence>,
): Promise<void> {
  const manifest = requireRecord(
    readJson(snapshot, manifestPath),
    manifestPath,
  ) as PackageManifest;
  const importerKey =
    manifestPath === 'package.json' ? '' : lockImporter(manifestPath);
  const entry = requireRecord(
    state.committedPackages[importerKey],
    `${state.lockfile} importer ${importerKey}`,
  );
  for (const [name, sources] of names) {
    const declaration = dependencyDeclaration(manifest, name);
    if (!declaration)
      throw new Error(
        `${manifestPath} does not declare external dependency ${name}`,
      );
    const section = requireRecord(
      entry[declaration.section],
      `${state.lockfile} ${declaration.section} for ${importerKey}`,
    );
    const result = await validateNpmPackage(
      snapshot,
      state,
      manifestPath,
      manifest,
      section,
      name,
    );
    addEvidenceSources(evidence, result, name, sources);
  }
}

async function validateNpmPackage(
  snapshot: Snapshot,
  state: NpmLockState,
  manifestPath: string,
  manifest: PackageManifest,
  dependencies: Record<string, unknown>,
  name: string,
): Promise<ExternalPackageEvidence> {
  checkDeclaration(
    manifestPath,
    manifest,
    name,
    dependencies[name],
    state.lockfile,
  );
  const recordPath = packagePath(name).split('\\').join('/');
  const committed = requireRecord(
    state.committedPackages[recordPath],
    `${state.lockfile} package ${recordPath}`,
  );
  const installed = requireRecord(
    state.installedPackages[recordPath],
    `installed package ${recordPath}`,
  );
  if (!isDeepStrictEqual(committed, installed))
    throw new Error(
      `installed npm package metadata for ${name} differs from ${state.lockfile}`,
    );
  const packageRoot = join(snapshot.repositoryRoot, recordPath);
  await validateInstalledIdentity(
    packageRoot,
    name,
    committed.version,
    state.lockfile,
  );
  await ensureSnapshotLink(snapshot, name, packageRoot);
  return {
    name,
    packageRoot,
    manifest: manifestPath,
    lockfile: state.lockfile,
  };
}

async function preparePnpmEvidence(
  snapshot: Snapshot,
  requests: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
): Promise<Map<string, ExternalPackageEvidence>> {
  const lockfile = 'pnpm-lock.yaml';
  if (!snapshot.paths.includes(lockfile))
    throw new Error('pnpm-lock.yaml is missing from the committed snapshot');
  const committed = parseYaml(
    fsReadFileSync(resolve(snapshot.directory, lockfile), 'utf8'),
  ) as unknown;
  const installedModules = requireRecord(
    parseYaml(
      await readFile(
        join(snapshot.repositoryRoot, 'node_modules', '.modules.yaml'),
        'utf8',
      ),
    ) as unknown,
    'node_modules/.modules.yaml',
  );
  const virtualStore =
    typeof installedModules.virtualStoreDir === 'string'
      ? installedModules.virtualStoreDir
      : '.pnpm';
  const installedLockPath = join(
    snapshot.repositoryRoot,
    'node_modules',
    virtualStore,
    'lock.yaml',
  );
  const installed = parseYaml(
    await readFile(installedLockPath, 'utf8'),
  ) as unknown;
  if (!isDeepStrictEqual(committed, installed))
    throw new Error(
      `installed pnpm lock metadata differs from committed ${lockfile}`,
    );
  const committedRecord = requireRecord(committed, lockfile);
  const importers = requireRecord(
    committedRecord.importers,
    `${lockfile} importers`,
  );
  const state: PnpmLockState = {
    importers,
    installedRoot: snapshot.repositoryRoot,
    lockfile,
  };
  const evidence = new Map<string, ExternalPackageEvidence>();
  for (const [manifestPath, names] of requests)
    await addPnpmImporterEvidence(
      snapshot,
      state,
      manifestPath,
      names,
      evidence,
    );
  return evidence;
}

async function addPnpmImporterEvidence(
  snapshot: Snapshot,
  state: PnpmLockState,
  manifestPath: string,
  names: ReadonlyMap<string, ReadonlySet<string>>,
  evidence: Map<string, ExternalPackageEvidence>,
): Promise<void> {
  const manifest = requireRecord(
    readJson(snapshot, manifestPath),
    manifestPath,
  ) as PackageManifest;
  const entry = requireRecord(
    state.importers[lockImporter(manifestPath)],
    `${state.lockfile} importer`,
  );
  const sections = [
    entry.dependencies,
    entry.devDependencies,
    entry.optionalDependencies,
  ];
  for (const [name, sources] of names) {
    const locked = findPnpmDependency(sections, name, state.lockfile);
    checkDeclaration(
      manifestPath,
      manifest,
      name,
      locked.specifier,
      state.lockfile,
    );
    const version = packageVersion(locked.version, name, state.lockfile);
    const packageRoot = join(state.installedRoot, packagePath(name));
    await validateInstalledIdentity(packageRoot, name, version, state.lockfile);
    await ensureSnapshotLink(snapshot, name, packageRoot);
    const result = {
      name,
      packageRoot,
      manifest: manifestPath,
      lockfile: state.lockfile,
    };
    addEvidenceSources(evidence, result, name, sources);
  }
}

function findPnpmDependency(
  sections: readonly unknown[],
  name: string,
  lockfile: string,
): Record<string, unknown> {
  for (const section of sections)
    if (isRecord(section) && section[name] !== undefined)
      return requireRecord(
        section[name],
        `${lockfile} declaration for ${name}`,
      );
  throw new Error(`${lockfile} has no declaration for ${name}`);
}

function packageVersion(
  value: unknown,
  name: string,
  lockfile: string,
): string {
  if (typeof value !== 'string')
    throw new Error(`${lockfile} has no supported version for ${name}`);
  return value.split('(')[0] ?? '';
}

function checkDeclaration(
  manifestPath: string,
  manifest: PackageManifest,
  name: string,
  lockedSpecifier: unknown,
  lockfile: string,
): void {
  const declared = dependencyDeclaration(manifest, name);
  if (!declared)
    throw new Error(
      `${manifestPath} does not declare external dependency ${name}`,
    );
  if (lockedSpecifier !== declared.specifier)
    throw new Error(
      `${lockfile} declaration for ${name} does not match ${manifestPath}`,
    );
}

async function validateInstalledIdentity(
  packageRoot: string,
  name: string,
  version: unknown,
  lockfile: string,
): Promise<void> {
  const manifest = requireRecord(
    await readInstalledJson(join(packageRoot, 'package.json')),
    `${name}/package.json`,
  );
  if (manifest.name !== name || manifest.version !== version)
    throw new Error(
      `installed package identity for ${name} does not match ${lockfile}`,
    );
}

function addEvidenceSources(
  evidence: Map<string, ExternalPackageEvidence>,
  result: ExternalPackageEvidence,
  name: string,
  sources: ReadonlySet<string>,
): void {
  for (const source of sources) evidence.set(`${source}\0${name}`, result);
}

/** Proves ordinary installed package targets against endpoint manifests and lock metadata. */
export async function prepareExternalEvidence(
  snapshot: Snapshot,
  sources: readonly string[],
  specifiersBySource: ReadonlyMap<string, readonly string[]>,
): Promise<ExternalEvidence> {
  const requests = new Map<string, Map<string, Set<string>>>();
  for (const source of sources) {
    for (const specifier of specifiersBySource.get(source) ?? []) {
      const name = packageName(specifier);
      if (!name) continue;
      const manifest = importerManifest(snapshot, source);
      const byName = requests.get(manifest) ?? new Map<string, Set<string>>();
      const bucket = byName.get(name) ?? new Set<string>();
      bucket.add(source);
      byName.set(name, bucket);
      requests.set(manifest, byName);
    }
  }
  if (!requests.size) return { byImporterAndSpecifier: new Map() };
  const tracked = new Set(snapshot.paths);
  let evidence: Map<string, ExternalPackageEvidence>;
  if (tracked.has('package-lock.json'))
    evidence = await prepareNpmEvidence(snapshot, requests);
  else if (tracked.has('pnpm-lock.yaml'))
    evidence = await preparePnpmEvidence(snapshot, requests);
  else
    throw new Error(
      'external dependency requires committed npm package-lock.json or pnpm-lock.yaml evidence',
    );
  return { byImporterAndSpecifier: evidence };
}

export function externalEvidenceFor(
  evidence: ExternalEvidence,
  importer: string,
  specifier: string,
): ExternalPackageEvidence | undefined {
  const name = packageName(specifier);
  return name
    ? evidence.byImporterAndSpecifier.get(`${importer}\0${name}`)
    : undefined;
}
