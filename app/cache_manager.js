const fs = require('fs');
const path = require('path');

// CacheManager class to handle caching of API responses using the filesystem
class CacheManager {
  constructor(cacheDir = 'cache') {
    this.cacheDir = cacheDir;
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir);
    }
  }

  getFilePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  get(key) {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return null;
  }

  set(key, value) {
    const filePath = this.getFilePath(key);
    fs.writeFileSync(filePath, JSON.stringify(value));
  }

  invalidate(key) {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  clear() {
    fs.readdirSync(this.cacheDir).forEach((file) => {
      fs.unlinkSync(path.join(this.cacheDir, file));
    });
  }
}

module.exports = CacheManager;
