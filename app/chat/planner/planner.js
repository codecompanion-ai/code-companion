const { researchItems, taskClassification } = require('./researchItems');
const ResearchAgent = require('./researchAgent');

class Planner {
  constructor(chatController) {
    this.chatController = chatController;
  }

  async run(taskDescription) {
    viewController.updateLoadingIndicator(true, 'Analyzing task and project...');
    const taskClassificationResult = await this.classifyTask(taskDescription);
    this.chatController.taskTab.renderTask(taskDescription, taskClassificationResult.concise_task_title);
    this.chatController.chat.taskTitle = taskClassificationResult.concise_task_title;

    if (taskClassificationResult.project_status === 'existing' && taskClassificationResult.task_type === 'multi_step') {
      const taskContext = await this.performResearch(taskDescription);
      this.chatController.chat.taskContext = this.formatTaskContextToMarkdown(taskContext);
      this.updateTaskContextFiles(taskContext);
      this.chatController.taskTab.render();
      return taskContext;
    }
    return null;
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

  updateTaskContextFiles(taskContext) {
    const chatContextBuilder = this.chatController.chat.chatContextBuilder;
    const taskContextFiles = taskContext['task_relevant_files']?.directly_related_files || [];
    const potentiallyRelatedFiles = taskContext['task_relevant_files']?.potentially_related_files || [];
    taskContextFiles.forEach((file) => {
      chatContextBuilder.updateTaskContextFile(file, true);
    });
    potentiallyRelatedFiles.forEach((file) => {
      chatContextBuilder.updateTaskContextFile(file, false);
    });
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
