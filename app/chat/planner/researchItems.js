const researchItems = {
  projectOverview: {
    description: `Gather a high-level overview of the project.`,
    prompt: `Provide a concise overview of the project. Use information from README files, package.json files, and other relevant files.`,
    tools: [],
    outputFormat: {
      name: { type: 'string' },
      purpose: { type: 'string' },
      primaryTechnologies: { type: 'array', items: { type: 'string' } },
      installationInstructions: { type: 'string' },
      launchInstructions: { type: 'string' },
    },
    cache: true,
  },
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
  // projectStructure: {
  //   description: `Analyze and summarize the project's directory structure and file organization.`,
  //   prompt: `Examine the project's directory structure. Provide a summary of key directories, their purposes, and any notable patterns in file organization.`,
  //   tools: [],
  //   outputFormat: `{
  //     "rootDirectory": "string",
  //     "keyDirectories": [
  //       {
  //         "name": "string",
  //         "purpose": "string",
  //         "notable_files": ["string"]
  //       }
  //     ],
  //     "organizationPatterns": ["string"]
  //   }`,
  // },
  // codeConventions: {
  //   description: `Identify and summarize the coding conventions and style guidelines used in the project.`,
  //   prompt: `Analyze the codebase for consistent coding conventions and style guidelines. Summarize the main conventions for naming, formatting, and organization.`,
  //   tools: [],
  //   outputFormat: `{
  //     "namingConventions": {
  //       "variables": "string",
  //       "functions": "string",
  //       "classes": "string"
  //     },
  //     "formattingConventions": ["string"],
  //     "organizationConventions": ["string"]
  //   }`,
  // },
  // dependencies: {
  //   description: `List and categorize the project's dependencies, including both runtime and development dependencies.`,
  //   prompt: `Examine the project's dependency management files. List all dependencies, categorizing them as runtime or development, and note their versions.`,
  //   tools: [],
  //   outputFormat: `{
  //     "runtimeDependencies": [
  //       {
  //         "name": "string",
  //         "version": "string"
  //       }
  //     ],
  //     "devDependencies": [
  //       {
  //         "name": "string",
  //         "version": "string"
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
  // relatedFiles: {
  //   description: `Identify files that are likely to be relevant to the current task or code changes.`,
  //   prompt: `Based on the current task or recent code changes, identify files that are likely to be relevant. Consider dependencies, imports, and functional relationships.`,
  //   tools: [],
  //   outputFormat: `{
  //     "directlyRelatedFiles": ["string"],
  //     "potentiallyRelatedFiles": ["string"],
  //     "reason": "string"
  //   }`,
  // },
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
};

module.exports = researchItems;
