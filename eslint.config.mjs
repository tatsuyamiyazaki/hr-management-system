import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  // Next.js 生成ファイルを除外
  {
    ignores: ['next-env.d.ts', '.next/**', 'node_modules/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // TypeScript: `any` 型を禁止（steering/tech.md 準拠）
      '@typescript-eslint/no-explicit-any': 'error',

      // コード品質
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // React
      'react/no-unescaped-entities': 'off',
    },
  },
]

export default eslintConfig
