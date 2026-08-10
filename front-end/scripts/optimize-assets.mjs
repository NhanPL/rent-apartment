import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'src', 'assets', 'login-background-luxury.jpg')
const output = path.join(root, 'src', 'assets', 'login-background-luxury.webp')

await sharp(source)
  .rotate()
  .resize({ width: 1920, withoutEnlargement: true })
  .webp({ quality: 80, effort: 6 })
  .toFile(output)
