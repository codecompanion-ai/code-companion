const { getTokenCount, isFileExists } = require('../utils');

const { TASK_EXECUTION_PROMPT_TEMPLATE, FINISH_TASK_PROMPT_TEMPLATE } = require('../static/prompts');
const { withErrorHandling, getSystemInfo, isTextFile } = require('../utils');
const { normalizedFilePath } = require('../utils');
const { log } = require('../utils');

const MAX_SUMMARY_TOKENS = 2000;
const MAX_RELEVANT_FILES_TOKENS = 10000;
const MAX_RELEVANT_FILES_COUNT = 7;
const MAX_FILE_SIZE = 100000;
const SUMMARIZE_MESSAGES_THRESHOLD = 6; // Last n message will be left as is

class ChatContextBuilder {
  constructor(chat) {
    this.chat = chat;
    this.lastSummarizedMessageID = 0;
    this.lastMessageIdForRelevantFiles = 0;
    this.reduceRelevantFilesContextMessageId = 0;
    this.lastEditedFilesTimestamp = chat.startTimestamp;
    this.taskContextFiles = {};
    this.pastSummarizedMessages = '';
  }

  async updateTaskContextFiles(fileNames, enabled) {
    if (!Array.isArray(fileNames)) {
      fileNames = [fileNames];
    }

    const updatePromises = fileNames.map(async (fileName) => {
      const fileExists = await isFileExists(fileName);
      if (fileExists) {
        this.taskContextFiles[fileName] = enabled;
      }
    });

    await Promise.all(updatePromises);
    chatController.taskTab.renderContextFiles();
  }

  async updateTaskContextFile(fileName, enabled) {
    await this.updateTaskContextFiles(fileName, enabled);
  }

  getEnabledTaskContextFiles() {
    const result = {};
    Object.entries(this.taskContextFiles).forEach(([fileName, enabled]) => {
      if (enabled) {
        result[fileName] = true;
      }
    });
    return result;
  }

  isTaskContextFileEnabled(fileName) {
    return this.taskContextFiles[fileName] || false;
  }

  async buildMessages(userMessage) {
    this.backendMessages = this.chat.backendMessages.map((message) => _.omit(message, ['id']));
    return [await this.addSystemMessage(), await this.addUserMessage(userMessage)];
  }

  async addUserMessage(userMessage) {
    const conversationSummary = await this.addSummaryOfMessages();
    const lastUserMessage = this.addLastUserMessage(userMessage);
    const relevantSourceCodeInformation = await this.relevantSourceCodeInformation();

    const textContent = [
      this.addTaskMessage(),
      this.addTaskContextMessage(),
      this.addTaskPlanMessage(),
      relevantSourceCodeInformation,
      conversationSummary,
      lastUserMessage,
    ]
      .filter(Boolean)
      .join('\n');

    let content;

    const imageMessages = this.getImageMessages();
    if (imageMessages.length > 0) {
      content = [...imageMessages, { type: 'text', text: textContent }];
    } else {
      content = textContent;
    }

    return {
      role: 'user',
      content,
    };
  }

  getImageMessages() {
    const imageMessages = this.backendMessages.filter(
      (message) => Array.isArray(message.content) && message.content.some((content) => content.type === 'image_url'),
    );

    return imageMessages.map((message) => {
      return message.content.find((content) => content.type === 'image_url');
    });
  }

  async addSystemMessage() {
    let systemMessage;
    systemMessage = TASK_EXECUTION_PROMPT_TEMPLATE;
    if (!this.chat.taskPlan && this.chat.backendMessages.length > 5) {
      systemMessage += FINISH_TASK_PROMPT_TEMPLATE;
    }
    systemMessage += this.addProjectCustomInstructionsMessage();
    systemMessage = this.fromTemplate(systemMessage, '{osName}', getSystemInfo());
    systemMessage = this.fromTemplate(systemMessage, '{shellType}', chatController.terminalSession.shellType);

    return {
      role: 'system',
      content: systemMessage,
    };
  }

  addTaskMessage() {
    return `<task>\n${this.chat.task}\n</task>\n`;
  }

