const { PLAN_PROMPT_TEMPLATE } = require('../../static/prompts');

const researchItems = [
  {
    name: 'project_overview',
    description: `Gather a high-level overview of the project.`,
    prompt: `Provide a concise overview of the project. Use information from README files, package.json files, and other relevant files. Only provide information that was found in the files, otherwise set to null`,
    outputFormat: {
      project_name: { type: 'string' },
      primary_technologies: {
        type: 'array',
        items: { type: 'string', description: 'name and version if available, eg. "React 18.2.0"' },
      },
      project_type: {
        type: 'string',
        description: 'The type of project, e.g. "web", "mobile app", "chrome extension"',
      },
      installation_instructions: { type: 'string' },
      build_instructions: { type: 'string' },
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
    description: `Identify and prioritize files that are important for a Software Engineer to review and inspect before working on the task defined in <taskDescription>`,
    prompt: `
    Analyze the <taskDescription> and identify files that a software engineer needs to review or modify or can reference or reuse some functionality from.

    For each file inspected think step by step to categorize files as follows:

    1. Directly relevant files:
       - Files containing logic directly related to the task
       - Files that will need to be modified to complete the task
       - Files that have functionality that can be reused or referenced
       - Files that mention some functionality related to the task

    2. Potentially relevant files:
       - All other inspected files that are not directly relevant but may be useful

    If you not sure, classify a file as 'directly_relevant_files'.

    Steps:
    1. Identify key concepts and functionality from the <taskDescription>
    2. Search for files with names or content matching these key concepts. User very long descriptive search query for semantic code search.
    3. Check import statements and function calls to find related files
    4. Include relevant configuration files if the task involves system settings

    Sort files in each category by relevance to the taskDescription, most relevant first.`,
    outputFormat: {
      directly_relevant_files: { type: 'array', items: { type: 'string', description: 'Absolute file path' } },
      potentially_relevant_files: { type: 'array', items: { type: 'string', description: 'Absolute file path' } },
    },
    additionalInformation: ['getTaskDescription', 'projectStructure'],
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

const taskClassification = {
  name: 'task_classification',
  description: `Classify the task`,
  prompt: `
Task Classification Instructions:

1. Project Status:
   - Examine the project structure.
   - Determine: Is this a new or existing project?

2. Task Complexity:
   - Classify task as simple task: when task can be completed without knowing project structure or code and in a single step.
   - Classify as 'multi_step' may require some planning or multiple actions or changes may be needed, or modifying several files.
   - If you not sure, classify as 'multi_step'.

3. Task Title:
   - Create a concise title (max 4 words).
   - Capture the essence of the task.

4. Considerations:
   - Project's current state
   - Specific task requirements
   - Potential dependencies or implications

5. Output:
   - Classify project status: new/existing
   - Determine task type: simple/multi-step
   - Provide brief, descriptive task title
  `,
  outputFormat: {
    project_status: {
      type: 'string',
      enum: ['new', 'existing'],
      description: 'Whether the project is new or existing',
    },
    task_type: {
      type: 'string',
      enum: ['simple', 'multi_step'],
      description: 'Whether the task is simple or multi-step',
    },
    concise_task_title: {
      type: 'string',
      description: 'A brief title for the task. Max 4 words',
    },
  },
  additionalInformation: ['projectStructure', 'getTaskDescription'],
};

const taskPlan = {
  name: 'task_plan',
  description: `Act as an expert software architect.
Create very detailed implementation plan to complete task defined in <taskDescription> below
  `,
  model: 'large',
  maxSteps: 2,
  prompt: PLAN_PROMPT_TEMPLATE,
  outputFormat: {
    plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step_detailed_description: { type: 'string' },
          step_title: { type: 'string' },
        },
      },
    },
    files_to_review: { type: 'array', items: { type: 'string' }, description: 'List of absolute file paths' },
  },
  additionalInformation: [
    'getTaskDescription',
    'additionalContext',
    'taskRelevantFilesContent',
    'potentiallyRelevantFiles',
    'projectStructure',
  ],
};

module.exports = { researchItems, taskClassification, taskPlan };
