import * as AppTypes from "../types.js"

class StateCache {

  private cache: Map<string, AppTypes.StateEntryInterface> = new Map()

  constructor() {

    setInterval(() => this.purgeExpired(), 5 * 60 * 1000)
  }

  set(state: string, entry: AppTypes.StateEntryInterface): void {

    this.cache.set(state, entry)
  }

  get(state: string): AppTypes.StateEntryInterface | undefined {

    const entry = this.cache.get(state)
    if(!entry) {
      return undefined
    }

    if(entry.expiresAt < Date.now()) {
      this.cache.delete(state)
      return undefined
    }

    return entry
  }

  remove(state: string): void {

    this.cache.delete(state)
  }

  private purgeExpired(): void {

    const now = Date.now()
    for(const [state, entry] of this.cache.entries()) {
      if(entry.expiresAt < now) {
        this.cache.delete(state)
      }
    }
  }
}

export const stateCache = new StateCache()
