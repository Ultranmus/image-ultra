/**
 * Builds the API reference data (`app/reference/api.json`) from the published type declarations
 * (`packages/{core,react}/dist/index.d.ts`) — what users actually get, so it can't drift.
 * Each export: its kind, the TypeScript declaration and its doc comment. Run after the packages
 * build; `predev` / `prebuild` / `typecheck` run it.
 * TypeScript, run directly by Node 24.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export type ApiKind = 'component' | 'hook' | 'function' | 'class' | 'constant' | 'type';

export interface ApiItem {
  name: string;
  kind: ApiKind;
  /** The declaration as TypeScript, doc comments inside it kept. */
  declaration: string;
  /** The item's own doc comment (Markdown). */
  doc: string;
  /** For @image-ultra/react: the item comes from @image-ultra/core (documented there). */
  fromCore?: boolean;
}

export interface ApiPackage {
  name: string;
  items: ApiItem[];
}

const root = join(import.meta.dirname, '..', '..', '..');
const entries = {
  '@image-ultra/react': join(root, 'packages/react/dist/index.d.ts'),
  '@image-ultra/core': join(root, 'packages/core/dist/index.d.ts'),
};

const program = ts.createProgram(Object.values(entries), {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();
const coreDir = join(root, 'packages/core/dist');

function kindOf(name: string, decl: ts.Declaration): ApiKind {
  if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) return 'type';
  if (ts.isClassDeclaration(decl)) return 'class';
  if (/^use[A-Z]/.test(name)) return 'hook';
  if (ts.isFunctionDeclaration(decl)) return /^[A-Z]/.test(name) ? 'component' : 'function';
  if (ts.isVariableDeclaration(decl)) {
    if (/^[A-Z][a-z]/.test(name)) return 'component'; // PascalCase values: components
    const type = checker.getTypeAtLocation(decl);
    return type.getCallSignatures().length > 0 ? 'function' : 'constant';
  }
  return 'constant';
}

/** Source text of a declaration: the whole statement for variables, without its leading doc. */
function declarationText(decl: ts.Declaration): string {
  const node = ts.isVariableDeclaration(decl) ? decl.parent.parent : decl;
  const source = node.getSourceFile();
  const text = source.text.slice(node.getStart(source), node.getEnd());
  return text.replace(/^(export\s+)?declare\s+/, '').replace(/^export\s+/, '');
}

function docOf(symbol: ts.Symbol): string {
  const summary = ts.displayPartsToString(symbol.getDocumentationComment(checker));
  const tags = symbol
    .getJsDocTags(checker)
    .filter((tag) => tag.name === 'deprecated' || tag.name === 'example')
    .map((tag) => `**@${tag.name}** ${ts.displayPartsToString(tag.text ?? [])}`);
  return [summary, ...tags].filter(Boolean).join('\n\n');
}

function collect(name: string, file: string): ApiPackage {
  const source = program.getSourceFile(file);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`No types for ${name} at ${file} — build the packages first.`);
  const items: ApiItem[] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const decls = symbol.getDeclarations() ?? [];
    const first = decls[0];
    if (!first) continue;
    // Overloads and merged declarations (e.g. a type and a value) are shown together.
    const declaration = decls.map(declarationText).join('\n');
    const item: ApiItem = {
      name: exported.name,
      kind: kindOf(exported.name, first),
      declaration,
      doc: docOf(symbol),
    };
    if (name === '@image-ultra/react' && first.getSourceFile().fileName.startsWith(coreDir)) {
      item.fromCore = true;
    }
    items.push(item);
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { name, items };
}

const api: ApiPackage[] = Object.entries(entries).map(([name, file]) => collect(name, file));
const out = join(import.meta.dirname, '..', 'app', 'reference', 'api.json');
writeFileSync(out, `${JSON.stringify(api, null, 1)}\n`);
console.log(`API reference: ${api.map((p) => `${p.name} ${p.items.length}`).join(' · ')} → ${out}`);
