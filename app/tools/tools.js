const path = require('path');
const fs = require('graceful-fs');
const GoogleSearch = require('./google_search');
const { contextualCompress } = require('./contextual_compressor');
const axios = require('axios');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

const toolDefinitions = [
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
          description: `Output the entire completed source code for a file in a single step. The code should be fully functional, with no placeholders. Always use correct indentation and new lines.`,
        },
      },
      required: ['targetFile', 'createText'],
    },
    executeFunction: createFile,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'replace_string_in_file',
    description: 'Replace a string (or code) with another string, the rest of the file content will remain the same.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              findString: {
                type: 'string',
                description: 'Use large unique string or entire code block that exists in the last content of the file and need to be replaced. Do not use regex. Must include all leading spaces.',
              },
              replaceWith: {
                type: 'string',
                description: 'New string that will replace findString. Calculate then insert correct identation for each new line of code insterted.',
              },
              replaceAll: {
                type: 'boolean',
                description: 'Indicates if all occurrences of findString should be replaced in the file or one, use "true" - to replace all, false - to replace a single occurrence (more preferred).',
              },
            },
            required: ['targetFile', 'findString', 'replaceWith', 'replaceAll'],
          },
        },
        targetFile: {
          type: 'string',
          description: 'File path',
        },
      },
      required: ['items'],
    },
    executeFunction: replaceInFile,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'read_files',
    description: 'Read files contents',
    parameters: {
      type: 'object',
      properties: {
        targetFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: "Array of valid file paths, can't be a directory path.",
        },
      },
      required: ['targetFiles'],
    },
    executeFunction: readFile,
    enabled: true,
    approvalRequired: false,
  },
  {
    name: 'run_shell_command',
    description: 'Run shell command',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: `Example: 'ls -la'`,
        },
      },
      required: ['command'],
    },
    executeFunction: shell,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'search_code',
    description: 'Semantic code search in project code for relevant snippets of code',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `Descriptive natural language search query. If user asked to search code, use entire unmodified user query as a search query.`,
        },
      },
      required: ['query'],
    },
    executeFunction: searchCode,
    enabled: true,
    requiresApproval: false,
  },
  {
    name: 'search_google',
    description: `Search Google`,
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Long search queries. Provide at least three.',
        },
      },
      required: ['queries'],
    },
    executeFunction: googleSearch,
    enabled: true,
    requiresApproval: true,
  },
  {
    name: 'search_url',
    description: `Search content of a webpage for a relevant information`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `Descriptive natural language search query.`,
        },
        url: {
          type: 'string',
          description: `URL of the webpage to search.`,
        },
      },
      required: ['query', 'url'],
    },
    executeFunction: searchURL,
    enabled: false,
    requiresApproval: true,
  },
];

const previewMessageMapping = (args) => ({
  create_or_overwrite_file: {
    message: `Creating a file ${args.targetFile}`,
    code: `\`\`\`\n${args.createText}\n\`\`\``,
  },
  replace_string_in_file: {
    message: `Updating ${args.targetFile}`,
    code: args.items
      ? args.items.reduce((acc, change) => {
          return acc + `\n\nReplacing:\n\`\`\`\n${change.findString}\n\`\`\`` + `\n\nWith:\n\`\`\`\n${change.replaceWith}\n\`\`\``;
        }, '')
      : '',
  },
  read_files: {
    message: `Reading files ${args.targetFiles ? args.targetFiles.join(', ') : 'No files specified'}`,
    code: '',
  },
  run_shell_command: {
    message: 'Executing shell command:',
    code: `\n\n\`\`\`console\n${args.command}\n\`\`\``,
  },
  search_code: {
    message: `Searching project code for: '${args.query}'`,
    code: '',
  },
  search_google: {
    message: `Searching web for: '${args.queries ? args.queries[0] : 'No query specified'}'`,
    code: '',
  },
  search_url: {
    message: `Fetching webpage`,
    code: '',
  },
});

async function createFile({ targetFile, createText }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await getFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  fs.writeFileSync(filePath, createText);
  chatController.chat.addFrontendMessage('function', `File ${await openFileLink(filePath)} created successfully`);

  return `File '${targetFile}' created successfully`;
}

