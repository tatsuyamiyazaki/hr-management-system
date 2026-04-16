import { describe, it, expect } from 'vitest'
import { createLocalBlobStorage } from '@/lib/export/blob-storage'

describe('LocalBlobStorage', () => {
  const storage = createLocalBlobStorage()

  describe('upload()', () => {
    it('should return a blob key after upload', async () => {
      const key = await storage.upload('test-export/file.csv', Buffer.from('col1,col2\nv1,v2'))
      expect(key).toBeTruthy()
      expect(typeof key).toBe('string')
    })

    it('should include the path in the returned key', async () => {
      const path = 'exports/my-file.csv'
      const key = await storage.upload(path, Buffer.from('data'))
      expect(key).toContain('my-file.csv')
    })
  })

  describe('getSignedUrl()', () => {
    it('should return a signed URL and expiresAt', async () => {
      const key = await storage.upload('exports/test.csv', Buffer.from('data'))
      const { url, expiresAt } = await storage.getSignedUrl(key, 3600)
      expect(url).toBeTruthy()
      expect(typeof url).toBe('string')
      expect(expiresAt).toBeTruthy()
    })

    it('should set expiry 24 hours in the future by default', async () => {
      const key = await storage.upload('exports/test.csv', Buffer.from('data'))
      const before = Date.now()
      const { expiresAt } = await storage.getSignedUrl(key, 86_400)
      const after = Date.now()

      const expiryMs = new Date(expiresAt).getTime()
      // 24h window with some slack
      expect(expiryMs).toBeGreaterThanOrEqual(before + 86_400 * 1_000 - 1_000)
      expect(expiryMs).toBeLessThanOrEqual(after + 86_400 * 1_000 + 1_000)
    })

    it('should throw for unknown key', async () => {
      await expect(storage.getSignedUrl('nonexistent-key', 3600)).rejects.toThrow()
    })
  })
})
