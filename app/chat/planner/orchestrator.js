const researchItems = require('./researchItems');

class Planner {
  constructor() {}

  async run() {
    // const taskType = this.classifyTask();
    const researchItems = this.filterResearchItems();
    const researchResults = this.performResearch(researchItems);
    console.log(researchResults);
    // const plan = this.createPlan(researchResults);
    // return plan;
  }

  filterResearchItems() {
    return researchItems;
  }

  async performResearch(researchItems) {
    const researchResults = [];
    for (const item of researchItems) {
      const result = ''; // TODO: implement research
      researchResults.push(result);
    }
    return researchResults;
  }
}

module.exports = Planner;
