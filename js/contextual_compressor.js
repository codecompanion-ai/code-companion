const fs = require('graceful-fs');
const CryptoJS = require('crypto-js');
const { OpenAI } = require('langchain/llms/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { ContextualCompressionRetriever } = require('langchain/retrievers/contextual_compression');
const { LLMChainExtractor } = require('langchain/retrievers/document_compressors/chain_extract');

const COMPRESSION_CACHE_FILE = 'compression_cache.json';

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

  // Generate a unique cache key based on the query and texts
  const cacheKey = CryptoJS.SHA256(query + JSON.stringify(texts)).toString();
  let results = loadCache()[cacheKey];

  if (!results) {
    results = await retriever.getRelevantDocuments(query);
    results.sort((a, b) => a.metadata.index - b.metadata.index);
    results = results.map((result) => ({
      pageContent: result.pageContent,
      link: result.metadata.link,
    }));
    saveCache(cacheKey, results);
  }

  return results;
}

function saveCache(key, data) {
  const cache = loadCache();
  cache[key] = data;
  fs.writeFileSync(COMPRESSION_CACHE_FILE, JSON.stringify(cache));
}

function loadCache() {
  if (fs.existsSync(COMPRESSION_CACHE_FILE)) {
    return JSON.parse(fs.readFileSync(COMPRESSION_CACHE_FILE, 'utf-8'));
  }
  return {};
}

module.exports = {
  contextualCompress,
};
