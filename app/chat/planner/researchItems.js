const researchItems = [
  {
    name: 'project_overview',
    description: `Gather a high-level overview of the project.`,
    prompt: `Provide a concise overview of the project. Use information from README files, package.json files, and other relevant files.`,
    outputFormat: {
      project_name: { type: 'string' },
      project_purpose: { type: 'string' },
      primary_technologies: { type: 'array', items: { type: 'string' } },
      installation_instructions: { type: 'string' },
      launch_instructions: { type: 'string' },
    },
    additionalInformation: 'projectStructure',
    cache: true,
  },
  // {
  //   name: 'Project directory structure',
  //   description: `Analyze and summarize the project's directory structure and file organization.`,
  //   prompt: `Examine the project's directory structure. Provide a summary of key directories, their purposes, and any notable patterns in file organization.`,
  //   outputFormat: {
  //     rootProjectDirectory: { type: 'string' },
  //     keyDirectories: {
  //       type: 'array',
  //       items: {
  //         type: 'object',
  //         properties: {
  //           name: { type: 'string' },
  //           purpose: { type: 'string' },
  //         },
  //       },
  //     },
  //     organizationPatterns: { type: 'array', items: { type: 'string' } },
  //   },
  //   additionalInformation: 'projectStructure',
  //   cache: true,
  // },
  // {
  //   name: 'project_dependencies',
  //   description: `List and categorize the project's dependencies, including both runtime and development dependencies.`,
  //   prompt: `
  //   Examine the project's dependency management files.
  //   List all dependencies, categorizing them as runtime or development, and note their versions.`,
  //   outputFormat: {
  //     runtime_dependencies: {
  //       type: 'array',
  //       items: {
  //         type: 'object',
  //         properties: {
  //           name: { type: 'string' },
  //           version: { type: 'string' },
  //         },
  //       },
  //     },
  //     dev_dependencies: {
  //       type: 'array',
  //       items: {
  //         type: 'object',
  //         properties: {
  //           name: { type: 'string' },
  //           version: { type: 'string' },
  //         },
  //       },
  //     },
  //   },
  //   additionalInformation: 'projectStructure',
  //   cache: true,
  // },
  {
    name: 'task_relevant_files',
    description: `Identify files that are likely to be relevant to the user task`,
    prompt: `
    Based on the user task identify files that are likely to be needed to complete the task.
    Consider dependencies, imports, and functional relationships.
    If there is less than 20 code files, just read all files.
    If there are more than 20 code files, search codebase.
    Include those that are most likely needed to complete coding task`,
    outputFormat: {
      directly_related_files: { type: 'array', items: { type: 'string', description: 'The file name' } },
      potentially_related_files: { type: 'array', items: { type: 'string', description: 'The file name' } },
    },
    additionalInformation: 'getTaskDescription',
    cache: false,
  },
  // sampleCode: {
  //   description: `Locate and extract relevant code snippets that may serve as examples or references for the current task.`,
  //   prompt: `Search the codebase for snippets that demonstrate patterns or functionality similar to what's needed for the current task. Extract and briefly explain these snippets.`,
  //   tools: [],
  //   outputFormat: `{
  //     "snippets": [
  //       {
  //         "file": "string",
  //         "code": "string",
  //         "explanation": "string",
  //         "relevance": "string"
  //       }
  //     ]
  //   }`,
  // },
  // testing: {
  //   description: `Gather information about the project's testing setup, frameworks, and coverage.`,
  //   prompt: `Analyze the project's testing setup. Identify the testing frameworks used, the types of tests present, and any information about test coverage.`,
  //   tools: [],
  //   outputFormat: `{
  //     "testingFrameworks": ["string"],
  //     "testTypes": ["string"],
  //     "testCoverage": {
  //       "percentage": "number",
  //       "toolUsed": "string"
  //     },
  //     "testDirectories": ["string"]
  //   }`,
  // },
  // linters: {
  //   description: `Identify and describe the linting tools and configurations used in the project.`,
  //   prompt: `Examine the project for linting configurations. List the linting tools used, their purposes, and any custom rules or configurations.`,
  //   tools: [],
  //   outputFormat: `{
  //     "lintingTools": [
  //       {
  //         "name": "string",
  //         "purpose": "string",
  //         "configFile": "string"
  //       }
  //     ],
  //     "customRules": ["string"]
  //   }`,
  // },
  // versionControl: {
  //   description: `Retrieve information about the project's version control system and current state.`,
  //   prompt: `Analyze the version control system. Provide details on the current branch, recent commits, and any pending changes.`,
  //   tools: [],
  //   outputFormat: `{
  //     "versionControlSystem": "string",
  //     "currentBranch": "string",
  //     "recentCommits": [
  //       {
  //         "hash": "string",
  //         "message": "string",
  //         "author": "string",
  //         "date": "string"
  //       }
  //     ],
  //     "pendingChanges": ["string"]
  //   }`,
  // },
];

module.exports = researchItems;
