/**
 * TODO: merge後に #39のcareer-wish-types.tsからimportする
 *
 * Issue #39 が実装する CareerWish モデルの仮型定義。
 * merge後はこのファイルを削除し、#39 のファイルからインポートする。
 */

export interface CareerWish {
  id: string
  userId: string
  desiredRoleId: string
  desiredRoleName: string
  desiredAt: Date
  comment: string | null
  supersededAt: Date | null
  createdAt: Date
}
