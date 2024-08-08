const path = require('path');
const fs = require('graceful-fs');
const GoogleSearch = require('./google_search');
const { contextualCompress } = require('./contextual_compressor');
const axios = require('axios');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const { normalizedFilePath, openFileLink } = require('../utils');
const { generateDiff } = require('./code_diff');

const toolDefinitions = [
  {
    name: 'browser',
    description:
      'Allows to interact with the browser, Use it to open webpage for a user to see, to refresh the page after making changes or to capture console output or a screenshot of the page',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: `Use full URL, including protocol (e.g., http://, https://). For local files like index.html, use file:// protocol and absolute file path.
            Always use data: URL to create visualizations, charts, etc. Do not create an html file for a visualization.`,
        },
        include_screenshot: {
          type: 'boolean',
          description:
            'Set to true only if you or the user need a screenshot of the page. Avoid taking a screenshot unless some problem need to be solved',
          default: false,
        },
        taskPlanStepId: { type: 'integer' },
      },
    },
    executeFunction: browser,
    enabled: true,
    approvalRequired: false,
  },
  {
    name: 'create_or_overwrite_file',
    description: 'Create or overwrite a file with new content',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
          description: 'File path',
        },
        createText: {
          type: 'string',
          description: `Output the entire completed source code for a file in a single step. Always use correct indentation and new lines.`,
        },
        taskPlanStepId: { type: 'integer' },
      },
    },
    executeFunction: createFile,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'replace_code',
    description: 'Replace a portion of a file with new content',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
          description: 'Path to the file to be modified.',
        },
        startLineNumber: {
          type: 'integer',
          description: 'The line number where the replacement should start (inclusive).',
        },
        endLineNumber: {
          type: 'integer',
          description: 'The line number where the replacement should end (inclusive).',
        },
        replaceWith: {
          type: 'string',
          description:
            'New content to replace the specified lines. Ensure correct indentation for each new line of code inserted.',
        },
        taskPlanStepId: { type: 'integer' },
      },
    },
    executeFunction: replaceInFile,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'read_file',
    description: 'Read files. Do not read files that are listed in the <relevant_files_contents> section.',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
        },
        taskPlanStepId: { type: 'integer' },
      },
    },
    executeFunction: readFile,
    enabled: true,
    approvalRequired: false,
  },
  {
    name: 'run_shell_command',
    description: 'Run a single shell command suitable for the {shellType} shell',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'Single shell command to run. DO NOT combine multiple shell commands into a single command with "&&"',
        },
        background: {
          type: 'boolean',
          description:
            'When set to false, will hang until command finished executing. Set to true always when you need to run a webserver right before opening a browser',
          default: false,
        },
        taskPlanStepId: { type: 'integer' },
      },
    },
    executeFunction: shell,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'search',
    description: 'Semantic search that can perform codebase search or Google search',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['codebase', 'google'],
          description:
            'Type of search to perform. Use codebase to search existing code in project with many files. Use Google only to find latest information or when asked by user. Do not use Google to search for best practices, code examples, libraries, etc.',
        },
        query: {
          type: 'string',
          description: `Long, descriptive natural language search query`,
        },
        taskPlanStepId: { type: 'integer' },
      },
    },
    executeFunction: unifiedSearch,
    enabled: true,
    requiresApproval: false,
  },
  {
    name: 'update_task_plan',
    description: 'Update the task plan.Always provide all steps in the task plan',
    parameters: {
      type: 'object',
      properties: {
        updatedTaskPlan: {
          type: 'array',
          description: 'The updated task plan array',
          items: {
            type: 'object',
            properties: {
              step_title: { type: 'string' },
              step_detailed_description: { type: 'string' },
              completed: { type: 'boolean' },
            },
          },
        },
      },
    },
    executeFunction: updateTaskPlan,
    enabled: true,
    approvalRequired: false,
  },
];

