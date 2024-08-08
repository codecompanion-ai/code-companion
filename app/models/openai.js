const { OpenAI } = require('openai');
const { log, getTokenCount } = require('../utils');

const MAX_RETRIES = 5;

class OpenAIModel {
  constructor({ model, apiKey, baseUrl, streamCallback, chatController, defaultHeaders }) {
    this.model = model;
    this.chatController = chatController;
    const config = {
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: MAX_RETRIES,
    };
    if (baseUrl) {
      config.baseURL = baseUrl;
    }
    if (defaultHeaders) {
      config.defaultHeaders = defaultHeaders;
    }
    this.client = new OpenAI(config);
    this.streamCallback = streamCallback;
  }

  async call({ messages, model, tool = null, tools = null, temperature = 0.0, tool_choice = null }) {
    let response;
    const callParams = {
      model: model || this.model,
      messages,
      temperature,
    };
    if (tool_choice) {
      callParams.tool_choice = tool_choice;
    }
    if (tool !== null || tool_choice === 'required') {
      response = await this.toolUse(callParams, [tool, ...(tools || [])].filter(Boolean), tool_choice);
    } else {
      callParams.tools = tools.map((tool) => this.openAiToolFormat(tool));
      response = await this.stream(callParams);
    }
    return response;
  }

  async stream(callParams) {
    callParams.stream = true;
    log('Calling model API:', callParams);
    const stream = await this.client.chat.completions.create(callParams, {
      signal: this.chatController.abortController.signal,
    });

    let fullContent = '';
    let toolCalls = [];

    for await (const part of stream) {
      if (part.choices[0]?.delta?.content) {
        fullContent += part.choices[0].delta.content;
        this.streamCallback(fullContent);
      }
      if (part.choices[0]?.delta?.tool_calls) {
        toolCalls = this.accumulateToolCalls(toolCalls, part.choices[0].delta.tool_calls);
      }
    }
    log('Raw response', fullContent, toolCalls);
    if (!fullContent && toolCalls.length === 0) {
      throw new Error('Empty response from model. Please try again.');
    }
    const usage = getTokenCount(callParams.messages) + getTokenCount(fullContent);
    this.chatController.updateUsage(usage, callParams.model);
    return {
      content: fullContent,
      tool_calls: this.formattedToolCalls(toolCalls),
    };
  }

  accumulateToolCalls(existingCalls, newCalls) {
    newCalls.forEach((newCall) => {
      const index = newCall.index;
      if (!existingCalls[index]) {
        existingCalls[index] = { function: { name: '', arguments: '' } };
      }
      if (newCall.function?.name) {
        existingCalls[index].function.name = newCall.function.name;
      }
      if (newCall.function?.arguments) {
        existingCalls[index].function.arguments += newCall.function.arguments;
      }
    });
    return existingCalls;
  }

  async toolUse(callParams, tools, toolChoice) {
    callParams.tools = tools.map((tool) => this.openAiToolFormat(tool));
    callParams.tool_choice = toolChoice ? toolChoice : { type: 'function', function: { name: tools[0].name } };
    log('Calling model API:', callParams);
    const chatCompletion = await this.client.chat.completions.create(callParams, {
      signal: this.chatController.abortController.signal,
    });
    log('Raw response', chatCompletion);
    const usage = chatCompletion.usage?.prompt_tokens + chatCompletion.usage?.completion_tokens;
    this.chatController.updateUsage(usage, callParams.model);
    return {
      content: chatCompletion.choices[0].message.content,
      tool_calls: this.formattedToolCalls(chatCompletion.choices[0].message.tool_calls),
    };
  }

  formattedToolCalls(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return null;

    return toolCalls
      .filter((call) => call !== null)
      .map((toolCall) => ({
        function: {
          name: toolCall.function.name,
          arguments: this.parseJSONSafely(toolCall.function.arguments),
        },
      }));
  }

  parseJSONSafely(str) {
    if (typeof str === 'object' && str !== null) {
      return str; // Already a JSON object, return as is
    }

    try {
      return JSON.parse(str);
    } catch (e) {
      console.error('Failed to parse JSON:', str);
      throw new Error('Failed to parse response from model, invalid response format. Click Retry to try again.');
    }
  }

  openAiToolFormat(tool) {
    return {
      type: 'function',
      function: tool,
    };
  }

  abort() {
    this.chatController.abortController.abort();
    this.chatController.abortController = new AbortController();
  }
}

module.exports = OpenAIModel;
