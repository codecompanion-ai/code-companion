const { OpenAI } = require('langchain/llms/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { ContextualCompressionRetriever } = require('langchain/retrievers/contextual_compression');
const { LLMChainExtractor } = require('langchain/retrievers/document_compressors/chain_extract');

/**
 * This function compresses the given texts based on the query and returns the relevant data.
 * @param {string} query The query based on which the texts are to be compressed.
 * @param {string[]} texts The texts to be compressed.
 * @param {Object[]} [metadatas=[]] The metadata for each text.
 * @param {number} [docsToRetrieve=5] The number of documents to retrieve.
 * @returns {Promise<{pageContent: string, link: string}[]>} The compressed texts and their links.
 */
async function contextualCompress(query, texts, metadatas = [], docsToRetrieve = 5) {
  const openAIApiKey = settings.get('apiKey');
  const model = new OpenAI({
    openAIApiKey: openAIApiKey,
    modelName: 'gpt-3.5-turbo-0613',
    temperature: 0.2,
  });
  const baseCompressor = LLMChainExtractor.fromLLM(model);
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 4000,
    chunkOverlap: 500,
  });
  const docs = await textSplitter.createDocuments(texts, metadatas);
  docs.forEach((doc, index) => {
    doc.metadata.index = index;
  });

  const vectorStore = await MemoryVectorStore.fromDocuments(
    docs,
    new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-ada-002',
      maxRetries: 3,
      timeout: 30 * 1000,
    }),
  );

  const retriever = new ContextualCompressionRetriever({
    baseCompressor,
    baseRetriever: vectorStore.asRetriever(docsToRetrieve),
  });
  let results = await retriever.getRelevantDocuments(query);

  // Sort the results based on their original order in the text given as input
  results.sort((a, b) => a.metadata.index - b.metadata.index);

  results = results.map((result) => {
    return {
      pageContent: result.pageContent,
      link: result.metadata.link,
    };
  });

  // If no results are returned, return an empty array
  if (!results.length) {
    return [];
  }

  return results;
}

module.exports = {
  contextualCompress,
};

//# Testing the functionality of contextualCompress function
const assert = require('assert');

describe('contextualCompress', () => {
  it('returns relevant and representative compressed texts', async () => {
    // Add setup, mocks, and tests specific to your use case.
    // This is just a pseudo code to give an idea how to write the tests
  });

  it('returns an empty array if no results are found', async () => {
    // Add setup, mocks, and tests specific to your use case.
    // This is just a pseudo code to give an idea how to write the tests
  });
});