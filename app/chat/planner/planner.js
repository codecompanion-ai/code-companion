const researchItems = require('./researchItems');
const ResearchAgent = require('./researchAgent');

class Planner {
  constructor(chatController) {
    this.chatController = chatController;
  }

  async run(taskDescription) {
    this.chatController.taskTab.showLoadingIndicator();
    // const taskType = this.classifyTask();
    const researchItems = this.filterResearchItems();
    const taskContext = await this.performResearch(researchItems, taskDescription);
    // const plan = this.createPlan(researchResults);
    this.chatController.taskTab.render(taskContext);
    return taskContext;
  }

  filterResearchItems() {
    return researchItems;
  }

  async performResearch(researchItems, taskDescription) {
    const researchPromises = researchItems.map(async (item) => {
      const researchAgent = new ResearchAgent(this.chatController);
      const result = await researchAgent.executeResearch(item, taskDescription);
      return { [item.name]: result };
    });

    const researchResults = await Promise.all(researchPromises);
    return Object.assign({}, ...researchResults);
  }
}

module.exports = Planner;
