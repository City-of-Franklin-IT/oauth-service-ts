class AuthCodeCache {
    cache = new Map();
    set(code, entry) {
        this.cache.set(code, entry);
    }
    get(code) {
        const entry = this.cache.get(code);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(code);
            return null;
        }
        return entry;
    }
    remove(code) {
        this.cache.delete(code);
    }
}
export const authCodeCache = new AuthCodeCache();