async function previewMessageMapping(functionName, args) {
  let codeDiff = '';
  let fileLink = '';
  let browserMessage = '';

  if (functionName === 'create_or_overwrite_file') {
    const newFile = await normalizedFilePath(args.targetFile);
    if (fs.existsSync(newFile)) {
      const oldContent = fs.readFileSync(newFile, 'utf8');
      codeDiff = generateDiff(oldContent, args.createText, newFile, newFile);
    }
  }

  if (functionName === 'replace_code') {
    const { newContent, oldContent } = await codeAfterReplace(args);
    codeDiff = generateDiff(oldContent, newContent, args.targetFile, args.targetFile);
  }

  if (args.targetFile) {
    fileLink = await openFileLink(args.targetFile);
  }

  const mapping = {
    browser: {
      message: '',
      code: '',
    },
    create_or_overwrite_file: {
      message: `Creating a file ${args.targetFile}`,
      code: codeDiff ? `\n\`\`\`diff\n${codeDiff}\n\`\`\`` : `\n\`\`\`\n${args.createText}\n\`\`\``,
    },
    read_file: {
      message: '',
      code: '',
    },
    replace_code: {
      message: `Updating code in ${fileLink}:`,
      code: `\n\`\`\`diff\n${codeDiff}\n\`\`\``,
    },
    run_shell_command: {
      message: 'Executing shell command:',
      code: `\n\n\`\`\`console\n${args.command}\n\`\`\``,
    },
    search: {
      message: `Searching ${args.type} for '${args.query}'`,
      code: '',
    },
    update_task_plan: {
      message: 'Updating the task plan',
      code: '',
    },
  };
  return mapping[functionName];
}

async function browser({ include_screenshot, url, taskPlanStepId }) {
  let assistantScreenshotMessage = '';

  viewController.updateLoadingIndicator(true, 'Waiting for the page to load...');
  viewController.activateTab('browser-tab');
  const consoleOutput = await chatController.browser.loadUrl(url);

  if (include_screenshot) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await chatController.browser.handleSreenshot();
    assistantScreenshotMessage = `\nScreenshot of the webpage was taken and attached in the user message`;
  }
  chatController.chat.addFrontendMessage('function', 'Opened in browser');
  completeTaskPlanStep(taskPlanStepId);
  return `Browser opened ${url.startsWith('data:') ? 'data URL to show visualization' : url}.\n<console_output>${consoleOutput}</console_output>${assistantScreenshotMessage}`;
}

async function createFile({ targetFile, createText, taskPlanStepId }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await normalizedFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  fs.writeFileSync(filePath, createText);
  completeTaskPlanStep(taskPlanStepId);
  chatController.chat.addFrontendMessage('function', `File ${await openFileLink(filePath)} created successfully`);
  return `File '${targetFile}' created successfully`;
}

async function replaceInFile({ targetFile, startLineNumber, endLineNumber, replaceWith, taskPlanStepId }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await normalizedFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    const doesntExistMessage = `File with filepath '${targetFile}' does not exist`;
    chatController.chat.addFrontendMessage('function', doesntExistMessage);
    return doesntExistMessage;
  }

  if (startLineNumber < 1) {
    const invalidRangeMessage = `Invalid line range: ${startLineNumber}-${endLineNumber}`;
    chatController.chat.addFrontendMessage('function', invalidRangeMessage);
    return invalidRangeMessage;
  }

  const { newContent, oldContent } = await codeAfterReplace({
    targetFile,
    startLineNumber,
    endLineNumber,
    replaceWith,
  });
  const codeDiff = generateDiff(oldContent, newContent, filePath, filePath);
  fs.writeFileSync(filePath, newContent);
  const successMessage = `File ${await openFileLink(filePath)} updated successfully.`;
  chatController.chat.addFrontendMessage('function', successMessage);
  completeTaskPlanStep(taskPlanStepId);
  return `File ${filePath} updated successfully.\n<changes_made_to_file>${codeDiff}</changes_made_to_file>`;
}

