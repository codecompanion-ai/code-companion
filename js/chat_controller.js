const os = require('os');
const Parser = require('@postlight/parser');
const _ = require('lodash');
const CodeAgent = require('./code_agent');
const Chat = require('./chat');
const TerminalSession = require('./terminal_session');
const { getSystemInfo } = require('./utils');
const { systemMessage, codeFunctions } = require('./static/prompts');
const { reduceTokensUsage } = require('./static/constants');
const { trackEvent } = require('@aptabase/electron/renderer');
const BackgroundTask = require('./background_task');

class ChatController {
  constructor() {
    this.MAX_RETRIES = 3;
    this.selectedModel = 'gpt-4-1106-preview';
    this.openai = null;
    this.abortController = new AbortController();
    this.stopProcess = false;
    this.chat = new Chat();
    this.codeAgent = new CodeAgent();
    this.terminalSession = new TerminalSession();
    this.processMessageChange = this.processMessageChange.bind(this);
    this.submitMessage = this.submitMessage.bind(this);
    this.conversationTokens = 0;
    this.lastRequestTokens = 0;
    this.approvalRequired = settings.get('approvalRequired') || true;
    this.isProcessing = false;
    this.backgroundTask = new BackgroundTask();
  }

  setModel(model) {
    this.selectedModel = model;
    settings.set('selectedModel', this.selectedModel);
    document.getElementById('modelDropdown').value = this.selectedModel;
  }

  setApprovalRequired(isRequired) {
    this.approvalRequired = isRequired;
    settings.set('approvalRequired', this.approvalRequired);
  }

  handleError(error) {
    console.error('Error :', error);
    if (this.abortController.signal.aborted) {
      this.abortController = new AbortController();
      this.chat.addFrontendMessage('error', 'Request was aborted');
    } else {
      this.chat.addFrontendMessage('error', `Error occured. ${error.message}`);
    }
    this.stopProcess = false;
    document.getElementById('retry_button').removeAttribute('hidden');
  }

  requestStopProcess() {
    this.stopProcess = true;
    this.abortController.abort();
    const stopButton = document.getElementById('requestStopProcess');
    this.terminalSession.interruptShellSession();
    stopButton.innerHTML = '<i class="bi bg-body border-0 bi-stop-circle text-danger me-2"></i> Stopping...';
    setTimeout(() => {
      stopButton.innerHTML = '<i class="bi bg-body border-0 bi-stop-circle text-danger me-2"></i> Stop';
      this.abortController = new AbortController();
      this.stopProcess = false;
    }, 2000);
  }

  async callAPI(api_messages, model = this.selectedModel, retryCount = 0) {
    // Check if the response is already cached
    const cacheKey = `openai:${JSON.stringify(api_messages)}:${model}`;
    if (cacheManager.has(cacheKey)) {
      return cacheManager.get(cacheKey);
    }

    // If not cached, proceed with the API call

    if (isDevelopment) {
      console.log(`Calling API with messages (${this.chat.countTokens(JSON.stringify(api_messages))} tokens)`, api_messages);
    }

    try {
      const callParams = {
        model,
        messages: api_messages,
        top_p: 0.1,
        stream: true,
        functions: codeFunctions,
      };

      // calculate tokens for last request
      this.lastRequestTokens = this.chat.countTokens(JSON.stringify(api_messages));
      this.conversationTokens += this.lastRequestTokens;

      if (this.lastRequestTokens > this.maxTokensPerRequest) {
        throw new Error(
          `\nThe number of tokens in the current request (${this.lastRequestTokens}) exceeds maximum value in settings: ${this.maxTokensPerRequest}\n\nYou can adjust this value in settings and click "Retry" button.\n\n
          ${reduceTokensUsage}
          `,
        );
      }
      if (this.conversationTokens > this.maxTokensPerChat) {
        throw new Error(
          `The total number of tokens used in this chat (${this.conversationTokens}) exceeds ${this.maxTokensPerChat}\n\nYou can adjust this value in settings and click "Retry" button.\n\n
          ${reduceTokensUsage}
          `,
        );
      }

      const stream = await this.openai.beta.chat.completions.stream(callParams, {
        maxRetries: this.MAX_RETRIES,
        signal: this.abortController.signal,
      });

      stream.on('content', (_delta, snapshot) => {
        this.chat.updateStreamingMessage(snapshot);
      });

      const chatCompletion = await stream.finalChatCompletion();
      if (isDevelopment) {
        console.log('API response:', chatCompletion);
      }

      if (chatCompletion?.choices[0]?.message) {
        this.conversationTokens += this.chat.countTokens(JSON.stringify(chatCompletion?.choices[0].message));
      }

      // if function call try parsing to retry
      if (chatCompletion?.choices[0].message?.function_call) {
        JSON.parse(chatCompletion.choices[0].message.function_call.arguments);
      }

      renderSystemMessage();
      return chatCompletion;
    } catch (error) {
      console.error('Error during openai.createChatCompletion:', error);

      if ((error instanceof OpenAI.APIError && error.status == 429) || error instanceof SyntaxError) {
        if (retryCount >= this.MAX_RETRIES) {
          throw error;
        }
        console.error(`Rate limit exceeded, retrying - ${retryCount}...`, error);
        renderSystemMessage('Error occured. Retrying...');
        await new Promise((resolve) => setTimeout(resolve, 300));
        return this.callAPI(api_messages, model, retryCount + 1);
      } else {
        throw error;
      }
    }
  }

