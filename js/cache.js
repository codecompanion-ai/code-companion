const NodeCache = require('node-cache');

// Create a new cache instance with a default TTL of 5 minutes
const cache = new NodeCache({ stdTTL: 300, checkperiod: 600 });

/**
 * Retrieves data from the cache.
 * @param {string} key - The cache key.
 * @returns {any} - The cached data or undefined if not found.
 */
function getFromCache(key) {
  return cache.get(key);
}

/**
 * Stores data in the cache.
 * @param {string} key - The cache key.
 * @param {any} value - The data to cache.
 * @param {number} [ttl] - The time to live in seconds.
 * @returns {boolean} - True if the data was cached successfully, false otherwise.
 */
function storeInCache(key, value, ttl) {
  return cache.set(key, value, ttl);
}

/**
 * Removes data from the cache.
 * @param {string} key - The cache key.
 * @returns {void}
 */
function removeFromCache(key) {
  cache.del(key);
}

/**
 * Clears the entire cache.
 * @returns {void}
 */
function clearCache() {
  cache.flushAll();
}

module.exports = {
  getFromCache,
  storeInCache,
  removeFromCache,
  clearCache,
};
