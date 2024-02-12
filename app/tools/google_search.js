const { google } = require('googleapis');
const customsearch = google.customsearch('v1');

// Refactored to limit the search results and optimize token usage
const TOP_N_RESULTS = 5; 

class GoogleSearch {
  constructor() {
    this.apiKey = 'AIzaSyCcVfWEPZu_CYlQvxDou_sujjgjedSARJk';
    this.cxId = '80a4581942dad4e4d';
  }

  async singleSearch(query) {
    const res = await customsearch.cse.list({
      cx: this.cxId,
      q: query,
      auth: this.apiKey,
      num: TOP_N_RESULTS, // Limit the number of search results to optimize token usage
    });
    return res.data.items.slice(0, TOP_N_RESULTS); // Ensuring we are getting only top results after query is made
  }

  async multipleSearch(queries) {
    const promises = queries.map((query) => this.singleSearch(query));
    const results = await Promise.all(promises);

    return results;
  }

  async search(queries) {
    let formattedResults = [];
    let results = await this.multipleSearch(queries);

    if (results) {
      formattedResults = results.map((result) => {
        if (result && result.length > 0) {
          return result.map((item, index) => {
            return {
              relevancy_score: 1 - index / TOP_N_RESULTS,
              title: item.title,
              link: item.link,
              snippet: item.snippet,
            };
          });
        }
        return [];
      });
      formattedResults = formattedResults.flat().sort((a, b) => b.relevancy_score - a.relevancy_score);
      formattedResults = formattedResults
        .filter((item, index, self) => {
          return index === self.findIndex((t) => t.link === item.link);
        })
        .slice(0, TOP_N_RESULTS);
      const rerankedResults = await this.rerankSearchResults(queries, formattedResults);
      return rerankedResults;
    }
  }

  async rerankSearchResults(queries, searchResults) {
    try {
      const searchResultsWithIndex = searchResults.map((result, index) => {
        return { index: index, ...result };
      });
      const prompt = `I am searching internet for this query: '${queries[0]}'.
Search results are:

${JSON.stringify(searchResultsWithIndex)}

What array indexes of these search result objects in JSON array above are the most relevant and complete search results that may answer question in my search queries?
Respond with JSON array only with actual array indexes in the order of relevance, minimize number of items returned but results must be enough to satisfy research.`;

      const rankings = await chatController.backgroundTask.run({ prompt, format: [3, 1, 4] });
      const rankedResults = rankings.filter((index) => index in searchResults).map((index) => searchResults[index]);
      return rankedResults;
    } catch (error) {
      console.error(error);
      return searchResults;
    }
  }
}

module.exports = GoogleSearch;