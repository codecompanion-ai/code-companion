const { researchItems, taskClassification, taskPlan } = require('./researchItems');
const ResearchAgent = require('./researchAgent');

class Planner {
  constructor(chatController) {
    this.chatController = chatController;
    this.taskContext = null;
  }

  async run(taskDescription) {
    try {
      viewController.updateLoadingIndicator(true, 'Analyzing task and project...');
      const taskClassificationResult = await this.classifyTask(taskDescription);
      this.chatController.taskTab.renderTask(taskDescription, taskClassificationResult.concise_task_title);
      this.chatController.chat.taskTitle = taskClassificationResult.concise_task_title;

      if (!this.chatController.settings.enablePlanner) {
        viewController.updateLoadingIndicator(false);
        return;
      }

      if (
        taskClassificationResult.project_status === 'existing' &&
        taskClassificationResult.task_type === 'multi_step'
      ) {
        const taskContext = await this.performResearch(taskDescription);
        this.chatController.chat.taskContext = this.formatTaskContextToMarkdown(taskContext);
        this.taskContext = taskContext;
        await this.updateTaskContextFiles({
          filesToDisable: this.taskContext['task_relevant_files']?.potentially_relevant_files,
          filesToEnable: this.taskContext['task_relevant_files']?.directly_relevant_files,
        });
        this.chatController.taskTab.render();
      }

      if (taskClassificationResult.task_type === 'multi_step') {
        viewController.updateLoadingIndicator(true, 'Creating task plan...');
        const planResult = await this.createPlan(taskDescription);
        await this.updateTaskContextFiles({
          filesToDisable: Object.keys(this.chatController.chat.chatContextBuilder.getEnabledTaskContextFiles()),
          filesToEnable: planResult.files_to_review,
        });
        console.log(planResult);
        this.chatController.chat.taskPlan = planResult.plan.map((item) => ({ ...item, completed: false }));
      }

      viewController.updateLoadingIndicator(false);
    } catch (error) {
      this.chatController.handleError(error);
    }
  }

  async classifyTask(taskDescription) {
    const researchAgent = new ResearchAgent(this.chatController);
    const result = await researchAgent.executeResearch(taskClassification, taskDescription);
    return result;
  }

  async performResearch(taskDescription) {
    const researchPromises = researchItems.map(async (item) => {
      const researchAgent = new ResearchAgent(this.chatController);
      const result = await researchAgent.executeResearch(item, taskDescription);
      return { [item.name]: result };
    });

    const researchResults = await Promise.all(researchPromises);
    return Object.assign({}, ...researchResults);
  }

  async createPlan(taskDescription) {
    const researchAgent = new ResearchAgent(this.chatController);
    const result = await researchAgent.executeResearch(taskPlan, taskDescription, this.taskContext);
    return result;
  }

  async updateTaskContextFiles({ filesToDisable, filesToEnable }) {
    const chatContextBuilder = this.chatController.chat.chatContextBuilder;
    if (Array.isArray(filesToDisable)) {
      await chatContextBuilder.updateTaskContextFiles(filesToDisable, false);
    }
    if (Array.isArray(filesToEnable)) {
      await chatContextBuilder.updateTaskContextFiles(filesToEnable, true);
    }
  }

  formatTaskContextToMarkdown(projectContext) {
    const excludeKeys = ['task_relevant_files'];
    const filteredContext = Object.fromEntries(
      Object.entries(projectContext).filter(([key]) => !excludeKeys.includes(key)),
    );

    let markdown = '';
    const formatTitle = (title) => {
      return title.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    for (const [key, value] of Object.entries(filteredContext)) {
      markdown += `### ${formatTitle(key)}\n\n`;
      if (typeof value === 'string') {
        markdown += `${value}\n\n`;
      } else if (Array.isArray(value)) {
        value.forEach((item) => {
          markdown += `- ${item}\n`;
        });
        markdown += '\n';
      } else if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          if (subValue === null) continue;
          markdown += `**${formatTitle(subKey)}:** `;
          if (typeof subValue === 'string') {
            markdown += `${subValue}\n\n`;
          } else if (Array.isArray(subValue)) {
            markdown += '\n';
            subValue.forEach((item) => {
              if (typeof item === 'object') {
                markdown += '- ';
                for (const [itemKey, itemValue] of Object.entries(item)) {
                  markdown += `**${itemKey}:** ${itemValue} `;
                }
                markdown += '\n';
              } else {
                markdown += `- ${item}\n`;
              }
            });
            markdown += '\n';
          }
        }
      }
    }
    return markdown;
  }
}

module.exports = Planner;
