const isTextOrBinary = require('istextorbinary');
const NodeCache = require("node-cache"); // Require NodeCache for caching
const tokenCache = new NodeCache(); // Instance for handling token caching

async function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${ms} ms`)), ms));
  return Promise.race([promise, timeout]);
}

async function withErrorHandling(fn, ...args) {
  try {
    return await fn(...args);
  } catch (error) {
    console.error(error);
    const errorMessage = typeof error === 'object' && error !== null && 'message' in error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);

    chatController.chat.addFrontendMessage('error', `Error occurred. ${errorMessage}`);
  }
}

function getFriendlyOSName() {
  const osType = os.type();

  if (osType === 'Darwin') {
    return 'macOS';
  }
  if (osType === 'Windows_NT') {
    return 'Windows' + ` ${getWindowsVersion()}`;
  }
  if (osType === 'Linux') {
    return 'Linux';
  }
  return osType; // Default to the technical OS type name
}

function getWindowsVersion() {
  const release = os.release().split('.');
  // for Windows 10 and 11 the major version is 10
  if (parseInt(release[0]) === 10) {
    if (parseInt(release[2]) >= 22000) {
      // Windows 11
      return 'Windows 11';
    }
    // Windows 10
    return 'Windows 10';
  }
  if (parseInt(release[0]) === 6) {
    switch (parseInt(release[1])) {
      case 3:
        // Windows 8.1
        return 'Windows 8.1';
      case 2:
        // Windows 8
        return 'Windows 8';
      case 1:
        // Windows 7
        return 'Windows 7';
      case 0:
        // Windows Vista
        return 'Windows Vista';
      default:
        return 'Windows';
    }
  }
  // if the OS is not identified or it's not Windows, then return the full release version
  return '';
}

function getSystemInfo() {
  const osName = getFriendlyOSName();
  const osVersion = os.release(); // Returns the operating system version
  const osArch = os.arch(); // Returns the processor architecture

  const systemInfo = `${osName} (Release: ${osVersion}) architecture ${osArch}`;
  return systemInfo;
}

function cacheAdd(key, data, time) {
  // Add data to cache with specified key and time-to-live (in seconds)
  tokenCache.set(key, data, time);
}

function cacheGet(key) {
  // Get data from cache with specified key
  return tokenCache.get(key);
}

function isTextFile(buffer) {
  return isTextOrBinary.isText(null, buffer);
}

module.exports = {
  withTimeout,
  withErrorHandling,
  getSystemInfo,
  isTextFile,
  cacheAdd, // Export functions to handle cache operations
  cacheGet,
};