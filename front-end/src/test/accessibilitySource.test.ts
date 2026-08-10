/// <reference types="node" />

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function collectTsxFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) return collectTsxFiles(fullPath)
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [fullPath] : []
  })
}

function hasAttribute(attributes: ts.JsxAttributes, name: string) {
  return attributes.properties.some((attribute) => (
    ts.isJsxAttribute(attribute) && attribute.name.getText() === name
  ))
}

function hasAccessibleChild(element: ts.JsxElement) {
  return element.children.some((child) => {
    if (ts.isJsxText(child)) return Boolean(child.getText().trim())
    if (ts.isJsxExpression(child)) return Boolean(child.expression)
    return ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)
  })
}

function hasLabeledCheckbox(element: ts.JsxElement, source: ts.SourceFile) {
  return element.children.some((child) => (
    ts.isJsxElement(child)
    && child.openingElement.tagName.getText(source) === 'Checkbox'
    && hasAccessibleChild(child)
  ))
}

describe('source accessibility guardrails', () => {
  it('requires an accessible name on icon-only buttons', () => {
    const failures: string[] = []
    const files = collectTsxFiles(path.resolve('src'))

    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )

      const visit = (node: ts.Node) => {
        const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
        if (opening?.tagName.getText(source) === 'Button' && hasAttribute(opening.attributes, 'icon')) {
          const hasName = hasAttribute(opening.attributes, 'aria-label')
            || hasAttribute(opening.attributes, 'title')
            || (ts.isJsxElement(node) && hasAccessibleChild(node))
          if (!hasName) {
            const position = source.getLineAndCharacterOfPosition(node.getStart(source))
            failures.push(`${path.relative(process.cwd(), file)}:${position.line + 1}`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(source)
    }

    expect(failures).toEqual([])
  })

  it('requires labels on named form fields', () => {
    const failures: string[] = []
    const files = collectTsxFiles(path.resolve('src'))

    for (const file of files) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node) => {
        const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
        if (
          opening?.tagName.getText(source) === 'Form.Item'
          && hasAttribute(opening.attributes, 'name')
          && !hasAttribute(opening.attributes, 'label')
          && !hasAttribute(opening.attributes, 'noStyle')
          && !hasAttribute(opening.attributes, 'hidden')
          && !(ts.isJsxElement(node) && hasLabeledCheckbox(node, source))
        ) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source))
          failures.push(`${path.relative(process.cwd(), file)}:${position.line + 1}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }

    expect(failures).toEqual([])
  })
})
