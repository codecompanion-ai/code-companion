const fs = require('graceful-fs');
const pathModule = require('path');
const CryptoJS = require('crypto-js');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const detect = require('language-detect');
const { isTextFile } = require('./utils');

const EMBEDDINGS_VERSION = 'v3';
const EMBEDDINGS_CACHE_FILE = 'embeddings_cache.json';

const detectedLanguageToSplitterMapping = {
  'C++': 'cpp',
  Go: 'go',
  Java: 'java',
  JavaScript: 'js',
  PHP: 'php',
  'Protocol Buffers': 'proto',
  Python: 'python',
  reStructuredText: 'rst',
  Ruby: 'ruby',
  Rust: 'rust',
  Scala: 'scala',
  Swift: 'swift',
  Markdown: 'markdown',
  LaTeX: 'latex',
  HTML: 'html',
  Solidity: 'sol',
};

class CodeEmbeddings {
  constructor(projectName, openAIApiKey) {
    this.projectName = projectName;
    this.openAIApiKey = openAIApiKey;
    this.embeddingsCache = {};
    this.loadCache();
    this.vectorStore = new MemoryVectorStore(
      new OpenAIEmbeddings({
        openAIApiKey,
        modelName: 'text-embedding-ada-002',
        maxRetries: 3,
        timeout: 60 * 1000,
      }),
    );
  }

  async splitCodeIntoChunks(metadata, fileContent, language) {
    // ... existing code ...
  }

  async updateEmbeddingsForFiles(filesList) {
    // ... existing code ...
  }

  async updateEmbedding(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    if (!isTextFile(fileContent)) {
      return;
    }
    const hash = CryptoJS.SHA256(fileContent).toString() + EMBEDDINGS_VERSION;
    if (this.embeddingsCache[filePath] && this.embeddingsCache[filePath].hash === hash) {
      return;
    }

    // ... existing code ...

    if (documents && documents.length > 0) {
      await this.vectorStore.addDocuments(documents);
      this.embeddingsCache[filePath] = { hash, documents };
      this.saveCache();
    }
  }

  // ... existing code ...

  saveCache() {
    fs.writeFileSync(EMBEDDINGS_CACHE_FILE, JSON.stringify(this.embeddingsCache));
  }

  loadCache() {
    if (fs.existsSync(EMBEDDINGS_CACHE_FILE)) {
      const cacheData = fs.readFileSync(EMBEDDINGS_CACHE_FILE, 'utf-8');
      this.embeddingsCache = JSON.parse(cacheData);
    }
  }

  // ... existing code ...
}

module.exports = CodeEmbeddings;
