import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export type DependencyEdge = {
  source: string;
  target: string;
  kind: 'runtime' | 'type';
  syntax: 'import' | 'export';
  symbols: string[];
};

type Ownership = { owner: string; category: 'module' | 'support' | 'example' };
type Analysis = { errors: string[]; warnings: string[]; edges: DependencyEdge[]; files: string[]; runtimeSccs: string[][]; moduleRuntimeSccs: string[][]; moduleAllImportSccs: string[][] };

const explicitOwnership = new Map<string, Ownership>();
function assign(owner: string, category: Ownership['category'], paths: string[]): void {
  for (const path of paths) explicitOwnership.set(path, { owner, category });
}
assign('M01', 'module', ['src/config/configuration.ts']);
assign('M02', 'module', ['src/app/create-app.ts', 'src/app/lifecycle.ts', 'src/main.ts']);
assign('M03', 'module', ['src/infrastructure/socket/pserver-connector.ts', 'src/infrastructure/socket/pserver-transport.ts']);
assign('M04', 'module', ['src/modules/pserver/contracts.ts', 'src/modules/pserver/pserver-protocol.ts']);
assign('M05', 'module', [
  'src/infrastructure/socket/peer-gateway.ts', 'src/infrastructure/socket/resource-selection-snapshot.ts',
  'src/infrastructure/socket/socket-gateway.ts', 'src/infrastructure/socket/socket-outbound-adapter.ts',
  'src/infrastructure/socket/socket-peer-gateway.ts', 'src/infrastructure/socket/socket-peer-message-delivery.ts',
  'src/infrastructure/socket/socket-server.ts', 'src/infrastructure/socket/task-history-snapshot.ts'
]);
assign('M06', 'module', ['src/modules/peer-messaging/peer-directory.ts']);
assign('M07', 'module', [
  'src/infrastructure/http/aa-catalog-router.ts', 'src/infrastructure/http/http-api-router.ts',
  'src/infrastructure/http/http-middleware.ts', 'src/infrastructure/http/http-outbound-adapter.ts',
  'src/infrastructure/http/http-server.ts'
]);
assign('M08', 'module', [
  'src/infrastructure/integration-clients/http-message-client.ts', 'src/infrastructure/integration-clients/index.ts',
  'src/infrastructure/integration-clients/socket-message-client.ts'
]);
assign('M09', 'module', ['src/modules/messaging/message-router.ts', 'src/modules/messaging/messaging.ts', 'src/modules/messaging/route-registry.ts']);
assign('M10', 'module', [
  'src/modules/peer-messaging/contracts.ts', 'src/modules/peer-messaging/peer-destination-policy.ts',
  'src/modules/peer-messaging/peer-message-service.ts', 'src/modules/peer-messaging/resource-selection-store.ts',
  'src/modules/peer-messaging/task-file-store.ts'
]);
assign('M11', 'module', ['src/modules/peer-messaging/transformation-registry.ts']);
assign('M12', 'module', ['src/modules/task-workflow/task-file-store.ts', 'src/modules/task-workflow/task-workflow.ts']);
assign('M13', 'module', ['src/modules/resource-selection/resource-selection-store.ts', 'src/modules/resource-selection/resource-selection-workflow.ts']);
assign('M14', 'module', ['src/modules/session/contracts.ts', 'src/modules/session/session.ts']);
assign('M15', 'module', ['src/modules/process-usage/contracts.ts', 'src/modules/process-usage/process-usage.ts']);
assign('M16', 'module', ['src/modules/aa-catalog/contracts.ts', 'src/modules/aa-catalog/sqlite-catalog.ts']);
assign('M17', 'module', ['src/infrastructure/database/persistence.ts', 'src/infrastructure/database/sqlite.ts']);
assign('M18', 'module', ['src/observability/diagnostics.ts']);
assign('Support', 'support', [
  'src/shared/contracts/message.ts', 'src/shared/transport/connectable-client.ts',
  'src/shared/transport/connectable-message-client.ts', 'src/shared/transport/message-bus.ts', 'src/tools/utils.ts'
]);
assign('Example', 'example', ['src/examples/pserver-to-aaui.ts']);

const infrastructureRoots = ['src/infrastructure/'];
const neutralContracts = new Set([
  'src/shared/contracts/message.ts',
  'src/shared/transport/connectable-message-client.ts'
]);
const compatibilitySource = 'src/shared/transport/connectable-client.ts';
const compatibilityTarget = 'src/infrastructure/integration-clients/index.ts';
const compatibilitySymbols = ['HttpMessageClient', 'SocketMessageClient'];