async function replaceInFile({ targetFile, items }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await getFilePath(targetFile);
  let result = {};
  if (!fs.existsSync(filePath)) {
    result = {
      targetFile,
      content: `Update failed. '${targetFile}' (absolute path is '${filePath}') is not a valid file path. Please use a valid file path.`,
    };
    return {
      frontendMessage: `Unable to update file '${targetFile}'. File does not exist!`,
      backendMessage: JSON.stringify(result),
    };
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let error = false;
  let totalMatches = 0;
  let frontendMessage = '';
  const itemResults = [];

  for (const item of items) {
    const { findString, replaceWith, replaceAll } = item;
    const matches = (content.split(findString) || []).length - 1;

    if (matches === 0) {
      // Introduce a delay before re-reading the file
      await new Promise(resolve => setTimeout(resolve, 100));
      // Read the file again to ensure the content is up-to-date
      content = fs.readFileSync(filePath, 'utf8');
      // Check again if the findString is present in the updated content
      if (!content.includes(findString)) {
        error = true;
        itemResults.push({
          item: findString,
          result: "findString is not present in the file. No changes made.",
        });
      } else {
        // If found on re-read, perform the replacement
        totalMatches += 1;
        content = content.replace(findString, replaceWith);
        itemResults.push({
          item: findString,
          result: 'First match replaced after re-read',
        });
      }
    } else {
      totalMatches += matches;
      if (replaceAll) {
        content = content.split(findString).join(replaceWith);
        itemResults.push({
          item: findString,
          result: `${matches} matches replaced`,
        });
      } else {
        content = content.replace(findString, replaceWith);
        itemResults.push({
          item: findString,
          result: 'First match replaced',
        });
      }
    }
  }
  fs.writeFileSync(filePath, content);

  if (error) {
    frontendMessage = `The following content was not found in the file: ${itemResults
      .filter((item) => item.result.includes('not present'))
      .map((item) => `<pre class="hljs mb-3"><code>${item.item}</code></pre>`)
      .join('<br /><br />')}`;
  } else {
    frontendMessage = `File ${await openFileLink(filePath)} updated successfully. ${totalMatches} matches replaced`;
  }
  chatController.chat.addFrontendMessage('function', frontendMessage);

  return JSON.stringify({ targetFile, content, itemResults });
}

async function readFile({ targetFiles }) {
  if (!targetFiles || targetFiles.length === 0) {
    return respondTargetFileNotProvided();
  }

  const result = [];
  const readFiles = [];
  const unreadFiles = [];
  let tokensRead = 0;

  for (let i = 0; i < targetFiles.length; i++) {
    const filePath = await getFilePath(targetFiles[i]);
    if (!fs.existsSync(filePath)) {
      unreadFiles.push(targetFiles[i]);
      result.push({
        targetFile: targetFiles[i],
        content: 'File does not exist',
      });
      continue;
    }
    readFiles.push(filePath);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    tokensRead += chatController.chat.countTokens(fileContent);
    result.push({
      targetFile: targetFiles[i],
      content: fileContent,
    });
  }

  let frontendMessage = '';
  if (readFiles.length > 0) {
    frontendMessage += `Read ${readFiles.length} file(s): ${await Promise.all(readFiles.map(async (filePath) => await openFileLink(filePath))).then((fileLinks) =>
      fileLinks.join(', '),
    )} (total tokens: ${tokensRead})`;
  }
  if (unreadFiles.length > 0) {
    frontendMessage += `<br>Could not read ${unreadFiles.length} file(s): ${unreadFiles.join(', ')}`;
  }
  chatController.chat.addFrontendMessage('function', frontendMessage);

  return JSON.stringify(result);
}

async function shell({ command }) {
  viewController.updateLoadingIndicator(true, 'Executing shell command ...  (click Stop to cancel or use Ctrl+C)');
  let commandResult = await chatController.terminalSession.executeShellCommand(command);
  // get last 20 lines of the terminal output to reduce token usage
  const lines = commandResult.split('\n');
  if (lines.length > 100 || commandResult.length > 5000) {
    commandResult = lines.slice(-100).join('\n');
    commandResult = commandResult.substring(commandResult.length - 5000);
    commandResult = `(some command output ommitted)...\n${commandResult}`;
  }
  commandResult = commandResult.replace(command, '');
  commandResult = `Command that was executed in terminal: '${command}'\nTerminal command output was:\n'${commandResult}'`;
  viewController.updateLoadingIndicator(false);

  return commandResult;
}

async function searchCode({ query, rerank = true, count = 20 }) {
  let results = await chatController.agent.projectController.searchEmbeddings({ query, count, rerank });
  let frontendMessage = '';
  let backendMessage = '';
  let uniqueFiles = [];
  if (results && results.length > 0) {
    const files = results.map((result) => result.filePath);
    uniqueFiles = [...new Set(files)];
    frontendMessage = `Checked ${uniqueFiles.length} files:<br>${await Promise.all(uniqueFiles.map(async (filePath) => await openFileLink(filePath))).then((fileLinks) => fileLinks.join('<br>'))}`;
    backendMessage = JSON.stringify(results);
  }
  chatController.chat.addFrontendMessage('function', frontendMessage || 'No results found');

  return backendMessage || 'No results found';
}

async function googleSearch({ queries }) {
  const searchAPI = new GoogleSearch();
  const googleSearchResults = await searchAPI.search(queries);

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
    compressedResult = await contextualCompress(queries[0], [result.content], [{ link: result.link }]);
    if (!firstCompressedResult) firstCompressedResult = compressedResult;

    if (await checkIfAnswersQuery(queries[0], compressedResult)) {
      chatController.chat.addFrontendMessage('function', `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`);
      return JSON.stringify(compressedResult);
    }
  }

  // Return first compressed result if no result meets the condition
  chatController.chat.addFrontendMessage('function', `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`);
  return JSON.stringify(firstCompressedResult);
}

