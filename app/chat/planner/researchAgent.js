const { tools } = require('./tools');
const { log } = require('../../utils');

const MAX_STEPS = 5;

const SYSTEM_MESSAGE_TEMPLATE = `
{description}

Use the available tools to gather information.
Output your findings using the 'output' tool when done or there is no more information to gather.
Respond with 'null' for items that you couldn't find or were not able to research.

Current directory is '{currentDirectory}'.

{additionalInformation}
`;

class ResearchAgent {
  constructor(chatController) {
    this.chatController = chatController;
    this.projectStructureCache;
  }

  async executeResearch(researchItem, taskDescription, taskContext) {
    if (researchItem.cache && this.getCache(researchItem.name)) {
      return this.getCache(researchItem.name);
    }

    this.taskDescription = taskDescription;
    this.taskContext = taskContext;

    this.model = researchItem.model === 'large' ? chatController.model : chatController.smallModel;
    const messages = await this.initializeMessages(researchItem);
    const availableTools = tools(researchItem.outputFormat);
    const formattedTools = availableTools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
    const maxSteps = researchItem.maxSteps || MAX_STEPS;

    for (let i = 0; i < maxSteps; i++) {
      log('ResearchAgent:');
      const callParams = {
        messages,
      };

      if (i === maxSteps - 1) {
        // For final step, force output tool
        const outputTool = formattedTools.find((tool) => tool.name === 'output');
        callParams.tool = outputTool;
      } else {
        callParams.tools = formattedTools;
        callParams.tool_choice = 'required';
      }
      const response = await this.model.call(callParams);
      if (response.tool_calls) {
        const result = await this.handleToolCalls(response.tool_calls, availableTools, messages);
        if (result) {
          if (researchItem.cache) {
            this.setCache(researchItem.name, result);
          }
          return result;
        }
      } else if (response.content) {
        messages.push({
          role: 'assistant',
          content: response.content,
        });
      }
    }
    return null;
  }

  async initializeMessages(researchItem) {
    let additionalInformation = '';

    const currentDirectory = await this.chatController.terminalSession.getCurrentDirectory();
    if (researchItem.additionalInformation) {
      if (Array.isArray(researchItem.additionalInformation)) {
        additionalInformation = await Promise.all(researchItem.additionalInformation.map((item) => this[item]()));
        additionalInformation = additionalInformation.join('\n\n');
      } else {
        additionalInformation = await this[researchItem.additionalInformation]();
      }
    }

    const content = SYSTEM_MESSAGE_TEMPLATE.replace('{description}', researchItem.description)
      .replace('{currentDirectory}', currentDirectory)
      .replace('{additionalInformation}', additionalInformation);

    const systemMessage = {
      role: 'system',
      content,
    };

    const userMessage = {
      role: 'user',
      content: researchItem.prompt,
    };

    return [systemMessage, userMessage];
  }

  async handleToolCalls(toolCalls, availableTools, messages) {
    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'output') {
        return toolCall.function.arguments;
      } else {
        await this.executeToolAndUpdateMessages(toolCall, availableTools, messages);
      }
    }
  }

  async executeToolAndUpdateMessages(toolCall, availableTools, messages) {
    const tool = availableTools.find((t) => t.name === toolCall.function.name);
    if (tool && tool.executeFunction) {
      const result = await tool.executeFunction(toolCall.function.arguments);
      messages.push({
        role: 'assistant',
        content: null,
        function_call: {
          name: toolCall.function.name,
          arguments: JSON.stringify(toolCall.function.arguments),
        },
      });
      messages.push({
        role: 'function',
        name: toolCall.function.name,
        content: result,
      });
    }
  }

  async projectStructure() {
    return `<projectStructure>\n${await this.chatController.agent.projectController.getFolderStructure(50, 4)}\n</projectStructure>`;
  }

  getTaskDescription() {
    return `<taskDescription>\n${this.taskDescription}\n</taskDescription>`;
  }

  additionalContext() {
    return `<additionalContext>\n${this.chatController.chat.taskContext}\n</additionalContext>`;
  }

  async taskRelevantFilesContent() {
    return await this.chatController.chat.chatContextBuilder.getRelevantFilesContents();
  }

  potentiallyRelevantFiles() {
    const potentiallyRelevantFiles = this.taskContext['task_relevant_files']?.potentially_relevant_files || [];
    if (potentiallyRelevantFiles.length === 0) return '';

    return `<potentiallyRelevantFiles>\n${potentiallyRelevantFiles.join('\n')}\n</potentiallyRelevantFiles>`;
  }

  setCache(key, value) {
    const projectKey = this.chatController.agent.projectController.currentProject.path + '-' + key;
    cache.set(projectKey, value);
  }

  getCache(key) {
    const projectKey = this.chatController.agent.projectController.currentProject.path + '-' + key;
    return cache.get(projectKey);
  }
}

module.exports = ResearchAgent;