async function codeAfterReplace({ targetFile, startLineNumber, endLineNumber, replaceWith }) {
  const filePath = await normalizedFilePath(targetFile);
  let oldContent = fs.readFileSync(filePath, 'utf8');
  const lines = oldContent.split('\n');
  const beforeLines = lines.slice(0, startLineNumber - 1);
  const afterLines = lines.slice(endLineNumber);
  const newContent = [...beforeLines, replaceWith, ...afterLines].join('\n');

  return {
    newContent,
    oldContent,
  };
}

async function readFile({ targetFile, taskPlanStepId }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await normalizedFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    const doesntExistMessage = `File with filepath '${targetFile}' does not exist`;
    chatController.chat.addFrontendMessage('function', doesntExistMessage);
    return doesntExistMessage;
  }

  chatController.chat.addFrontendMessage('function', `Read ${await openFileLink(filePath)} file`);

  return `File "${filePath}" was read.`;
}

async function shell({ command, background, taskPlanStepId }) {
  viewController.updateLoadingIndicator(true, 'Executing shell command ...  (click Stop to cancel or use Ctrl+C)');
  let commandResult;
  if (background === true) {
    chatController.terminalSession.executeShellCommand(command);
    completeTaskPlanStep(taskPlanStepId);
    return 'Command started in the background';
  } else {
    commandResult = await chatController.terminalSession.executeShellCommand(command);
    completeTaskPlanStep(taskPlanStepId);
  }
  // Preserve first 5 lines and last 95 lines if more than 100 lines
  const lines = commandResult.split('\n');
  if (lines.length > 100) {
    const firstFive = lines.slice(0, 5);
    const lastNinetyFive = lines.slice(-95);
    commandResult = [...firstFive, '(some command output omitted)...', ...lastNinetyFive].join('\n');
  }
  if (commandResult.length > 5000) {
    commandResult = commandResult.substring(commandResult.length - 5000);
    commandResult = `(some command output omitted)...\n${commandResult}`;
  }
  commandResult = commandResult.replace(command, '');
  commandResult = `Command executed: '${command}'\nOutput:\n'${commandResult ? commandResult : 'command executed successfully. Terminal command output was empty.'}'`;
  viewController.updateLoadingIndicator(false);

  return commandResult;
}

async function searchCode({ query, rerank = true, count = 10 }) {
  let frontendMessage = '';
  let backendMessage = '';
  let uniqueFiles = [];

  let results = await chatController.agent.projectController.searchEmbeddings({ query, count, rerank });

  if (results && results.length > 0) {
    const files = results.map((result) => result.filePath);
    uniqueFiles = [...new Set(files)];
    frontendMessage = `Checked ${uniqueFiles.length} files:<br>${await Promise.all(uniqueFiles.map(async (filePath) => await openFileLink(filePath))).then((fileLinks) => fileLinks.join('<br>'))}`;
    backendMessage = results.map((result) => result.fileContent).join('\n\n');
    chatController.chat.addFrontendMessage('function', frontendMessage);
    return backendMessage;
  }

  const noResultsMessage = `No results found`;
  chatController.chat.addFrontendMessage('function', noResultsMessage);
  return noResultsMessage;
}

async function googleSearch({ query }) {
  const searchAPI = new GoogleSearch();
  const googleSearchResults = await searchAPI.singleSearch(query);

  const promises = googleSearchResults.map(async (result) => {
    const content = await fetchAndParseUrl(result.link);
    if (content) {
      result.content = JSON.stringify(content);
    }
    return result;
  });
  let results = await Promise.all(promises);
  results = results.filter((result) => result.content);
  let compressedResult;
  let firstCompressedResult;

  for (const result of results) {
    compressedResult = await contextualCompress(query, result.content);
    if (!firstCompressedResult) firstCompressedResult = compressedResult;

    // return first result if it meets the condition
    if (await checkIfAnswersQuery(query, compressedResult)) {
      chatController.chat.addFrontendMessage(
        'function',
        `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`,
      );
      return JSON.stringify(compressedResult);
    }
  }

  // Return first compressed result if no result meets the condition
  chatController.chat.addFrontendMessage(
    'function',
    `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`,
  );
  return JSON.stringify(firstCompressedResult);
}