async function getFilePath(targetFile) {
  targetFile = path.normalize(targetFile);
  if (path.isAbsolute(targetFile)) {
    return targetFile;
  }
  await chatController.terminalSession.getCurrentDirectory();
  return path.join(chatController.agent.currentWorkingDir, targetFile);
}

async function openFileLink(filepath) {
  try {
    let absolutePath = path.normalize(filepath);

    if (!path.isAbsolute(absolutePath)) {
      if (chatController.agent.projectController.currentProject) {
        absolutePath = path.join(chatController.agent.projectController.currentProject.path, absolutePath);
      } else {
        absolutePath = await getFilePath(absolutePath);
      }
    }

    let filename;
    if (chatController.agent.projectController.currentProject) {
      filename = path.relative(chatController.agent.projectController.currentProject.path, absolutePath);
    } else {
      filename = path.relative(chatController.agent.currentWorkingDir, absolutePath);
    }

    return `<a href="#" onclick="event.preventDefault(); viewController.openFileInIDE('${absolutePath}')">${filename}</a>`;
  } catch (error) {
    console.error(error);
    return filepath;
  }
}

async function fetchAndParseUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537',
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
  const compressedResult = await contextualCompress(query, [content], [{ link: url }]);
  return {
    frontendMessage: `Checked website:<br><a href="${url}" class="text-truncate ms-2">${url}</a>`,
    backendMessage: JSON.stringify(compressedResult),
  };
}

async function checkIfAnswersQuery(query, searchResult) {
  const format = true;
  const prompt = `
I am searching web for this query: '${query}'
Search result is:

${JSON.stringify(searchResult)}

Does this result answer search query question?`;
  const result = await chatController.backgroundTask.run({ prompt, format });

  return result !== false;
}

function respondTargetFileNotProvided() {
  chatController.chat.addFrontendMessage('function', 'File name was not provided.');

  return 'Please provide a target file name in a correct format.';
}

module.exports = {
  toolDefinitions,
  previewMessageMapping,
  createFile,
  replaceInFile,
  readFile,
  shell,
  searchCode,
  googleSearch,
  searchURL,
};
