import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsDirectory = path.join(root, 'dist', 'assets')
const limits = {
  javascript: 450 * 1024,
  image: 400 * 1024,
}

if (!fs.existsSync(assetsDirectory)) {
  throw new Error('Build output not found. Run npm run build before checking the bundle budget.')
}

const failures = fs.readdirSync(assetsDirectory).flatMap((file) => {
  const size = fs.statSync(path.join(assetsDirectory, file)).size
  const limit = file.endsWith('.js') ? limits.javascript : /\.(?:avif|jpe?g|png|webp)$/i.test(file) ? limits.image : null
  return limit !== null && size > limit
    ? [`${file}: ${(size / 1024).toFixed(1)} KiB exceeds ${(limit / 1024).toFixed(0)} KiB`]
    : []
})

if (failures.length > 0) {
  throw new Error(`Bundle budget exceeded:\n${failures.join('\n')}`)
}

console.log('Bundle budget passed.')
