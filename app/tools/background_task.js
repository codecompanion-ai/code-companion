const SYSTEM_PROMPT = 'Respond with JSON in the specified format below: ';

const DEFAULT_MODEL = 'gpt-3.5-turbo-1106';
const MODELS_WITH_JSON_SUPPORT = ['gpt-3.5-turbo-1106', 'gpt-4-1106-preview'];

class BackgroundTask {
  constructor(chatController) {
    this.messages = [];
    this.client = chatController.openai;
    this.chatController = chatController;
  }

  // added a utility function to limit the length of the prompt by a specific limit
  limitPromptLength(prompt, limit = 2048) {
    if(prompt.length > limit){
      return prompt.substring(0, limit) + '...';
    }
    return prompt;
  }

  async run({ prompt, format, temperature = 1.0 }) {
    try {
      // limit the length of the prompt before sending to the API
      const limitedPrompt = this.limitPromptLength(prompt);

      const messages = this.buildMessages(format, limitedPrompt);
      const config = {
        messages: messages,
        temperature: temperature,
      };

      config.model = this.chatController.settings.baseUrl ? this.chatController.selectedModel : DEFAULT_MODEL;
      if (MODELS_WITH_JSON_SUPPORT.includes(config.model)) {
        config.response_format = { type: 'json_object' };
      }

      const chatCompletion = await this.client.chat.completions.create(config);
      const response = JSON.parse(chatCompletion.choices[0].message.content).result;
      this.log(messages, response);
      return response;
    } catch (error) {
      console.error(error);
    }
  }

  buildMessages(format, prompt) {
    return [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n${JSON.stringify({ result: format })}`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
  }

  log(messages, response) {
    if (isDevelopment) console.log('BackgroundTask: ' + JSON.stringify(messages) + ' ' + JSON.stringify(response));
  }
}

module.exports = BackgroundTask;