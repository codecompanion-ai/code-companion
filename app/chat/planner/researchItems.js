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
    description: `Identify files that are likely to be relevant to the user task`,
    prompt: `
    Based on the user task description identify files that are likely to be needed to complete the task.
    Consider dependencies, imports, and functional relationships.
    If there is less than 20 code files, just read all files to analyze.
    If there are more than 20 code files, search codebase.
    In output include files that software engineers are likely to need to understand or to modify in order to complete user's task.`,
    outputFormat: {
      directly_related_files: { type: 'array', items: { type: 'string', description: 'Absolute file path' } },
      potentially_related_files: { type: 'array', items: { type: 'string', description: 'Absolute file path' } },
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
  description: `Create a detailed implementation plan for completing the given taskDescription and relevant context and files.`,
  model: 'large',
  maxSteps: 2,
  prompt: `
Create a detailed implementation plan for the given task. Focus on concrete actions and avoid including research steps.

1. For each sub-task:
   a) Discuss the sub-task, presenting all viable options.
   b) Identify and justify the best option.
   c) Provide a detailed description of the chosen approach.
   d) Create a concise title (max 5 words) for the sub-task.
   e) List the specific files that need modification.

2. Include only necessary steps to complete the task, such as:
   - Modifying existing files
   - Creating new files
   - Running commands
   - Installing dependencies

3. Omit testing steps unless explicitly mentioned in the project overview.

4. Ensure each step is actionable and directly contributes to task completion.

5. Maintain a logical order of steps, considering dependencies between actions.

6. Use clear, specific language to describe each action.

7. Always add "Finalize" step to the plan. Based on additional information provided, in this step add description to review and reflect on implementation, build and run the project based of the instructions.

Remember: The goal is to provide a practical, step-by-step guide for implementing the required changes.
`,
  outputFormat: {
    plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          discussion: { type: 'string' },
          step_detailed_description: { type: 'string' },
          step_title: { type: 'string' },
          files_to_modify: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  additionalInformation: ['getTaskDescription', 'taskContext', 'taskRelevantFilesContent', 'projectStructure'],
};

module.exports = { researchItems, taskClassification, taskPlan };
