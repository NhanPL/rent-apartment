import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const modulesDirectory = path.resolve(__dirname, '../src/modules');

const routeFiles = (): string[] => fs.readdirSync(modulesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(modulesDirectory, entry.name, `${entry.name}.routes.ts`))
  .filter((filePath) => fs.existsSync(filePath));

const mutationBlocks = (source: string): string[] => {
  const blocks: string[] = [];
  const routePattern = /router\.(?:post|put|patch|delete)\(/g;
  for (const match of source.matchAll(routePattern)) {
    const end = source.indexOf('\n}));', match.index);
    if (end !== -1) blocks.push(source.slice(match.index, end + 5));
  }
  return blocks;
};

describe('route validation coverage', () => {
  it('validates the body of every mutation route with Zod', () => {
    for (const filePath of routeFiles()) {
      const source = fs.readFileSync(filePath, 'utf8');
      for (const block of mutationBlocks(source)) {
        expect(
          /parseBody\(|parseEmptyBody\(|loginSchema\.safeParse\(req\.body\)/.test(block),
          `${path.relative(modulesDirectory, filePath)} has a mutation without body validation:\n${block.split('\n')[0]}`
        ).toBe(true);
      }
    }
  });

  it('validates every query value before it is used', () => {
    for (const filePath of routeFiles()) {
      const source = fs.readFileSync(filePath, 'utf8');
      if (!source.includes('req.query')) continue;
      expect(source, `${path.relative(modulesDirectory, filePath)} reads an unvalidated query`).toContain('parseQuery(');
    }
  });

  it('registers or parses every dynamic route parameter', () => {
    for (const filePath of routeFiles()) {
      const source = fs.readFileSync(filePath, 'utf8');
      const parameterNames = [...source.matchAll(/router\.(?:get|post|put|patch|delete)\('([^']*:[^']*)'/g)]
        .flatMap((match) => [...match[1].matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map((parameter) => parameter[1]));

      for (const parameterName of new Set(parameterNames)) {
        const registered = new RegExp(`registerUuidParams\\(router, \\[[^\\]]*['\"]${parameterName}['\"]`).test(source);
        const parsedAsObject = source.includes('parseParams(');
        expect(
          registered || parsedAsObject,
          `${path.relative(modulesDirectory, filePath)} does not validate route parameter ${parameterName}`
        ).toBe(true);
      }
    }
  });
});
