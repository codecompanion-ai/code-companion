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
    if (taskClassificationResult.project_status === 'existing' && taskClassificationResult.task_type === 'multi_step') {
      const taskContext = await this.performResearch(taskDescription);
      this.updateTaskContextFiles(taskContext);
      this.chatController.taskTab.render(taskContext);
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
    chatContextBuilder.taskContextFiles = taskContext['task_relevant_files']?.directly_related_files || [];
  }
}

module.exports = Planner;
