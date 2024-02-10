const os = require('os');
const { OpenAI } = require('openai');
const Parser = require('@postlight/parser');
const _ = require('lodash');
const autosize = require('autosize');

const Agent = require('./chat/agent');
const CacheManager = require('./cache_manager');
const Chat = require('./chat/chat');
const TerminalSession = require('./tools/terminal_session');
const { getSystemInfo } = require('./utils');
const { systemMessage } = require('./static/prompts');
const { reduceTokensUsage } = require('./static/constants');
const { trackEvent } = require('@aptabase/electron/renderer');
const BackgroundTask = require('./tools/background_task');
const { toolDefinitions } = require('./tools/tools');

const MAX_RETRIES = 3;
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: '',
  selectedModel: 'gpt-4-1106-preview',
  approvalRequired: true,
  maxTokensPerRequest: 10000,
  maxTokensPerChat: 100000,
  maxFilesToEmbed: 500,
  commandToOpenFile: 'code',
  theme: 'dark',
};

// Monitoring API usage and setting up alerts
const API_USAGE_ALERT_THRESHOLD = 0.8; // Alert at 80% of token limit
const API_USAGE_ALERT_INTERVAL = 60 * 60 * 1000; // Check every hour

let lastApiUsageAlertTime = 0;

function checkApiUsage() {
  const currentTime = Date.now();
  if (currentTime - lastApiUsageAlertTime > API_USAGE_ALERT_INTERVAL) {
    const usagePercentage = this.conversationTokens / this.settings.maxTokensPerChat;
    if (usagePercentage > API_USAGE_ALERT_THRESHOLD) {
      console.warn(`API usage is at ${Math.round(usagePercentage * 100)}%. Consider optimizing usage or increasing token limits.`);
      // Here you would integrate with an alerting system like email, Slack, etc.
      // sendAlert(`API usage is high: ${Math.round(usagePercentage * 100)}%`);
    }
    lastApiUsageAlertTime = currentTime;
  }
}

// Existing ChatController class and other code...

// Remember to call checkApiUsage() at appropriate places in the code, such as after API calls.
