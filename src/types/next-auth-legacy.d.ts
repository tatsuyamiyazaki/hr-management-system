import 'next-auth'

declare module 'next-auth' {
  export function getServerSession(): Promise<
    | (Record<string, unknown> & {
        user?: Record<string, unknown>
      })
    | null
  >
}
