interface AuthCodeEntry {
  access_token: string
  expires_in: number
  expiresAt: number
}

class AuthCodeCache {
  private cache = new Map<string, AuthCodeEntry>()

  set(code: string, entry: AuthCodeEntry): void {
    this.cache.set(code, entry)
  }

  get(code: string): AuthCodeEntry | null {
    const entry = this.cache.get(code)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(code)
      return null
    }

    return entry
  }

  remove(code: string): void {
    this.cache.delete(code)
  }
}

export const authCodeCache = new AuthCodeCache()
