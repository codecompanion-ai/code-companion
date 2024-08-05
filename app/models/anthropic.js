const Anthropic = require('@anthropic-ai/sdk');
const { log } = require('../utils');

const MAX_RETRIES = 5;

class AnthropicModel {
  constructor({ model, apiKey, baseUrl, streamCallback, chatController }) {
    this.model = model;
    this.chatController = chatController;
    const config = {
      apiKey: apiKey,
      maxRetries: MAX_RETRIES,
    };
    this.options = {};
    this.maxTokens = 4096;
    if (model === 'claude-3-5-sonnet-20240620') {
      this.maxTokens = 8192;
      this.options.headers = { 'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15' };
    }
    if (baseUrl) {
      config.baseURL = baseUrl;
    }
    this.client = new Anthropic(config);
    this.streamCallback = streamCallback;
  }

  async call({ messages, model, tool = null, tools = null, temperature = 0.0, tool_choice = null }) {
    let response;
    const system = messages.find((message) => message.role === 'system');
    const callParams = {
      model: model || this.model,
      system: system ? system.content : null,
      messages: this.formatUserMessages(messages),
      temperature,
      max_tokens: this.maxTokens,
    };
    if (tool_choice) {
      callParams.tool_choice = tool_choice;
    }
    if (tool !== null || tool_choice === 'required') {
      response = await this.toolUse(callParams, [tool, ...(tools || [])].filter(Boolean), tool_choice);
    } else {
      callParams.tools = tools.map((tool) => this.anthropicToolFormat(tool));
      response = await this.stream(callParams);
    }
    return response;
  }

  formatUserMessages(messages) {
    const userMessages = messages.filter((message) => message.role === 'user');
    return userMessages.map((message) => {
      if (Array.isArray(message.content)) {
        return {
          role: 'user',
          content: message.content.map((item) => {
            if (item.type === 'image_url') {
              return this.formatImageUrlContent(item);
            }
            return item;
          }),
        };
      }
      // If content is not an array, return the message as is
      return message;
    });
  }

  formatImageUrlContent(item) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: item.image_url.media_type,
        data: item.image_url.url.split(',')[1], // Remove the "data:image/jpeg;base64," prefix
      },
    };
  }

  async stream(callParams) {
    log('Calling model API:', callParams);
    let message = '';
    this.options.signal = this.chatController.abortController.signal;
    const stream = this.client.messages.stream(callParams, this.options).on('text', (text) => {
      message += text;
      this.streamCallback(message);
    });

    const finalMessage = await stream.finalMessage();
    log('Raw response', finalMessage);
    const usage = finalMessage.usage.input_tokens + finalMessage.usage.output_tokens;
    this.chatController.updateUsage(usage, callParams.model);
    return {
      content: finalMessage.content.find((item) => item.type === 'text')?.text || '',
      tool_calls: this.formattedToolCalls(finalMessage.content),
    };
  }

  async toolUse(callParams, tools, toolChoice) {
    callParams.tools = tools.map((tool) => this.anthropicToolFormat(tool));
    callParams.tool_choice = toolChoice === 'required' ? { type: 'any' } : { type: 'tool', name: tools[0].name };
    this.options.signal = this.chatController.abortController.signal;

    log('Calling model API:', callParams);
    const response = await this.client.messages.create(callParams, this.options);
    log('Raw response', response);
    const usage = response.usage.input_tokens + response.usage.output_tokens;
    this.chatController.updateUsage(usage, callParams.model);
    return {
      content: response.content.filter((item) => item.type === 'text')?.[0]?.text || '',
      tool_calls: this.formattedToolCalls(response.content),
    };
  }

  formattedToolCalls(content) {
    const toolCalls = content.filter((item) => item.type === 'tool_use');
    if (!toolCalls) return null;

    let parsedToolCalls = [];
    for (const toolCall of toolCalls) {
      parsedToolCalls.push({
        function: {
          name: toolCall.name,
          arguments: toolCall.input,
        },
      });
    }
    return parsedToolCalls;
  }

  anthropicToolFormat(tool) {
    const { parameters, ...rest } = tool;
    return {
      ...rest,
      input_schema: parameters,
    };
  }

  abort() {
    this.chatController.abortController.abort();
    this.chatController.abortController = new AbortController();
  }
}

module.exports = AnthropicModel;
