const { log } = require('./utils');

const SYSTEM_PROMPT = 'Provide result back in a tool call';

class BackgroundTask {
  //  format example:
  //   {
  //       "type": "string",
  //       "description": "The city and country, eg. San Francisco, USA"
  //   }

  constructor(chatController) {
    this.messages = [];
    this.client = chatController.smallModel;
    this.chatController = chatController;
  }

  async run({ prompt, format }) {
    if (!this.client) {
      this.chatController.chat.addFrontendMessage(
        'error',
        'No API key found for small model. Please add your API key under <a href="#" onclick="document.getElementById(\'settingsToggle\').click(); return false;">Settings</a>',
      );
      return;
    }

    try {
      const messages = this.buildMessages(prompt);
      const tool = this.buildTool(format);
      log('BackgroundTask:');
      const response = await this.client.call({ messages, tool });
      return response.tool_calls[0].function.arguments.result;
    } catch (error) {
      console.error(error);
    }
  }

  buildMessages(prompt) {
    return [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
  }

  buildTool(format) {
    return {
      name: 'respond',
      parameters: {
        type: 'object',
        properties: {
          result: format,
        },
      },
    };
  }
}

module.exports = BackgroundTask;