  addTaskContextMessage() {
    if (!this.chat.taskContext) return '';
    return `<additional_context>\n${this.chat.taskContext}</additional_context>\n`;
  }

  addTaskPlanMessage() {
    if (!this.chat.taskPlan) return '';
    const formattedTaskPlan = this.chat.taskPlan.map((step, index) => {
      return {
        id: index + 1,
        step_title: step.step_title,
        step_detailed_description: step.step_detailed_description,
        enabled: step.enabled,
      };
    });
    return `Follow the task plan below to complete the task:\n<task_plan>\n${JSON.stringify(formattedTaskPlan, null, 2)}\n</task_plan>`;
  }

  addProjectCustomInstructionsMessage() {
    const projectCustomInstructions = chatController.agent.projectController.getCustomInstructions();
    if (!projectCustomInstructions) {
      return '';
    } else {
      return `\n\n${projectCustomInstructions}`;
    }
  }

  async addSummaryOfMessages() {
    let allMessagesText = '';
    const backendMessages = this.chat.backendMessages;

    // remove image data from content
    const preprocessedMessages = backendMessages.map((message) => {
      if (Array.isArray(message.content)) {
        const filteredContent = message.content.filter((content) => content.type !== 'image_url');
        return { ...message, content: filteredContent };
      }
      return message;
    });
    const messagesToSummarize = preprocessedMessages.slice(0, -SUMMARIZE_MESSAGES_THRESHOLD);
    let lastSummarizedId = this.lastSummarizedMessageID;
    const notSummarizedMessages = messagesToSummarize
      .filter((message) => message.id > this.lastSummarizedMessageID)
      .reduce((acc, message) => {
        acc += `${this.formatMessageForSummary(message)},\n`;
        lastSummarizedId = message.id;
        return acc;
      }, '');

    allMessagesText = this.pastSummarizedMessages + '\n\n' + notSummarizedMessages; // up to -SUMMARIZE_MESSAGES_THRESHOLD

    if (getTokenCount(notSummarizedMessages) > MAX_SUMMARY_TOKENS) {
      this.summarizeMessages(allMessagesText).then((summarizedMessages) => {
        this.pastSummarizedMessages = summarizedMessages;
        this.lastSummarizedMessageID = lastSummarizedId;
      });
    }

    const lastNMessages = preprocessedMessages.slice(-SUMMARIZE_MESSAGES_THRESHOLD);
    let messagesToAdd = lastNMessages.filter((message) => message.id > this.lastSummarizedMessageID);
    if (messagesToAdd.length > 0 && messagesToAdd[messagesToAdd.length - 1].role === 'user') {
      messagesToAdd.pop(); // Remove the last message if it's from a user
    }
    messagesToAdd.forEach((message) => {
      allMessagesText += `${this.formatMessageForSummary(message, false)},\n`;
    });

    const summary =
      allMessagesText.trim().length > 0
        ? `\n<conversation_history>\n[${allMessagesText}]\n</conversation_history>`
        : '';

    return summary;
  }

  formatMessageForSummary(message, removeCodeDiff = true) {
    let messageContent = message.content;
    let content = [];

    if (messageContent) {
      if (removeCodeDiff && messageContent && messageContent.includes('<changes_made_to_file>')) {
        messageContent = messageContent.replace(/<changes_made_to_file>[\s\S]*<\/changes_made_to_file>/g, '');
      }
      content.push({
        type: message.role === 'tool' ? 'tool_result' : 'text',
        content: messageContent,
      });
    }
    if (message.tool_calls) {
      message.tool_calls.forEach((toolCall) => {
        const toolCallContent = {
          type: 'tool_use',
          name: toolCall.function.name,
        };
        if (toolCall.function.arguments?.targetFile) {
          toolCallContent.targetFile = toolCall.function.arguments.targetFile;
        }
        content.push(toolCallContent);
      });
    }
    const role = message.role === 'tool' ? 'user' : message.role;
    const result = { role, content };
    return JSON.stringify(result, null, 2);
  }

