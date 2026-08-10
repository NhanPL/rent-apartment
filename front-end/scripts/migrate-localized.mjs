import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve('src')
const translatableAttributes = new Set([
  'aria-label', 'alt', 'cancelText', 'content', 'description', 'emptyText', 'label',
  'message', 'okText', 'placeholder', 'text', 'title', 'tooltip',
])
const translatableProperties = new Set([...translatableAttributes, 'name'])

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath]
  })
}

function componentOwner(node) {
  let current = node.parent
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name && /^[A-Z]/.test(current.name.text) && current.body) return current
    current = current.parent
  }
  return null
}

function normalized(value) {
  return value.trim().replace(/\s+/g, ' ')
}

for (const file of filesUnder(root).filter((candidate) => candidate.endsWith('.tsx') && !candidate.includes('.test.') && !candidate.endsWith('Localized.tsx'))) {
  let content = fs.readFileSync(file, 'utf8')
  if (!content.includes('<Localized')) continue

  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  const owners = new Set()
  let localizedImport = null

  const addTranslatedEdit = (node, start, end, value, prefix = '', suffix = '') => {
    const text = normalized(value)
    if (!text) return
    const owner = componentOwner(node)
    if (!owner) return
    owners.add(owner)
    edits.push({ start, end, text: `${prefix}t(${JSON.stringify(text)})${suffix}` })
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.getText(source).includes('Localized')) localizedImport = node
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Localized') {
      edits.push({ start: node.openingElement.getStart(source), end: node.openingElement.getEnd(), text: '<>' })
      edits.push({ start: node.closingElement.getStart(source), end: node.closingElement.getEnd(), text: '</>' })
    }
    if (ts.isJsxText(node)) {
      const raw = node.getText(source)
      const text = normalized(raw)
      if (text) {
        const leading = raw.match(/^\s*/)?.[0] ?? ''
        const trailing = raw.match(/\s*$/)?.[0] ?? ''
        addTranslatedEdit(node, node.getStart(source), node.getEnd(), text, `${leading}{`, `}${trailing}`)
      }
    }
    if (ts.isJsxAttribute(node) && translatableAttributes.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      addTranslatedEdit(node, node.initializer.getStart(source), node.initializer.getEnd(), node.initializer.text, '{', '}')
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(source).replace(/["']/g, '')
      if (translatableProperties.has(name) && ts.isStringLiteralLike(node.initializer)) {
        addTranslatedEdit(node, node.initializer.getStart(source), node.initializer.getEnd(), node.initializer.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  if (localizedImport) edits.push({ start: localizedImport.getFullStart(), end: localizedImport.getEnd(), text: '' })
  for (const owner of owners) {
    const body = owner.body
    const bodyText = content.slice(body.getStart(source), body.getEnd())
    if (!bodyText.includes('useI18n(')) edits.push({ start: body.getStart(source) + 1, end: body.getStart(source) + 1, text: '\n  const { t } = useI18n()' })
  }

  const hasUseI18nImport = /import\s+\{[^}]*useI18n[^}]*\}\s+from/.test(content)
  if (!hasUseI18nImport) {
    const relative = path.relative(path.dirname(file), path.join(root, 'i18n')).replaceAll('\\', '/')
    const specifier = relative.startsWith('.') ? relative : `./${relative}`
    edits.push({ start: 0, end: 0, text: `import { useI18n } from '${specifier}'\n` })
  }

  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    content = content.slice(0, edit.start) + edit.text + content.slice(edit.end)
  }
  fs.writeFileSync(file, content)
}
