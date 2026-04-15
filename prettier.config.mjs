/** @type {import('prettier').Config} */
const prettierConfig = {
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],
}

export default prettierConfig
