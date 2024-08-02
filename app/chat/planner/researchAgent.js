const { tools } = require('./tools');
const { log } = require('../../utils');

const MAX_STEPS = 5;

const SYSTEM_MESSAGE_TEMPLATE = `
You are a research agent. Your task is to: "{description}".
Use the available tools to gather information.
Output your findings using the 'output' tool when research is complete or there is no more information to gather.
Items that you couldn't find or were not able to research should be marked as 'not found'.

Current directory is '{currentDirectory}'.

{additionalInformation}
`;

class ResearchAgent {
  constructor(chatController) {
    this.chatController = chatController;
    this.model = chatController.smallModel;
    this.projectStructureCache;
  }

  async executeResearch(researchItem, taskDescription) {
    console.log('executeResearch', researchItem, taskDescription);
    this.taskDescription = taskDescription;
    const messages = await this.initializeMessages(researchItem);
    const availableTools = tools(researchItem.outputFormat);
    const formattedTools = availableTools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));

    for (let i = 0; i < MAX_STEPS; i++) {
      log('ResearchAgent:');
      const callParams = {
        messages,
      };

      if (i === MAX_STEPS - 1) {
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
          console.log('executeResearch: result', result);
          return result;
        }
      } else if (response.content) {
        messages.push({
          role: 'assistant',
          content: response.content,
        });
      }
    }
    console.log('executeResearch: no result');
    return null;
  }

  async initializeMessages(researchItem) {
    let additionalInformation = '';

    const currentDirectory = await this.chatController.terminalSession.getCurrentDirectory();
    if (researchItem.additionalInformation) {
      if (typeof this[researchItem.additionalInformation] === 'function') {
        additionalInformation = await this[researchItem.additionalInformation]();
      } else {
        console.error(
          'ResearchAgent: additionalInformation function not available',
          researchItem.additionalInformation,
        );
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
    if (this.projectStructureCache) {
      return this.projectStructureCache;
    }
    this.projectStructureCache = `
    <projectStructure>
    ${await this.chatController.agent.projectController.getFolderStructure(50, 4)}
    </projectStructure>`;
    return this.projectStructureCache;
  }

  getTaskDescription() {
    return `<taskDescription>\n${this.taskDescription}\n</taskDescription>`;
  }
}

module.exports = ResearchAgent;