  retry() {
    this.process('', false);
  }

  async process(query, renderUserMessage = true) {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    let messageContent;
    let apiResponseMessage;
    document.getElementById('retry_button').setAttribute('hidden', true);

    if (!this.openai) {
      this.chat.addFrontendMessage(
        'error',
        'Please add your <a href="https://platform.openai.com/account/api-keys">OpenAI API key</a> under settings menu (<i class="bi bi-gear bg-body border-0"></i>)',
      );
      return;
    }

    if (this.stopProcess) {
      updateLoadingIndicator(false);
      return;
    }

    if (query) {
      this.chat.addBackendMessage('user', query);
      if (renderUserMessage) {
        this.chat.addFrontendMessage('user', query);
      }
    }

    // add project state context to messages for Code Agent
    await this.codeAgent.updateProjectState();

    try {
      updateLoadingIndicator(true, 'Waiting for ChatGPT ...');
      const formattedMessages = this.chat.backendMessages.map((message) => _.omit(message, ['id']));
      const apiResponse = await this.callAPI(formattedMessages);

      if (!apiResponse) {
        console.error('No response from API');
        return;
      }

      if (apiResponse.choices[0].finish_reason === 'length') {
        this.chat.addFrontendMessage('error', 'Response was incomplete due to model context size limit. <br />Please clear chat or delete some messages and try again.');
        document.getElementById('retry_button').removeAttribute('hidden');
        return;
      }

      apiResponseMessage = apiResponse.choices[0].message;
      messageContent = apiResponseMessage.content;
    } catch (error) {
      this.handleError(error);
    } finally {
      updateLoadingIndicator(false);
    }

    this.isProcessing = false;
    await this.codeAgent.runCodeAgent(apiResponseMessage);
  }

  async fetchAndParseUrl(url) {
    updateLoadingIndicator(true);
    try {
      const parsedResult = await Parser.parse(url, { contentType: 'text' });
      if (parsedResult.failed) {
        console.error('Error parsing URL:', parsedResult.error);
        this.chat.addFrontendMessage('error', `Error parsing URL:${parsedResult.error}`);
        return;
      }

      this.chat.addMessage('user', `Title: ${parsedResult.title}\nContent:\n${parsedResult.content}`);
    } catch (error) {
      console.error('Error fetching and parsing URL:', error);
      this.chat.addFrontendMessage('error', `Error fetching and parsing URL:${error}`);
    }
  }

  async processURL(url) {
    this.chat.addFrontendMessage('user', `URL: ${url}`);

    await this.fetchAndParseUrl(url);
  }

  async submitMessage() {
    const messageInput = document.getElementById('messageInput');
    const query = messageInput.value.replace(/\n$/, '');
    if (!query) return;

    messageInput.value = '';
    autosize.update(messageInput);

    const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/gi;
    const urlMatches = query.match(urlRegex);

    if (urlRegex.test(query) && query === urlMatches[0]) {
      this.processURL(urlMatches[0]);
    } else {
      this.process(query);
    }
  }

  processMessageChange(event) {
    if (event.code === 'N' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.clearChat();
      return;
    }

    if (event.keyCode === 13 && !event.shiftKey) {
      this.submitMessage();
    }

    if (event.keyCode === 38) {
      const lastUserMessage = this.chat.getLastUserMessage();
      if (lastUserMessage) document.getElementById('messageInput').value = lastUserMessage;
    }
  }

  async buildSystemMessage() {
    this.chat.replaceSystemMessagePlaceholder('{osName}', getSystemInfo());
    this.chat.replaceSystemMessagePlaceholder('{shellType}', this.terminalSession.shellType);
  }

  async clearChat() {
    trackEvent(`new_chat`);
    this.chat = new Chat();
    this.chat.addBackendMessage('system', systemMessage);
    this.codeAgent.userDecision = false;
    this.terminalSession.createShellSession();
    document.getElementById('output').innerHTML = '';
    document.getElementById('retry_button').setAttribute('hidden', true);
    document.getElementById('approval_buttons').setAttribute('hidden', true);
    document.getElementById('messageInput').disabled = false;
    this.stopProcess = false;
    this.conversationTokens = 0;
    this.lastRequestTokens = 0;
    renderSystemMessage();

    this.codeAgent.projectState = {
      complexity: '',
      currentWorkingDir: '',
      folderStructure: '',
      requirementsChecklist: '',
    };

    this.buildSystemMessage();
    onboarding.showAllTips();
    this.codeAgent.showWelcomeContent();
    onShow();
  }
}

module.exports = ChatController;
