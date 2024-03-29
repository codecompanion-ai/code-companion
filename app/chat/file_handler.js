const fileType = require('file-type').fromBuffer;
const readChunkSync = require('read-chunk').sync;
const reader = require('any-text');
const { isTextFile } = require('../utils');
const ImageHandler = require('./image_handler');

async function readFile(filepath) {
  try {
    const basename = path.basename(filepath);
    const buffer = readChunkSync(filepath, 0, 4100);
    const type = await fileType(buffer);
    if (type && ['docx', 'doc', 'xlsx', 'xls', 'txt', 'csv', 'json'].includes(type.ext)) {
      return await reader.getText(filepath);
    }
    // This is not a known binary file type
    if (isTextFile(buffer)) {
      return await readTextFile(filepath);
    }

    if (type && ['png', 'jpg', 'jpeg', 'gif'].includes(type.ext)) {
      const imageHandler = new ImageHandler();
      const imageDescription = await imageHandler.imageToText(filepath);
      return imageDescription;
    }

    chatController.chat.addFrontendMessage('error', `File type is not supported: (${basename})`);
  } catch (err) {
    chatController.chat.addFrontendMessage('error', `An error occurred reading the file: ${err.message}`);
    console.error(err);
  }
}

async function processFile(filepath) {
  const basename = path.basename(filepath);
  const fileTextContent = await readFile(filepath);
  if (!fileTextContent) return;

  const formattedData = `Content of the file ${basename}:\n\n${fileTextContent}\n\nUse content above of the file ${basename} to answer questions from user below`;
  const tokens = chatController.chat.countTokens(fileTextContent);

  chatController.chat.addBackendMessage('user', formattedData);
  chatController.chat.addFrontendMessage('file', `${basename} uploaded (${tokens} tokens)`);
}

function readTextFile(filePath) {
  onboardingController.showSpecificTips(['on_file_upload']);

  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        alert(`An error occurred reading the file: ${err.message}`);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function handleDrop(event) {
  viewController.updateLoadingIndicator(true);
  event.preventDefault();
  const { files } = event.dataTransfer;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await processFile(file.path);
  }
  viewController.updateLoadingIndicator(false);
}

module.exports = {
  processFile,
  handleDrop,
};
