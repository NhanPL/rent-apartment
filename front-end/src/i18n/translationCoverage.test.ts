/// <reference types="node" />

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { translationCatalog } from './translations'

const translatableAttributes = new Set([
  'aria-label', 'cancelText', 'content', 'description', 'emptyText', 'label',
  'message', 'okText', 'placeholder', 'text', 'title', 'tooltip',
])
const translatableProperties = new Set([...translatableAttributes, 'name'])

function collectSourceFiles(root: string): string[] {
  const files: string[] = []

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (fullPath.includes(path.join('features', 'buildings'))) continue
      files.push(...collectSourceFiles(fullPath))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

describe('translation catalog coverage', () => {
  it('covers visible static copy in routed frontend features', () => {
    const knownCopy = new Set(
      translationCatalog.flatMap((item) => [item.en, item.vi, ...(item.aliases ?? [])])
        .map((item) => item.trim().replace(/\s+/g, ' ')),
    )
    const sourceRoots = ['layout', 'routes', path.join('features', 'auth'), 'pages', 'shared']
    const sourceFiles = sourceRoots.flatMap((root) => collectSourceFiles(path.resolve('src', root)))
    const missing = new Set<string>()

    const addCandidate = (value: string) => {
      const normalized = value.trim().replace(/\s+/g, ' ')
      if (
        !normalized || knownCopy.has(normalized) || /^[-+/:.,%#()]+$/.test(normalized)
        || /^\d|^[A-Z0-9_-]+$/.test(normalized) || /^(YYYY|https?:|\.\/|\/)/.test(normalized)
      ) return
      missing.add(normalized)
    }

    for (const file of sourceFiles) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )

      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) addCandidate(node.getText(source))
        if (
          ts.isJsxAttribute(node) && translatableAttributes.has(node.name.getText(source))
          && node.initializer && ts.isStringLiteral(node.initializer)
        ) addCandidate(node.initializer.text)
        if (ts.isPropertyAssignment(node)) {
          const propertyName = node.name.getText(source).replace(/["']/g, '')
          if (translatableProperties.has(propertyName) && ts.isStringLiteralLike(node.initializer)) {
            addCandidate(node.initializer.text)
          }
        }
        if (
          ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])
          && /message\.(success|error|warning|info)|getUserErrorMessage|Promise\.reject/.test(node.expression.getText(source))
        ) addCandidate(node.arguments[0].text)
        ts.forEachChild(node, visit)
      }

      visit(source)
    }

    expect([...missing].sort()).toEqual([])
  })
})