  async summarizeMessages(messages) {
    const prompt = `
    Compress conversation_history below without losing important information.
    Compress with at least .75 or more compression ratio.
    
    Summarization rules:
     - Preserve roles, tool names, file names
     - Preserve all important information and code snippets
     - Leave messages with "user" role word for word without alteration
     - Make sure to remove any duplicate or similar actions or information that repeats
     - Compress terminal output and only leave most important information
     - Compress "content", only keep the most important information, shorten it as much as possible
     - Compress top (older) messages more, then lower (newer) messages. Compress long assistant messages into maximum 3 sentences
     - Keep plan for the task as is (can be more than 3 sentences), make sure to preserve all messages that have requirements fully

    Respond with compressed conversation_history without wrapping XML tag, in exactly the same JSON schema format as provided in the original.

    <conversation_history>
    [
      ${messages}
    ]
    </conversation_history>`;
    const format = {
      type: 'string',
      result: 'Summary of the conversation',
    };
    let summary = await chatController.backgroundTask.run({
      prompt,
      format,
      model: chatController.settings.selectedModel,
    });

    if (summary) {
      // Remove first "[" if present
      summary = summary.replace(/^\s*\[/, '');
      // Replace last "]" with "," if present
      summary = summary.replace(/\]\s*$/, ',');
      return summary;
    } else {
      return messages;
    }
  }

  async relevantSourceCodeInformation() {
    const projetState = await this.projectStateToText();
    const relevantFilesContents = await this.getRelevantFilesContents();

    return `${projetState}${relevantFilesContents}`;
  }

  async getRelevantFilesContents(withLineNumbers = true) {
    const relevantFileNames = await this.getListOfRelevantFiles();
    if (relevantFileNames.length === 0) {
      return '';
    }

    let fileContents = await this.getFileContents(relevantFileNames, withLineNumbers);
    fileContents = await this.reduceRelevantFilesContext(fileContents, relevantFileNames);

    return fileContents
      ? `\n\nCurrent content of the files (do not read these files again. Do not thank me for providing these files)\n<current_files_contents>${fileContents}\n</current_files_contents>`
      : '';
  }

  async getListOfRelevantFiles() {
    const chatInteractionFiles = await this.getChatInteractionFiles();
    const editedFiles = chatController.agent.projectController.getRecentModifiedFiles(this.lastEditedFilesTimestamp);
    this.lastEditedFilesTimestamp = Date.now();
    const newlyChangedFiles = [...new Set([...chatInteractionFiles, ...editedFiles])];
    await this.updateTaskContextFiles(newlyChangedFiles, true);

    return Object.keys(this.getEnabledTaskContextFiles());
  }

  async getChatInteractionFiles() {
    const chatFiles = this.chat.backendMessages
      .filter((message) => message.id > this.lastMessageIdForRelevantFiles)
      .filter((message) => message.role === 'assistant' && message.tool_calls)
      .flatMap((message) =>
        message.tool_calls
          .map((toolCall) => {
            const parsedArguments = chatController.agent.parseArguments(toolCall.function.arguments);
            return parsedArguments.hasOwnProperty('targetFile') ? parsedArguments.targetFile : undefined;
          })
          .filter((file) => file !== undefined),
      );
    const normalizedFilePaths = await Promise.all(chatFiles.map((file) => normalizedFilePath(file)));
    const chatInteractionFiles = normalizedFilePaths
      .filter((file) => fs.existsSync(file) && !fs.statSync(file).isDirectory())
      .reverse();
    this.lastMessageIdForRelevantFiles = this.backendMessages ? this.backendMessages.length - 1 : 0;

    return chatInteractionFiles;
  }

  async getFileContents(fileList, withLineNumbers = true) {
    if (fileList.length === 0) {
      return '';
    }

    const fileReadPromises = fileList.map((file) => this.readFile(file, withLineNumbers));
    const fileContents = await Promise.all(fileReadPromises);

    return fileList
      .map((file, index) => `\n<file_content file="${file}">\n${fileContents[index]}\n</file_content>`)
      .join('\n\n');
  }

