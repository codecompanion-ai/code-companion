const researchItems = require('./researchItems');
const ResearchAgent = require('./researchAgent');

class Planner {
  constructor(chatController) {
    this.chatController = chatController;
    this.planContainer = document.getElementById('planContainer');
  }

  async run(taskDescription) {
    this.showLoadingIndicator();
    // const taskType = this.classifyTask();
    const researchItems = this.filterResearchItems();
    const researchResults = await this.performResearch(researchItems, taskDescription);
    // const plan = this.createPlan(researchResults);
    this.showResearchResults(researchResults);
    return researchResults;
  }

  filterResearchItems() {
    return researchItems;
  }

  showLoadingIndicator() {
    viewController.updateLoadingIndicator(true, 'Doing some research and planning...');
    this.planContainer.innerHTML = `
      <div class="d-flex justify-content-center align-items-center h-100">
        <div class="text-center">
          <div class="spinner-grow text-secondary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-secondary">Analyzing task and creating a plan...</p>
        </div>
      </div>
    `;
  }

  showResearchResults(researchResults) {
    let html = '';

    const formatTitle = (title) => {
      return title.replace(/_/g, ' ').toUpperCase();
    };

    for (const [key, value] of Object.entries(researchResults)) {
      html += `<h3>${formatTitle(key)}</h3>`;
      if (typeof value === 'string') {
        html += `<p>${value}</p>`;
      } else if (Array.isArray(value)) {
        html += '<ul>';
        value.forEach((item) => {
          html += `<li>${item}</li>`;
        });
        html += '</ul>';
      } else if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          html += `<h4>${formatTitle(subKey)}</h4>`;
          if (typeof subValue === 'string') {
            html += `<p>${subValue}</p>`;
          } else if (Array.isArray(subValue)) {
            html += '<ul>';
            subValue.forEach((item) => {
              if (typeof item === 'object') {
                html += '<li>';
                for (const [itemKey, itemValue] of Object.entries(item)) {
                  html += `<strong>${itemKey}:</strong> ${itemValue}<br>`;
                }
                html += '</li>';
              } else {
                html += `<li>${item}</li>`;
              }
            });
            html += '</ul>';
          }
        }
      }
    }
    this.planContainer.innerHTML = html;
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
