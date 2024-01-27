
const fs = require('graceful-fs');
const pathModule = require('path');
const CryptoJS = require('crypto-js');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const detect = require('language-detect');
const { isTextFile } = require('./utils');

// The version to track code changes.
const EMBEDDINGS_VERSION = 'v3';

// A mapping that connects detected languages to their text splitters.
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

// The main class that includes methods for manipulating and querying source code embeddings.
class CodeEmbeddings {
  constructor(projectName, openAIApiKey) {
    this.projectName = projectName;
    this.openAIApiKey = openAIApiKey;
    this.vectorStore = new MemoryVectorStore(
      new OpenAIEmbeddings({
        openAIApiKey,
        modelName: 'text-embedding-ada-002',
        maxRetries: 3, // added error handling
        timeout: 60 * 1000,
      }),
    );
  }

  // A helper function that splits the source code into manageable chunks and returns documents.
  async splitCodeIntoChunks(metadata, fileContent, language) {
    let splitter;
    
    try { // Error handling added
      if (!language || language === 'other') {
        splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 0,
          keepSeparator: true,
        });
      } else {
        splitter = RecursiveCharacterTextSplitter.fromLanguage(language, {
          chunkSize: 1000,
          chunkOverlap: 0,
          keepSeparator: true,
        });
      }
    } catch(error) {
      console.error("Error occurred while splitting code into chunks: ", error);
    }

    let documents;
    
    try { // Error handling added
      documents = await splitter.createDocuments([fileContent], [metadata], {
        chunkHeader: `File name: ${metadata.filePath}\n---\n\n`,
        appendChunkOverlapHeader: true,
      });
    } catch(error) {
      console.error("Error occurred while creating documents: ", error);
    }

    return documents;
  }

  // A method that updates the embeddings for all files listed.
  async updateEmbeddingsForFiles(filesList) {
    // We don't need to do anything if no API key is provided.
    if (!this.openAIApiKey) return;

    // Use Promise.all so that all the promises are executed concurrently.
    try { // Error handling added
      const promises = filesList.map((file) => this.updateEmbedding(file));
      await Promise.all(promises);
      this.deleteEmbeddingsForFilesNotInList(filesList);
      this.save();
    } catch (error) {
      console.error("Error occurred while updating embeddings for files: ", error);
    }
  }

  // A method to update the embedding of a specific file.
  async updateEmbedding(filePath) {
    let fileContent;
    
    try { // Error handling added
      fileContent = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`Error occurred while reading file at path ${filePath}: `, error);
      return;
    }

    if (!isTextFile(fileContent)) {
      return;
    }

    const hash = CryptoJS.SHA256(fileContent).toString() + EMBEDDINGS_VERSION;
    let fileRecords;

    try { // Error handling added
      fileRecords = this.findRecords(filePath);
    } catch (error) {
      console.error("Error occurred while finding records: ", error);
      return;
    }
    
    if (fileRecords.length > 0) {
      const oldHash = fileRecords[0].metadata.hash;
      
      if (oldHash === hash) {
        // The file's contents haven't changed, so no update is needed.
        return;
      } else {
        // If the file has changed, its old records should be deleted.
        this.deleteRecords(filePath);
      }
    }

    let language;
    
    try { // Error handling added
      language = detect.sync(filePath);
    } catch (error) {
      console.error(`Error occurred while detecting language for file at path ${filePath}: `, error);
      // The language isn't critical, so we can proceed without it.
    }
    
    const mappedLanguage = detectedLanguageToSplitterMapping[language] || 'other';
    let documents;
    
    try { // Error handling added
      documents = await this.splitCodeIntoChunks({
        filePath,
        hash,
      }, fileContent, mappedLanguage);
    } catch (error) {
      console.error("Error occurred while splitting code into chunks: ", error);
      return;
    }

    if (documents && documents.length > 0) {
      try { // Error handling added
        await this.vectorStore.addDocuments(documents);
      } catch (error) {
        console.error("Error occurred while adding documents to vector store: ", error);
      }
    }
  }

  // A method that checks whether a file should be embedded or not.
  isEmbededAndCurrent(filePath, hash) {
    let records;

    try { // Error handling added
      records = this.findRecords(filePath);
    } catch (error) {
      console.error("Error occurred while finding records: ", error);
    }

    if (records.length === 0) return false;

    return records[0].metadata.hash === hash;
  }

  // A method that deletes the embeddings for those files that are not in the list.
  deleteEmbeddingsForFilesNotInList(filesList) {
    const filePathsToKeep = new Set(filesList);
    this.vectorStore.memoryVectors = this.vectorStore.memoryVectors.filter((record) => filePathsToKeep.has(record.metadata.filePath));
  }

  // A helper function that returns all records for a file path.
  findRecords(filePath) {
    let records;
    
    try { // Error handling added
      records = this.vectorStore.memoryVectors.filter((record) => record.metadata.filePath === filePath);
    } catch (error) {
      console.error(`Error occurred while finding records for file at path ${filePath}: `, error);
    }

    return records;
  }

  // A method that deletes all records for a specific file path.
  deleteRecords(filePath) {
    try { // Error handling added
      this.vectorStore.memoryVectors = this.vectorStore.memoryVectors.filter((record) => record.metadata.filePath !== filePath);
    } catch (error) {
      console.error(`Error occurred while deleting records for file at path ${filePath}: `, error);
    }
  }

  // A method that returns the most relevant code snippets for a specific search query.
  async search({ query, limit = 50, basePath, minScore = 0.5, rerank = true }) {
    let results;
    
    try { // Error handling added
      results = await this.vectorStore.similaritySearchWithScore(query, limit * 2);
    } catch (error) {
      console.error(`Error occurred while searching vectors with query "${query}": `, error);
      return [];
    }

    if (results.length == 0) return [];

    const filteredResults = results.filter((result) => {
      const [record, score] = result;
      return score >= minScore && record.pageContent.length > 5;
    });

    const formattedResults = filteredResults.map((result) => {
      const [record, _score] = result;
      return {
        filePath: pathModule.relative(basePath, record.metadata.filePath),
        fileContent: record.pageContent,
        lines: record.metadata.loc.lines,
      };
    });

    // If reranking is not required, return the initial filtered results.
    if (!rerank) {
      return formattedResults.slice(0, limit);
    }

    // Rerank the search results if needed.
    let rerankedResults;

    try {
      rerankedResults = await this.rerankSearchResults(query, formattedResults, limit);
    } catch (error) {
      console.error("Error occurred while reranking search results: ", error);
      return formattedResults.slice(0, limit);
    }

    if (rerankedResults && rerankedResults.length > 0) {
      return rerankedResults.slice(0, limit);
    }

    return formattedResults.slice(0, limit);
  }

  // A method to rerank the search results.
  async rerankSearchResults(query, searchResults, limit) {
    let rankedResults;

    try { // Error handling added
      const searchResultsWithIndex = searchResults.map((result, index) => {
        return { index: index, filePath: result.filePath, fileContent: result.fileContent };
      });

      const prompt = `I am making some code changes and I am searching project codebase for relevant code for this functionality, here is the search query: ${query}\n
Search engine search results are:

${JSON.stringify(searchResultsWithIndex)}

What array indexes of these search result objects in JSON array above are the most relevant code snippets to my search query?
Respond with JSON array only with actual array indexes in the order of relevance, drop irrelevant results. Return array with ${limit} relevant indexes.}`;
      const format = [3, 1, 4];

      const parsedRankings = await chatController.backgroundTask.run({ prompt, format });
      rankedResults = parsedRankings.filter((index) => index in searchResults).map((index) => searchResults[index]);
    } catch (error) {
      console.error("Error occurred while reranking search results: ", error);
      return searchResults;
    }

    return rankedResults;
  }

  // A method to save the embeddings.
  save() {
    settings.set(`project.${this.projectName}.embeddings`, JSON.stringify(this.vectorStore.memoryVectors));
  }

  // A method to load the embeddings.
  async load() {
    let serializedVectors;
    
    try { // Error handling added
      serializedVectors = settings.get(`project.${this.projectName}.embeddings`);
    } catch (error) {
      console.error(`Error occurred while loading embeddings for project ${this.projectName}: `, error);
      return;
    }
    
    if (!serializedVectors) {
      return;
    }
    
    try { // Error handling added
      const vectors = JSON.parse(serializedVectors);
      this.vectorStore.memoryVectors = vectors;
    } catch (error) {
      console.error("Error occurred while parsing serialized vectors: ", error);
    }
  }
}

module.exports = CodeEmbeddings;