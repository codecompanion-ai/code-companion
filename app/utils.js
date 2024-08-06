const isTextOrBinary = require('istextorbinary');
const readChunkSync = require('read-chunk').sync;
const { getEncoding } = require('js-tiktoken');
const path = require('path');
const fs = require('graceful-fs');
const tokenizer = getEncoding('cl100k_base');

async function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms} ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

async function withErrorHandling(fn, ...args) {
  try {
    return await fn(...args);
  } catch (error) {
    console.error(error);
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? error.message
        : typeof error === 'object'
          ? JSON.stringify(error)
          : String(error);

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

function isTextFile(fileName) {
  const buffer = readChunkSync(fileName, 0, 4100);
  return isTextOrBinary.isText(fileName, buffer);
}

async function normalizedFilePath(targetFile) {
  targetFile = path.normalize(targetFile);
  if (path.isAbsolute(targetFile)) {
    return targetFile;
  }
  await chatController.terminalSession.getCurrentDirectory();
  return path.join(chatController.agent.currentWorkingDir, targetFile);
}

async function isFileExists(filePath) {
  const normalizedPath = await normalizedFilePath(filePath);
  if (fs.existsSync(normalizedPath)) {
    const stats = fs.statSync(normalizedPath);
    return stats.size > 0;
  }
  return false;
}

function log(...args) {
  if (isDevelopment) {
    console.log(...args);
  }
  chatController.chatLogs.push(args);
}

function getTokenCount(content) {
  return tokenizer.encode(JSON.stringify(content) || '').length;
}

async function openFileLink(filepath) {
  try {
    let absolutePath = path.normalize(filepath);
    if (!path.isAbsolute(absolutePath)) {
      if (chatController.agent.projectController.currentProject) {
        absolutePath = path.join(chatController.agent.projectController.currentProject.path, absolutePath);
      } else {
        absolutePath = await normalizedFilePath(absolutePath);
      }
    }

    let filename;
    if (chatController.agent.projectController.currentProject) {
      filename = path.relative(chatController.agent.projectController.currentProject.path, absolutePath);
    } else {
      filename = path.relative(chatController.agent.currentWorkingDir, absolutePath);
    }

    return `<a href="#" onclick="event.preventDefault(); viewController.openFileInIDE('${absolutePath.replace(/\\/g, '\\\\')}')">${filename}</a>`;
  } catch (error) {
    console.error(error);
    return filepath;
  }
}

module.exports = {
  withTimeout,
  withErrorHandling,
  log,
  getSystemInfo,
  isTextFile,
  normalizedFilePath,
  isFileExists,
  getTokenCount,
  openFileLink,
};