function normalize(path: string): string { return path.split(sep).join('/'); }

export function sourceOwnership(path: string): Ownership | undefined {
  return explicitOwnership.get(normalize(path));
}

function edgeFromNode(source: string, target: string, node: ts.ImportDeclaration | ts.ExportDeclaration): DependencyEdge {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    const bindings = clause?.namedBindings;
    const named = bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
    const hasEmptyImportClause = Boolean(clause && !clause.name && bindings && ts.isNamedImports(bindings) && named.length === 0);
    const symbols = [
      ...(clause?.name ? [clause.name.text] : []),
      ...(bindings && ts.isNamespaceImport(bindings) ? ['*'] : []),
      ...named.filter(element => !element.isTypeOnly && !clause?.isTypeOnly).map(element => (element.propertyName ?? element.name).text)
    ];
    return { source, target, kind: !clause || (!clause.isTypeOnly && (symbols.length > 0 || hasEmptyImportClause)) ? 'runtime' : 'type', syntax: 'import', symbols };
  }
  const clause = node.exportClause;
  const symbols = clause && ts.isNamedExports(clause)
    ? [...new Set(clause.elements.filter(element => !element.isTypeOnly && !node.isTypeOnly).flatMap(element => [(element.propertyName ?? element.name).text, element.name.text]))]
    : clause ? [] : ['*'];
  const allNamedExportsAreTypes = Boolean(clause && ts.isNamedExports(clause) && clause.elements.length > 0 && symbols.length === 0);
  return { source, target, kind: node.isTypeOnly || allNamedExportsAreTypes ? 'type' : 'runtime', syntax: 'export', symbols };
}

function stronglyConnectedComponents(files: string[], edges: DependencyEdge[]): string[][] {
  const adjacency = new Map(files.map(file => [file, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (file: string): void => {
    indices.set(file, nextIndex); lowLinks.set(file, nextIndex++); stack.push(file); onStack.add(file);
    for (const target of adjacency.get(file) ?? []) {
      if (!indices.has(target)) { visit(target); lowLinks.set(file, Math.min(lowLinks.get(file)!, lowLinks.get(target)!)); }
      else if (onStack.has(target)) lowLinks.set(file, Math.min(lowLinks.get(file)!, indices.get(target)!));
    }
    if (lowLinks.get(file) === indices.get(file)) {
      const component: string[] = [];
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); component.push(member); } while (member !== file);
      if (component.length > 1 || (adjacency.get(file) ?? []).includes(file)) components.push(component.sort());
    }
  };
  for (const file of files) if (!indices.has(file)) visit(file);
  return components.sort((a, b) => a.join('|').localeCompare(b.join('|')));
}

function ownerFor(ownership: Map<string, Ownership>, file: string): Ownership | undefined { return ownership.get(file); }

function checkRules(edges: DependencyEdge[], ownership: Map<string, Ownership>, errors: string[]): void {
  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    const targetIsInfrastructure = infrastructureRoots.some(root => target.startsWith(root));
    const owner = ownerFor(ownership, source);
    if ((source === 'src/config/configuration.ts' || source.startsWith('src/modules/pserver/')) && targetIsInfrastructure) {
      errors.push(`${source} -> ${target}: rule prohibits ${owner?.owner} imports of any kind into infrastructure`);
    }
    if (neutralContracts.has(source) && targetIsInfrastructure && owner?.owner !== 'M08') {
      errors.push(`${source} -> ${target}: neutral shared contract files cannot import infrastructure`);
    }
    if (owner?.owner === 'M08' && neutralContracts.has(target) && edge.kind !== 'type') {
      errors.push(`${source} -> ${target}: M08 may use neutral shared client contracts only through type-only edges`);
    }
    if (source.startsWith('src/shared/') && targetIsInfrastructure) {
      const exactException = source === compatibilitySource && target === compatibilityTarget && edge.kind === 'runtime' && edge.syntax === 'export' && [...edge.symbols].sort().join('|') === [...compatibilitySymbols].sort().join('|');
      if (!exactException) errors.push(`${source} -> ${target}: shared-to-infrastructure edge is not the approved R5-D08 runtime re-export of ${compatibilitySymbols.join(', ')}`);
    }
  }
}

