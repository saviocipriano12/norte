import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

if (existsSync('.env')) {
  const lines = readFileSync('.env', 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...parts] = trimmed.split('=')
    if (!process.env[key]) process.env[key] = parts.join('=')
  }
}

const requiredEnv = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

const missing = requiredEnv.filter((key) => !process.env[key])

if (missing.length) {
  console.error(`Missing production env vars: ${missing.join(', ')}`)
  process.exitCode = 1
}

run('npm', ['run', 'functions:sync-domain'])
run('npm', ['run', 'lint'])
run('npm', ['test'])
run('npm', ['run', 'build'])

if (!process.exitCode) {
  console.log('Production verification passed.')
}

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  } catch (error) {
    process.exitCode = error.status || 1
  }
}
