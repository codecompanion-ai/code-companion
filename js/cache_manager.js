class CacheManager {
  constructor() {
    this.cache = {};
    this.ttl = {};
  }

  get(key) {
    const now = Date.now();
    if (this.cache[key] && (this.ttl[key] === undefined || this.ttl[key] > now)) {
      return this.cache[key];
    }
    return undefined;
  }

  set(key, value, ttl) {
    this.cache[key] = value;
    if (ttl) {
      this.ttl[key] = Date.now() + ttl;
    }
  }

  has(key) {
    const now = Date.now();
    if (this.cache[key] && (this.ttl[key] === undefined || this.ttl[key] > now)) {
      return true;
    }
    return false;
  }

  remove(key) {
    delete this.cache[key];
    delete this.ttl[key];
  }

  clear() {
    this.cache = {};
    this.ttl = {};
  }

  cleanUp() {
    const now = Date.now();
    Object.keys(this.ttl).forEach((key) => {
      if (this.ttl[key] <= now) {
        this.remove(key);
      }
    });
  }
}

module.exports = CacheManager;
