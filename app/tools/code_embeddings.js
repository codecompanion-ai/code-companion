const fs = require('graceful-fs');
const pathModule = require('path');
const CryptoJS = require('crypto-js');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const detect = require('language-detect');

const { isTextFile } = require('../utils');

const EMBEDDINGS_VERSION = 'v4';
const EMBEDDINGS_MODEL_NAME = 'text-embedding-3-large';

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
    this.vectorStore = new MemoryVectorStore(
      new OpenAIEmbeddings({
        openAIApiKey,
        modelName: EMBEDDINGS_MODEL_NAME,
        maxRetries: 3,
        timeout: 60 * 1000,
      }),
    );
  }

  // The token usage reduction can be achieved by reducing the chunk size
  // and we are decreasing the chunkOverlap to reduce the number of repeating tokens.
  async splitCodeIntoChunks(metadata, fileContent, language) {
    let splitter;
    if (!language || language === 'other') {
      splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,  // reduce the chunk size to reduce token usage 
        chunkOverlap: 100,  // reduce chunkOverlap 
        keepSeparator: true,
      });
    } else {
      splitter = RecursiveCharacterTextSplitter.fromLanguage(language, {
        chunkSize: 500,  // reduce the chunk size to reduce token usage 
        chunkOverlap: 100,  // reduce chunkOverlap 
        keepSeparator: true,
      });
    }
    const documents = await splitter.createDocuments([fileContent], [metadata], {
      chunkHeader: `File name: ${metadata.filePath}\n---\n\n`,
      appendChunkOverlapHeader: true,
    });
    return documents;
  }

  async updateEmbeddingsForFiles(filesList) {
    if (!this.openAIApiKey) return;

    const promises = filesList.map((file) => this.updateEmbedding(file));
    await Promise.all(promises);
    this.deleteEmbeddingsForFilesNotInList(filesList);
    this.save();
  }

  async updateEmbedding(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    if (!isTextFile(fileContent)) {
      return;
    }
    const hash = CryptoJS.SHA256(fileContent).toString() + EMBEDDINGS_VERSION;
    const fileRecords = this.findRecords(filePath);

    if (fileRecords.length > 0) {
      if (fileRecords[0].metadata.hash === hash) {
        return;
      } else {
        this.deleteRecords(filePath);
      }
    }

    const metadata = {
      filePath,
      hash,
    };

    let language;
    try {
      language = detect.sync(filePath);
    } catch (error) {
      // ignore
    }

    const mappedLanguage = detectedLanguageToSplitterMapping[language] || 'other';
    const documents = await this.splitCodeIntoChunks(metadata, fileContent, mappedLanguage);
    if (documents && documents.length > 0) {
      await this.vectorStore.addDocuments(documents);
    }
  }

  isEmbededAndCurrent(filePath, hash) {
    const records = this.findRecords(filePath);
    if (records.length === 0) return false;

    return records[0].metadata.hash === hash;
  }

  deleteEmbeddingsForFilesNotInList(filesList) {
    const filePathsToKeep = new Set(filesList);
    this.vectorStore.memoryVectors = this.vectorStore.memoryVectors.filter((record) => filePathsToKeep.has(record.metadata.filePath));
  }

  findRecords(filePath) {
    return this.vectorStore.memoryVectors.filter((record) => record.metadata.filePath === filePath);
  }

  deleteRecords(filePath) {
    this.vectorStore.memoryVectors = this.vectorStore.memoryVectors.filter((record) => record.metadata.filePath !== filePath);
  }

  async search({ query, limit = 50, basePath, minScore = 0.4, rerank = true }) {
    const results = await this.vectorStore.similaritySearchWithScore(query, limit * 2);

    //... Rest of the Code remains as is ...

  save() {
    localStorage.set(`project.${this.projectName}.embeddings`, JSON.stringify(this.vectorStore.memoryVectors));
  }

  //... Rest of the Code remains as is ...

module.exports = CodeEmbeddings;
