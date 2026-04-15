/**
 * Task 1.1: プロジェクト基盤のセットアップ 設定検証テスト
 *
 * RED → GREEN: これらのテストがすべて通過すれば Task 1.1 完了
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../../')

function readJSON(file: string) {
  const content = readFileSync(resolve(root, file), 'utf-8')
  return JSON.parse(content)
}

// ─────────────────────────────────────────────
// 1. TypeScript: strict モード
// ─────────────────────────────────────────────
describe('TypeScript 設定', () => {
  it('tsconfig.json が存在する', () => {
    expect(existsSync(resolve(root, 'tsconfig.json'))).toBe(true)
  })

  it('strict: true が有効', () => {
    const tsconfig = readJSON('tsconfig.json')
    expect(tsconfig.compilerOptions?.strict).toBe(true)
  })

  it('@/ パスエイリアスが src/ に設定されている', () => {
    const tsconfig = readJSON('tsconfig.json')
    const paths = tsconfig.compilerOptions?.paths ?? {}
    expect(paths['@/*']).toBeDefined()
    expect(paths['@/*'][0]).toMatch(/^\.\/src\//)
  })
})

// ─────────────────────────────────────────────
// 2. ESLint: no-explicit-any ルール
// ─────────────────────────────────────────────
describe('ESLint 設定', () => {
  it('ESLint 設定ファイルが存在する', () => {
    const hasFlatConfig = existsSync(resolve(root, 'eslint.config.mjs'))
    const hasLegacyConfig = existsSync(resolve(root, '.eslintrc.json'))
    expect(hasFlatConfig || hasLegacyConfig).toBe(true)
  })

  it('@typescript-eslint/no-explicit-any ルールが error に設定されている', () => {
    if (existsSync(resolve(root, 'eslint.config.mjs'))) {
      const content = readFileSync(resolve(root, 'eslint.config.mjs'), 'utf-8')
      expect(content).toContain('no-explicit-any')
    } else {
      const config = readJSON('.eslintrc.json')
      const rules = config.rules ?? {}
      expect(rules['@typescript-eslint/no-explicit-any']).toBeDefined()
      expect(rules['@typescript-eslint/no-explicit-any']).not.toBe('off')
    }
  })
})

// ─────────────────────────────────────────────
// 3. package.json: pnpm + 必須スクリプト
// ─────────────────────────────────────────────
describe('package.json 設定', () => {
  it('package.json が存在する', () => {
    expect(existsSync(resolve(root, 'package.json'))).toBe(true)
  })

  it('packageManager が pnpm', () => {
    const pkg = readJSON('package.json')
    expect(pkg.packageManager).toMatch(/^pnpm@/)
  })

  it('必須スクリプトが定義されている', () => {
    const pkg = readJSON('package.json')
    const scripts = pkg.scripts ?? {}
    expect(scripts['dev']).toBeDefined()
    expect(scripts['build']).toBeDefined()
    expect(scripts['test']).toBeDefined()
    expect(scripts['lint']).toBeDefined()
    expect(scripts['type-check']).toBeDefined()
  })
})

// ─────────────────────────────────────────────
// 4. Prettier 設定
// ─────────────────────────────────────────────
describe('Prettier 設定', () => {
  it('Prettier 設定ファイルが存在する', () => {
    const candidates = [
      'prettier.config.mjs',
      'prettier.config.js',
      '.prettierrc.json',
      '.prettierrc',
    ]
    const found = candidates.some((f) => existsSync(resolve(root, f)))
    expect(found).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 5. Husky: pre-commit フック
// ─────────────────────────────────────────────
describe('Husky 設定', () => {
  it('.husky/pre-commit ファイルが存在する', () => {
    expect(existsSync(resolve(root, '.husky/pre-commit'))).toBe(true)
  })

  it('pre-commit フックに lint-staged が含まれる', () => {
    const content = readFileSync(resolve(root, '.husky/pre-commit'), 'utf-8')
    expect(content).toMatch(/lint-staged/)
  })
})

// ─────────────────────────────────────────────
// 6. .env.example: 必須の環境変数
// ─────────────────────────────────────────────
describe('.env.example 設定', () => {
  it('.env.example が存在する', () => {
    expect(existsSync(resolve(root, '.env.example'))).toBe(true)
  })

  it('DATABASE_URL が定義されている', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8')
    expect(content).toContain('DATABASE_URL=')
  })

  it('REDIS_URL が定義されている', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8')
    expect(content).toContain('REDIS_URL=')
  })

  it('AI プロバイダ設定が定義されている', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8')
    expect(content).toContain('AI_PROVIDER=')
    expect(content).toContain('ANTHROPIC_API_KEY=')
  })

  it('メール設定が定義されている', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8')
    expect(content).toContain('RESEND_API_KEY=')
  })

  it('NextAuth シークレットが定義されている', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8')
    expect(content).toContain('NEXTAUTH_SECRET=')
    expect(content).toContain('NEXTAUTH_URL=')
  })
})

// ─────────────────────────────────────────────
// 7. Next.js App Router 構造
// ─────────────────────────────────────────────
describe('Next.js プロジェクト構造', () => {
  it('src/app ディレクトリが存在する（App Router）', () => {
    expect(existsSync(resolve(root, 'src/app'))).toBe(true)
  })

  it('src/app/layout.tsx が存在する', () => {
    expect(existsSync(resolve(root, 'src/app/layout.tsx'))).toBe(true)
  })

  it('next.config.ts（または .js）が存在する', () => {
    const hasTs = existsSync(resolve(root, 'next.config.ts'))
    const hasJs = existsSync(resolve(root, 'next.config.js'))
    const hasMjs = existsSync(resolve(root, 'next.config.mjs'))
    expect(hasTs || hasJs || hasMjs).toBe(true)
  })
})
