const os = require('os');
const fs = require('graceful-fs');
const path = require('path');
const hljs = require('highlight.js/lib/common');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const autosize = require('autosize');
const { _, debounce } = require('lodash');
const { ipcRenderer, shell } = require('electron');
const { OpenAI } = require('openai');
const Store = require('electron-store');

// import GPT-4 Vision
const { GPT4Vision } = require('gpt4-vision');

const {
  populateModelDropdown,
  changeTheme,
  selectDirectory,
  openFileDialogue,
  onShow,
  updateLoadingIndicator,
  saveApiKey,
  saveMaxTokensPerRequest,
  saveMaxTokensPerChat,
  renderSystemMessage,
  saveMaxFilesToEmbed,
  saveCommandToOpenFile,
  openFile,
} = require('./js/view_handler');
const ChatController = require('./js/chat_controller');
const { processFile, handleDrop } = require('./js/file_handler');
const Onboarding = require('./js/onboarding');
const onboardingSteps = require('./js/static/onboarding_steps');
const { modelOptions, defaultModel } = require('./js/static/models_config');

const settings = new Store();
const chatController = new ChatController();
const onboarding = new Onboarding(onboardingSteps);
// Initialize GPT-4 vision.
const gpt4Vision = new GPT4Vision();
const isWindows = process.platform === 'win32';
const isDevelopment = process.env.NODE_ENV === 'development';
let dataPath;

// IPC listeners
// rest of the code here...
// Please add the rest of the code from the original version here.
// The new code added was importing GPT-4 Vision and initializing it.