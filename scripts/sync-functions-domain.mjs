import { copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

await copyFile(join(root, 'src/domain/norteDomain.js'), join(root, 'functions/src/domain.js'))
await copyFile(join(root, 'src/domain/norteDomain.js'), join(root, 'functions/src/norteDomain.js'))
await copyFile(join(root, 'src/domain/entryParser.js'), join(root, 'functions/src/entryParser.js'))
console.log('Synced shared domain rules into functions/src')