  async reduceRelevantFilesContext(fileContents, fileList) {
    const fileContentTokenCount = getTokenCount(fileContents);
    const lastMessageId = this.chat.backendMessages.length - 1;
    if (
      fileContentTokenCount > MAX_RELEVANT_FILES_TOKENS &&
      fileList.length > MAX_RELEVANT_FILES_COUNT &&
      (lastMessageId - this.reduceRelevantFilesContextMessageId >= 10 || this.reduceRelevantFilesContextMessageId === 0)
    ) {
      this.reduceRelevantFilesContextMessageId = lastMessageId;
      const relevantFiles = await this.updateListOfRelevantFiles(fileContents);
      if (Array.isArray(relevantFiles)) {
        console.log('Reducing relevant files context', relevantFiles);
        relevantFiles.forEach((file, index) => {
          this.updateTaskContextFile(file, index < MAX_RELEVANT_FILES_COUNT);
        });
        return await this.getFileContents(this.getEnabledTaskContextFiles());
      }
    }

    return fileContents;
  }

  async updateListOfRelevantFiles(fileContents) {
    const messageHistory = [this.addTaskMessage(), await this.addSummaryOfMessages()];

    const prompt = `AI coding assistant is helping user with a task.
    Here is a summary of the conversation and what was done: ${messageHistory}
    
    The content of the files is too long to process. Out of the list of files below, select the most relevant files that the assistant still needs to know the contents of in order to complete the user's task.
    The files are:\n\n${fileContents}
    
    Include only required files, exclude files that are already processed or most likely not needed.
    Respond with an array of file paths exactly as they appeared (do not shorten or change file paths) in the list above, separated by commas.
    If all files are relevant, respond with a list of all files.
    Order the files by how much assistant still needs to know about them to complete the user's task, most important first.
    `;

    const format = {
      type: 'array',
      description: 'Array of relevant file paths',
      items: {
        type: 'string',
      },
    };

    const result = await chatController.backgroundTask.run({
      prompt,
      format,
      model: chatController.settings.selectedModel,
    });

    return result;
  }

  async readFile(filePath, withLineNumbers = true) {
    try {
      const stats = await fs.promises.stat(filePath);
      const isText = isTextFile(filePath);
      const isLarge = stats.size > MAX_FILE_SIZE;
      if (!isText || isLarge) {
        log(`Skipped file (${isText ? 'non-text' : 'too large'}): ${filePath}`);
        return isText ? 'File is too large to read' : 'File is not a text file, skipping reading';
      }
      const content = await fs.promises.readFile(filePath, 'utf8');
      return withLineNumbers ? this.addLineNumbers(content) : content;
    } catch (error) {
      log(`Error reading file ${filePath}:`, error);
      return `Error reading file: ${error}`;
    }
  }

  addLineNumbers(content) {
    const lines = content.split('\n');
    const paddedLines = lines.map((line, index) => {
      const lineNumber = (index + 1).toString().padStart(4, ' ');
      return `${lineNumber}|${line}`;
    });
    content = paddedLines.join('\n');
    return content;
  }

  addLastUserMessage(userMessage) {
    if (!userMessage) {
      userMessage = '';
    }

    return userMessage ? `<user>${userMessage}</user>\n` : '';
  }

  fromTemplate(content, placeholder, value) {
    const regex = new RegExp(placeholder, 'g');
    return content.replace(regex, value);
  }

  async projectStateToText() {
    await chatController.terminalSession.getCurrentDirectory();
    const dirName = path.basename(chatController.agent.currentWorkingDir);

    let projectStateText = '';
    projectStateText += `Current directory is '${dirName}'. The full path to this directory is '${chatController.agent.currentWorkingDir}'`;
    if (chatController.agent.projectController.currentProject) {
      const filesInFolder = await chatController.agent.projectController.getFolderStructure();
      if (filesInFolder) {
        projectStateText += `\nThe contents of this directory (excluding files from .gitignore): \n${filesInFolder}`;
      }
    }

    return projectStateText ? `\n<current_project_state>\n${projectStateText}\n</current_project_state>\n` : '';
  }
}

module.exports = ChatContextBuilder;