async function fetchAndParseUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537',
      },
      timeout: 5000,
    });
    const html = response.data;
    const doc = new JSDOM(html, { url: url }).window.document;
    const reader = new Readability(doc);
    const article = reader.parse();
    return article.textContent;
  } catch (error) {
    return;
  }
}

async function searchURL({ query, url }) {
  const content = await fetchAndParseUrl(url);
  if (!content) {
    return {
      frontendMessage: `Could not fetch content from ${url}`,
      backendMessage: `Could not fetch content from ${url}`,
    };
  }
  const compressedResult = await contextualCompress(query, content);
  return {
    frontendMessage: `Checked website:<br><a href="${url}" class="text-truncate ms-2">${url}</a>`,
    backendMessage: JSON.stringify(compressedResult),
  };
}

async function checkIfAnswersQuery(query, searchResult) {
  const format = {
    type: 'boolean',
    result: 'true or false',
  };
  const prompt = `
I am searching the web for this query: '${query}'
The search result is:

${JSON.stringify(searchResult)}

Does this result answer the search query question?
Respond with a boolean value: "true" or "false"`;
  const result = await chatController.backgroundTask.run({ prompt, format });

  return result !== false;
}

async function unifiedSearch({ type, query, taskPlanStepId }) {
  switch (type) {
    case 'codebase':
      const codebaseResult = await searchCode({ query });
      completeTaskPlanStep(taskPlanStepId);
      return `Codebase search result for "${query}":\n${codebaseResult}`;
    case 'google':
      const result = await googleSearch({ query });
      completeTaskPlanStep(taskPlanStepId);
      return `Google search result for "${query}":\n${result}`;
    default:
      return 'Invalid search type specified.';
  }
}

function respondTargetFileNotProvided() {
  chatController.chat.addFrontendMessage('function', 'File name was not provided.');

  return 'Please provide a target file name in a correct format.';
}

function getEnabledTools(filterFn) {
  const shellType = chatController.terminalSession.shellType;
  return toolDefinitions.filter(filterFn).map(({ name, description, parameters }) => ({
    name,
    description: description.replace('{shellType}', shellType),
    parameters,
  }));
}

function allEnabledTools() {
  return getEnabledTools((tool) => tool.enabled);
}

function allEnabledExcept(toolNames) {
  return allEnabledTools().filter((tool) => !toolNames.includes(tool.name));
}

function planningTools() {
  const tools = getEnabledTools((tool) => tool.enabled && !tool.approvalRequired);
  const taskPlanningDoneTool = toolDefinitions.find((tool) => tool.name === 'task_planning_done');
  tools.push({
    name: taskPlanningDoneTool.name,
    description: taskPlanningDoneTool.description,
    parameters: taskPlanningDoneTool.parameters,
  });

  return tools;
}

function completeTaskPlanStep(taskPlanStepId) {
  const zeroBasedIndex = taskPlanStepId - 1;
  const taskPlan = chatController.chat.taskPlan;
  if (taskPlan) {
    for (let i = 0; i <= zeroBasedIndex; i++) {
      if (taskPlan[i]) {
        taskPlan[i].completed = true;
      }
    }
    chatController.taskTab.renderTaskPlan();
  }
}

function updateTaskPlan({ updatedTaskPlan }) {
  chatController.chat.taskPlan = updatedTaskPlan;
  chatController.taskTab.renderTaskPlan();
  return 'Task plan updated successfully';
}

module.exports = {
  allEnabledTools,
  allEnabledExcept,
  planningTools,
  toolDefinitions,
  previewMessageMapping,
  completeTaskPlanStep,
  updateTaskPlan,
};
