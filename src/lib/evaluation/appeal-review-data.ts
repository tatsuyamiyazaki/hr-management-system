import type { Appeal, AppealPriority, AppealStatus, AppealsKpi } from './appeal-types'

export type AppealAction = 'request-info' | 'reject' | 'correct'

const APPEALS_KPI: AppealsKpi = {
  underReview: 7,
  avgDays: 3.2,
  nearDeadlineCount: 3,
  monthlyCompleted: 24,
  monthlyCorrected: 11,
  monthlyRejected: 13,
  correctionRate: 45.8,
  correctionRateDelta: 6.9,
}

const APPEALS: readonly Appeal[] = [
  {
    id: 'appeal-1',
    appealNumber: '#APL-2024-0042',
    type: 'EVALUATION_RESULT',
    title: 'Q4評価結果の営業達成率計算について',
    content:
      '目標達成率が112%であるにもかかわらず、評価シート上では98%として算出されています。対象期間と売上計上日の確認をお願いします。',
    priority: 'HIGH',
    deadlineDays: 1,
    employeeId: 'employee-00123',
    employeeName: '田中 一郎',
    employeeNumber: 'EMP-00123',
    avatarColor: 'bg-indigo-100 text-indigo-700',
    submittedAt: '2026-04-20',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'appeal-2',
    appealNumber: '#APL-2024-0041',
    type: 'FEEDBACK',
    title: 'リーダーシップ評価コメントの根拠確認',
    content:
      'プロジェクトリードを2件担当しましたが、フィードバックでは関与度が低いと記載されています。評価根拠の補足を希望します。',
    priority: 'HIGH',
    deadlineDays: 2,
    employeeId: 'employee-00256',
    employeeName: '鈴木 花子',
    employeeNumber: 'EMP-00256',
    avatarColor: 'bg-rose-100 text-rose-700',
    submittedAt: '2026-04-19',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'appeal-3',
    appealNumber: '#APL-2024-0040',
    type: 'CALIBRATION',
    title: '部門間キャリブレーション結果の再確認',
    content:
      '同等グレードの他部署メンバーと比較して、成果指標の扱いに差があるように見えます。調整会議での判断材料を確認したいです。',
    priority: 'HIGH',
    deadlineDays: 4,
    employeeId: 'employee-00312',
    employeeName: '佐藤 美咲',
    employeeNumber: 'EMP-00312',
    avatarColor: 'bg-orange-100 text-orange-700',
    submittedAt: '2026-04-18',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'appeal-4',
    appealNumber: '#APL-2024-0039',
    type: 'EVALUATION_RESULT',
    title: '追加目標の評価基準が不明確だった件',
    content:
      '中間面談で追加された目標について、評価基準が明文化されないまま未達扱いとなりました。合意内容との照合をお願いします。',
    priority: 'MEDIUM',
    deadlineDays: 5,
    employeeId: 'employee-00387',
    employeeName: '佐藤 次郎',
    employeeNumber: 'EMP-00387',
    avatarColor: 'bg-cyan-100 text-cyan-700',
    submittedAt: '2026-04-18',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'appeal-5',
    appealNumber: '#APL-2024-0038',
    type: 'EVALUATION_RESULT',
    title: '育児休業期間を含む評価算定方法への異議',
    content:
      '育休取得期間を含む評価で、フル稼働期間と同じ基準が適用されています。就業規則に基づく按分計算を確認してください。',
    priority: 'MEDIUM',
    deadlineDays: 8,
    employeeId: 'employee-00512',
    employeeName: '山田 美優',
    employeeNumber: 'EMP-00512',
    avatarColor: 'bg-violet-100 text-violet-700',
    submittedAt: '2026-04-17',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'appeal-6',
    appealNumber: '#APL-2024-0037',
    type: 'FEEDBACK',
    title: '顧客満足度スコア集計対象期間の確認',
    content:
      '集計対象が一部月のみになっており、直近の高評価期間が含まれていません。ダッシュボードの抽出条件を確認したいです。',
    priority: 'LOW',
    deadlineDays: 10,
    employeeId: 'employee-00634',
    employeeName: '伊藤 健',
    employeeNumber: 'EMP-00634',
    avatarColor: 'bg-emerald-100 text-emerald-700',
    submittedAt: '2026-04-15',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'appeal-7',
    appealNumber: '#APL-2024-0036',
    type: 'CALIBRATION',
    title: '昇格候補者会議でのスキル評価参照について',
    content:
      '最新のスキル登録が反映される前のデータで議論された可能性があります。登録履歴と会議資料の突合をお願いします。',
    priority: 'LOW',
    deadlineDays: 13,
    employeeId: 'employee-00711',
    employeeName: '高橋 葵',
    employeeNumber: 'EMP-00711',
    avatarColor: 'bg-slate-100 text-slate-700',
    submittedAt: '2026-04-14',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'appeal-8',
    appealNumber: '#APL-2024-0035',
    type: 'FEEDBACK',
    title: '追加資料の提出待ち',
    content: '申立者へ根拠資料の追加提出を依頼済みです。',
    priority: 'MEDIUM',
    deadlineDays: 6,
    employeeId: 'employee-00802',
    employeeName: '中村 蓮',
    employeeNumber: 'EMP-00802',
    avatarColor: 'bg-yellow-100 text-yellow-700',
    submittedAt: '2026-04-13',
    status: 'PENDING_INFO',
  },
]

const PRIORITY_WEIGHT: Record<AppealPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
}

export function getAppealsKpi(): AppealsKpi {
  return { ...APPEALS_KPI }
}

export function listAppealsForReview(status: AppealStatus = 'UNDER_REVIEW'): readonly Appeal[] {
  return APPEALS.filter((appeal) => appeal.status === status)
    .toSorted((a, b) => {
      const priorityDelta = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
      if (priorityDelta !== 0) return priorityDelta
      return a.deadlineDays - b.deadlineDays
    })
    .map((appeal) => ({ ...appeal }))
}

export function applyAppealAction(id: string, action: AppealAction): Appeal | null {
  const appeal = APPEALS.find((item) => item.id === id)
  if (!appeal) return null
  const status: AppealStatus =
    action === 'request-info'
      ? 'PENDING_INFO'
      : action === 'reject'
        ? 'COMPLETED_REJECTED'
        : 'COMPLETED_CORRECTION'

  return {
    ...appeal,
    status,
  }
}
