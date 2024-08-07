const fs = require('graceful-fs');
const { normalizedFilePath } = require('../../utils');

const toolDefinitions = [
  {
    name: 'read_files',
    description: 'Read files.',
    parameters: {
      type: 'object',
      properties: {
        filePaths: {
          type: 'array',
          items: {
            type: 'string',
            description: 'Path to the file to be read.',
          },
        },
      },
      required: ['filePaths'],
    },
    executeFunction: readFiles,
  },
  {
    name: 'search_codebase',
    description: 'Semantic search that can perform codebase search',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `Long, descriptive natural language search query`,
        },
        filenamesOnly: {
          type: 'boolean',
          description: 'If true, only return the filenames of the results, otherwise return relevant code snippets',
        },
      },
      required: ['query'],
    },
    executeFunction: searchCode,
  },
  {
    name: 'output',
    description: 'Output the result of the task',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

async function readFiles({ filePaths }) {
  const fileContents = await Promise.all(
    filePaths.map(async (targetFile) => {
      const filePath = await normalizedFilePath(targetFile);
      if (!fs.existsSync(filePath)) {
        return `File with filepath '${targetFile}' does not exist`;
      }
      if (fs.statSync(filePath).isDirectory()) {
        return `'${targetFile}' is a directory, not a file`;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      return `<filecontent filename="${filePath}">\n${content}\n</filecontent>`;
    }),
  );

  return fileContents.join('\n');
}

async function searchCode({ query, filenamesOnly = false }) {
  const count = filenamesOnly ? 30 : 10;
  const rerank = false;

  let results = await chatController.agent.projectController.searchEmbeddings({ query, count, rerank });
  if (results && results.length > 0) {
    if (filenamesOnly) {
      return [...new Set(results.map((result) => result.filePath))].join('\n');
    }
    return results.map((result) => result.fileContent).join('\n\n');
  }

  return `No results found`;
}

function tools(outputFormat) {
  return toolDefinitions.map((tool) => {
    if (tool.name === 'output') {
      return {
        ...tool,
        parameters: {
          type: 'object',
          properties: outputFormat,
          required: Object.keys(outputFormat),
        },
      };
    }
    return tool;
  });
}

module.exports = {
  toolDefinitions,
  tools,
};
