class SmartContext {
  constructor() {
    this.chat = null;
    this.lastShortenedAssistantMessageId = 0;
  }

  async updateContext(chat) {
    this.chat = chat;
    // Trigger context reduction only if there's a significant number of messages
    if (this.chat.backendMessages.length < 7) {
      return;
    }
    this.reduceContextPerFileGroup();
    this.reduceContextOfShellCommands();
    this.reduceCodeSearchResults();
    this.reduceGoogleSearchResults();
  }

  reduceCodeSearchResults() {
    // Target only the recent code search results for reduction
    const searchMessages = this.chat.backendMessages.slice(0, -5).filter((message) => message.role === 'function' && message.name === 'search_code');
    searchMessages.forEach((message) => {
      try {
        let content = JSON.parse(message.content);
        // Keep only the most relevant search result to reduce context size
        if (content.length > 1) {
          content = [content[0]]; // Keep the first (most relevant) result
          message.content = JSON.stringify(content);
        }
      } catch (e) {
        // Handle parsing error gracefully
      }
    });
  }

  reduceGoogleSearchResults() {
    // Simplify Google search results similarly to code search results
    const searchMessages = this.chat.backendMessages.slice(0, -5).filter((message) => message.role === 'function' && (message.name === 'search_google' || message.name === 'search_url'));
    searchMessages.forEach((message) => {
      // Replace content with a placeholder to significantly reduce token usage
      message.content = '-';
    });
  }

  reduceContextOfShellCommands() {
    // Focus on reducing the context created by shell command outputs
    const shellCommands = this.chat.backendMessages.filter((message) => message.role === 'assistant' && message.function_call && message.function_call.name === 'run_shell_command').slice(0, -5);
    shellCommands.forEach((message, index) => {
      const nextMessageIndex = this.getNextMessageIndex(message.id);
      if (nextMessageIndex > -1 && this.chat.backendMessages[nextMessageIndex].role === 'function') {
        this.reduceFunctionResponseMessage(nextMessageIndex, message.function_call.arguments);
      }
    });
  }

  reduceContextPerFileGroup() {
    // Group file-related messages and reduce their context footprint
    const fileGroups = this.getFileGroups();
    for (const file in fileGroups) {
      const groupIdArray = fileGroups[file];

      groupIdArray.forEach((id, index) => {
        const nextMessageIndex = this.getNextMessageIndex(id);
        if (index < groupIdArray.length - 1 && nextMessageIndex > -1 && this.chat.backendMessages[nextMessageIndex].role === 'function') {
          this.setMessageFunctionArgumentsToBlank(id);
          this.reduceFunctionResponseMessage(nextMessageIndex, file);
        }
      });
    }
  }

  reduceFunctionResponseMessage(nextMessageIndex, targetFile) {
    // Reduce the content of function response messages to minimize context
    if (this.chat.backendMessages[nextMessageIndex].name === 'read_files') {
      const parsedContent = JSON.parse(this.chat.backendMessages[nextMessageIndex].content);
      const filteredContent = parsedContent.filter((content) => content.targetFile !== targetFile);
      if (filteredContent.length > 0) {
        this.chat.backendMessages[nextMessageIndex].content = JSON.stringify(filteredContent);
        return;
      }
    }

    // Remove the message if it no longer contributes valuable context
    this.chat.backendMessages.splice(nextMessageIndex, 1);
  }

  setMessageFunctionArgumentsToBlank(id) {
    // Blank out function arguments to reduce token usage
    const message = this.getMessageById(id);
    message.function_call.arguments = '-';

    // Update the message in the backendMessages array
    const messageIndex = this.chat.backendMessages.findIndex((m) => m.id === message.id);
    if (messageIndex > -1) {
      this.chat.backendMessages[messageIndex] = message;
    }
  }

  getMessageById(id) {
    // Utility method to find a message by its ID
    return this.chat.backendMessages.find((message) => message.id === id);
  }

  getNextMessageIndex(id) {
    // Find the index of the next message in the chat
    const currentMessageIndex = this.chat.backendMessages.findIndex((message) => message.id === id);
    return currentMessageIndex + 1;
  }

  getFileGroups() {
    // Organize messages by file operations to target them for context reduction
    const fileGroups = {};
    this.chat.backendMessages.forEach((message) => {
      if (
        message.role === 'assistant' &&
        message.function_call &&
        ['create_or_overwrite_file', 'replace_string_in_file', 'read_files'].includes(message.function_call.name) &&
        message.function_call.arguments !== '-'
      ) {
        const { targetFile, targetFiles } = JSON.parse(message.function_call.arguments);
        const targetFilesArray = [targetFile, ...(targetFiles || [])].filter(Boolean);
        targetFilesArray.forEach((targetFile) => {
          if (!fileGroups[targetFile]) {
            fileGroups[targetFile] = [];
          }
          fileGroups[targetFile].push(message.id);
        });
      }
    });
    return fileGroups;
  }
}

module.exports = SmartContext;