export function analyzeDependencies(rootDir: string, inputFiles: string[]): Analysis {
  const root = realpathSync(rootDir);
  const files = inputFiles.map(file => normalize(file.replace(/^\.\//, ''))).sort();
  const fileSet = new Set(files);
  const errors: string[] = [];
  const warnings: string[] = [];
  const ownership = new Map<string, Ownership>();
  for (const file of files) {
    const owner = sourceOwnership(file);
    if (!owner) errors.push(`${file}: source ownership is unmapped; add it to the explicit ownership map`);
    else ownership.set(file, owner);
  }

  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error(`Could not find tsconfig.json under ${root}`);
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath));
  const compilerOptions = { ...parsed.options, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
  const edges: DependencyEdge[] = [];
  for (const file of files) {
    const absolute = resolve(root, file);
    const sourceText = readFileSync(absolute, 'utf8');
    const sourceFile = ts.createSourceFile(absolute, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith('.')) {
          const resolved = ts.resolveModuleName(specifier, absolute, compilerOptions, ts.sys).resolvedModule;
          if (!resolved) errors.push(`${file}: unresolved relative specifier '${specifier}'`);
          else {
            const target = normalize(relative(root, resolved.resolvedFileName));
            if (!target.startsWith('src/')) errors.push(`${file} -> ${target}: resolved local edge escapes tracked src graph`);
            else if (!fileSet.has(target)) errors.push(`${file} -> ${target}: resolved local source is not in the tracked src graph`);
            else edges.push(edgeFromNode(file, target, node));
          }
        }
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        errors.push(`${file}: dynamic import()/require() is unsupported by the static graph checker; replace with static imports or extend the checker`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  checkRules(edges, ownership, errors);
  const runtimeEdges = edges.filter(edge => edge.kind === 'runtime');
  const runtimeSccs = stronglyConnectedComponents(files, runtimeEdges);
  for (const component of runtimeSccs) errors.push(`runtime file cycle: ${component.join(' -> ')}`);
  const ownerEdges = runtimeEdges.flatMap(edge => {
    const from = ownership.get(edge.source);
    const to = ownership.get(edge.target);
    return from?.category === 'module' && to?.category === 'module' && from.owner !== to.owner ? [{ ...edge, from: from.owner, to: to.owner }] : [];
  });
  const moduleNames = [...new Set(ownerEdges.flatMap(edge => [edge.from, edge.to]))].sort();
  const moduleSccs = stronglyConnectedComponents(moduleNames, ownerEdges.map(edge => ({ ...edge, source: edge.from, target: edge.to })));
  const ownerAllImportEdges = edges.flatMap(edge => {
    const from = ownership.get(edge.source);
    const to = ownership.get(edge.target);
    return from?.category === 'module' && to?.category === 'module' && from.owner !== to.owner ? [{ ...edge, from: from.owner, to: to.owner }] : [];
  });
  const allModuleNames = [...new Set(ownerAllImportEdges.flatMap(edge => [edge.from, edge.to]))].sort();
  const moduleAllImportSccs = stronglyConnectedComponents(allModuleNames, ownerAllImportEdges.map(edge => ({ ...edge, source: edge.from, target: edge.to })));
  if (moduleAllImportSccs.some(component => component.includes('M10') && component.includes('M11')) && !moduleSccs.some(component => component.includes('M10') && component.includes('M11')))
    warnings.push('M10↔M11 is an all-import module SCC caused by M11 type-only imports of M10 contracts; it is not a runtime SCC');
  return { errors, warnings, edges, files, runtimeSccs, moduleRuntimeSccs: moduleSccs, moduleAllImportSccs };
}

function trackedSourceFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--', 'src/**/*.ts'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
}

function main(): void {
  const root = realpathSync(resolve(process.cwd()));
  const result = analyzeDependencies(root, trackedSourceFiles(root));
  const runtimeEdges = result.edges.filter(edge => edge.kind === 'runtime').length;
  const typeEdges = result.edges.length - runtimeEdges;
  console.log(`Architecture graph: ${result.files.length} files, ${result.edges.length} resolved import/export edges (${runtimeEdges} runtime, ${typeEdges} type-only)`);
  console.log(`Runtime file SCCs: ${result.runtimeSccs.length}; module runtime SCCs: ${result.moduleRuntimeSccs.length}${result.moduleRuntimeSccs.length ? ` (${result.moduleRuntimeSccs.map(component => component.join('↔')).join('; ')})` : ''}`);
  console.log(`Module all-import SCCs: ${result.moduleAllImportSccs.length}${result.moduleAllImportSccs.length ? ` (${result.moduleAllImportSccs.map(component => component.join('↔')).join('; ')})` : ''}`);
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  if (result.errors.length) process.exitCode = 1;
  else console.log('Architecture dependency rules passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
