const { OpenAI } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { ContextualCompressionRetriever } = require('langchain/retrievers/contextual_compression');
const zlib = require('zlib');

async function contextualCompress(query, texts, metadatas = [], docsToRetrieve = 5) {
  const openAIApiKey = chatController.settings.apiKey;
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

  results.sort((a, b) => a.metadata.index - b.metadata.index);

  results = results.map((result) => {
    return {
      pageContent: zlib.deflateSync(result.pageContent).toString('base64'),
      link: result.metadata.link,
    };
  });

  if (!results) {
    return [];
  }

  return results.map(result => ({
    ...result,
    pageContent: zlib.inflateSync(Buffer.from(result.pageContent, 'base64')).toString(),
  }));
}

module.exports = {
  contextualCompress,
};