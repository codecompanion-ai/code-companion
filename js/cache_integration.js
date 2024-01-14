const CacheManager = require('./cache_manager');
const cacheManager = new CacheManager();
const openai = require('./openai_api'); // This will be your OpenAI API wrapper

// Example integration function that uses caching
async function getCachedOpenAIResponse(prompt, maxTokens) {
  const cacheKey = `openai:${prompt}:${maxTokens}`;
  if (cacheManager.has(cacheKey)) {
    return cacheManager.get(cacheKey);
  }

  // Call the OpenAI API
  const response = await openai.createCompletion({ prompt, maxTokens });
  const result = response.data.choices[0].text;

  // Cache the result with a TTL of 5 minutes (300000 milliseconds)
  cacheManager.set(cacheKey, result, 300000);

  return result;
}

module.exports = {
  getCachedOpenAIResponse
};