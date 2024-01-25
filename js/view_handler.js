const { modelOptions, defaultModel } = require('./static/models_config');
const { exec } = require('child_process');

function populateModelDropdown(selectedModel) {
  const selectModel = selectedModel || defaultModel;
  const select = document.getElementById('modelDropdown');
  for (const key in modelOptions) {
    const option = document.createElement('option');
    option.value = key;
    option.innerText = modelOptions[key];
    if (key === selectModel) {
      option.selected = true;
    }
    select.appendChild(option);
  }
}

function scrollToBottom() {
  const container = document.getElementById('search_result_container');
  const lastMessage = container.lastElementChild;

  if (lastMessage) {
    const rect = lastMessage.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const scrollPos = rect.bottom - bodyRect.top + 150;
    window.scrollTo({
      top: scrollPos,
      behavior: 'smooth',
    });
  }
}

async function copyCode(block, button) {
  const code = block.querySelector('code');
  const text = code.innerText;
  await navigator.clipboard.writeText(text);
  button.innerHTML = '<i class="bi bi-clipboard-check"></i>';

  setTimeout(() => {
    button.innerHTML = '<i class="bi bi-clipboard"></i>';
  }, 1000);
}

function addCopyCodeButtons() {
  const blocks = document.querySelectorAll('pre');
  blocks.forEach((block) => {
    block.classList.add('hljs');
    if (navigator.clipboard) {
      const button = document.createElement('button');
      button.classList.add('btn', 'btn-sm', 'position-absolute');
      button.style.top = '8px';
      button.style.right = '8px';
      button.innerHTML = '<i class="bi bi-clipboard"></i>';
      block.style.position = 'relative';
      block.appendChild(button);

      button.addEventListener('click', async () => {
        await copyCode(block, button);
      });
    }
  });
}

// UI elements and event handlers for GPT-4 Vision related tasks.
function prepareGP4VisionUI() {
  // Assuming we have the following additional UI elements (compliant with bootstrap):
  // input field with id="visionInput"
  // result display area with id="visionResult"
  // Button to trigger vision process with id="visionButton"

  const visionInput = document.getElementById('visionInput');
  const visionButton = document.getElementById('visionButton');
  const visionResult = document.getElementById('visionResult');
  
  visionButton.addEventListener('click', () => {
    // make use of the CodeAgent instance in the global scope
    agent.visionClient.process(visionInput.value)
      .then(result => visionResult.innerText = result)
      .catch(err => console.error(err));
  });
}

function formatResponse(item) {
  // Existing code...
}

//(existing function declarations...)

// Existing exports...
module.exports = {
  populateModelDropdown,
  copyCode,
  changeTheme,
  renderSystemMessage,
  updateLoadingIndicator,
  onShow,
  selectDirectory,
  formatResponse,
  addCopyCodeButtons,
  scrollToBottom,
  saveApiKey,
  saveMaxTokensPerRequest,
  saveMaxTokensPerChat,
  openFileDialogue,
  saveMaxFilesToEmbed,
  saveCommandToOpenFile,
  openFile,

  // Export also our new function
  prepareGP4VisionUI
};
