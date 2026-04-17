import { randomUUID } from 'node:crypto'
import type { Notification, NotificationId, NotificationPreferences } from './notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/** Notification（アプリ内通知）の永続化インターフェース */
export interface NotificationRepository {
  /** 指定ユーザーの通知を createdAt 降順で返す */
  listByUser(userId: string): Promise<readonly Notification[]>

  /** 単一の通知を取得する。存在しない場合は null */
  findById(id: NotificationId): Promise<Notification | null>

  /**
   * 通知を既読にする。
   * - 存在しない場合は null
   * - 既に既読の場合は readAt を上書きせず現状を返す（冪等）
   */
  markAsRead(id: NotificationId, readAt: Date): Promise<Notification | null>

  /** 通知を作成する。id/createdAt/readAt は内部で割り当てる */
  create(input: Omit<Notification, 'id' | 'createdAt' | 'readAt'>): Promise<Notification>
}

/** NotificationPreference（種別別 email ON/OFF）の永続化インターフェース */
export interface NotificationPreferenceRepository {
  /** 指定ユーザーの保存済み設定を返す（未保存のカテゴリは含まれない） */
  listByUser(userId: string): Promise<NotificationPreferences>

  /**
   * 指定ユーザーの設定をまとめて保存する。
   * 既存レコードは全てこの内容で置き換える（単純化のため）。
   */
  upsertMany(userId: string, prefs: NotificationPreferences): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function cloneNotification(n: Notification): Notification {
  return { ...n }
}

function sortByCreatedAtDesc(list: readonly Notification[]): Notification[] {
  return [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory NotificationRepository
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryNotificationRepository implements NotificationRepository {
  private readonly store: Map<string, Notification>

  constructor(seed?: readonly Notification[]) {
    this.store = new Map()
    if (seed) {
      for (const n of seed) {
        // 防御的コピーで外部から保持している参照の変更を遮断する
        this.store.set(n.id, cloneNotification(n))
      }
    }
  }

  async listByUser(userId: string): Promise<readonly Notification[]> {
    const filtered: Notification[] = []
    for (const n of this.store.values()) {
      if (n.userId === userId) {
        filtered.push(cloneNotification(n))
      }
    }
    return sortByCreatedAtDesc(filtered)
  }

  async findById(id: NotificationId): Promise<Notification | null> {
    const found = this.store.get(id)
    return found ? cloneNotification(found) : null
  }

  async markAsRead(id: NotificationId, readAt: Date): Promise<Notification | null> {
    const current = this.store.get(id)
    if (!current) return null
    if (current.readAt) {
      // 既読済みは冪等に現状を返す
      return cloneNotification(current)
    }
    const updated: Notification = { ...current, readAt }
    this.store.set(id, updated)
    return cloneNotification(updated)
  }

  async create(input: Omit<Notification, 'id' | 'createdAt' | 'readAt'>): Promise<Notification> {
    const created: Notification = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
      readAt: null,
    }
    this.store.set(created.id, created)
    return cloneNotification(created)
  }
}

export function createInMemoryNotificationRepository(
  seed?: readonly Notification[],
): NotificationRepository {
  return new InMemoryNotificationRepository(seed)
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory PreferenceRepository
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryPreferenceRepository implements NotificationPreferenceRepository {
  private readonly store: Map<string, NotificationPreferences>

  constructor(seed?: ReadonlyMap<string, NotificationPreferences>) {
    this.store = new Map()
    if (seed) {
      for (const [userId, prefs] of seed) {
        this.store.set(userId, [...prefs])
      }
    }
  }

  async listByUser(userId: string): Promise<NotificationPreferences> {
    const stored = this.store.get(userId)
    return stored ? [...stored] : []
  }

  async upsertMany(userId: string, prefs: NotificationPreferences): Promise<void> {
    this.store.set(userId, [...prefs])
  }
}

export function createInMemoryPreferenceRepository(
  seed?: ReadonlyMap<string, NotificationPreferences>,
): NotificationPreferenceRepository {
  return new InMemoryPreferenceRepository(seed)
}
