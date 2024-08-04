const os = require('os');
const fs = require('graceful-fs');
const path = require('path');
const { _, debounce } = require('lodash');
const { ipcRenderer, shell } = require('electron');
const Store = require('electron-store');
const Sentry = require('@sentry/electron/renderer');
const { CaptureConsole } = require('@sentry/integrations');

const ViewController = require('./app/view_controller');
const ChatController = require('./app/chat_controller');
const OnboardingController = require('./app/onboarding_controller');

const { processFile, handleDrop } = require('./app/chat/file_handler');
const { MODEL_OPTIONS, SMALL_MODEL_OPTIONS, EMBEDDINGS_MODEL_OPTIONS } = require('./app/static/models_config');

const localStorage = new Store();
const chatController = new ChatController();
const viewController = new ViewController();
const onboardingController = new OnboardingController();

const isWindows = process.platform === 'win32';
const isDevelopment = process.env.NODE_ENV === 'development';
let dataPath;

// Add bug tracking

if (!isDevelopment) {
  Sentry.init({
    dsn: 'https://87985c08c00b4f0c83989b182e9fbe95@o4505507137847296.ingest.sentry.io/4505507139485696',
    integrations: [new CaptureConsole()],
  });
}

// Register IPC events listeners
ipcRenderer.on('read-files', async (event, file) => {
  const { filePaths } = file;
  for (const filePath of filePaths) {
    processFile(filePath);
  }
});

ipcRenderer.on('directory-data', async (event, file) => {
  const { filePaths } = file;
  if (filePaths.length > 0) {
    chatController.agent.projectController.openProject(filePaths[0]);
  }
});

ipcRenderer.on('app-info', (event, data) => {
  const { version, userDataPath } = data;
  dataPath = userDataPath;
  document.getElementById('appVersion').innerText = version;
});

ipcRenderer.on('file-error', (event, errMessage) => {
  alert(`An error occurred reading the file: ${errMessage}`);
});

ipcRenderer.on('save-shortcut-triggered', () => {
  chatController.chat.history.showModal();
});

ipcRenderer.on('refresh-browser', () => {
  chatController.browser.reload();
});

document.addEventListener('DOMContentLoaded', () => {
  viewController.renderModelDropdowns();
  viewController.initializeUIFormatting();
  viewController.changeTheme(chatController.settings.theme);
  viewController.handlePanelResize();
  chatController.clearChat();
  onboardingController.showAllTips();
  chatController.customModelsManager.render();
});

ipcRenderer.on('download-logs', () => {
  const chatLogs = chatController.chatLogs;
  const chatLogsData = JSON.stringify(chatLogs, null, 2);
  const blob = new Blob([chatLogsData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'chat_logs.json';
  link.click();
});

const debouncedSubmit = debounce(chatController.processMessageChange, 100);
document.getElementById('messageInput').addEventListener('keydown', debouncedSubmit);

document.getElementById('reject_button').addEventListener('click', function () {
  chatController.agent.userDecision = 'reject';
});

document.getElementById('approve_button').addEventListener('click', function () {
  chatController.agent.userDecision = 'approve';
});

// Open links in actual web browser not in app
document.addEventListener('click', (event) => {
  viewController.handleClick(event);
});
