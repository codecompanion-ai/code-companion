const { v4: uuidv4 } = require('uuid');

// Bootstrap has been imported for UI components
const bootstrap = require('bootstrap/dist/js/bootstrap.bundle'); 
const saveChatModal = new bootstrap.Modal(document.getElementById('saveChatModal'));

class ChatHistory {
  save() {
    // Generate new UUID for every chat history
    const id = uuidv4();
    // Get current date and time
    const date = new Date().toISOString();
    // Title of chat
    const titleElement = document.getElementById('chatTitle');
    const title = titleElement.value || 'Untitled';
    // Reset the chatTitle input element
    titleElement.value = '';

    let record = {
      id,
      title,
      date,
      chat: {
        frontendMessages: chatController.chat.frontendMessages,
        backendMessages: chatController.chat.backendMessages,
        currentId: chatController.chat.currentId,
        lastBackendMessageId: chatController.chat.lastBackendMessageId,
      },
      workingDir: chatController.codeAgent.currentWorkingDir,
      selectedModel: chatController.selectedModel,
    };

    let chatHistory = settings.get('chatHistory', {});
    chatHistory[id] = record;
    settings.set('chatHistory', chatHistory);
    saveChatModal.hide();

    renderSystemMessage('Chat saved.');
  }

  delete(id) {
    let chatHistory = settings.get('chatHistory', {});
    delete chatHistory[id];
    settings.set('chatHistory', chatHistory);
    // Load the chat again after deletion
    this.load();
  }

  retrieveAll() {
    // Retrieve all the chat history
    const records = Object.values(settings.get('chatHistory', {}));
    // Sort in descending order of date
    return records.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async restoreChat(id) {
    const record = settings.get('chatHistory', {})[id];
    if (record) {
      chatController.setModel(record.selectedModel);

      Object.assign(chatController.chat, record.chat);
      chatController.chat.updateUI();

      chatController.codeAgent.projectHandler.openProject(record.workingDir);
    }
  }

  deleteAll() {
    // Delete all chat history
    settings.set('chatHistory', {});
    // Load an empty chat after deleting all
    this.load();
  }

  renderUI() {
    const records = this.retrieveAll();

    if (!records.length) {
      return '<div class="text-muted">No history records found.</div>';
    }

    const recordRows = records
      .map(
        (record) => `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
          <a href="#" onclick="event.preventDefault(); chatController.chat.history.restoreChat('${record.id}')" class="text-decoration-none text-body text-truncate">
            <i class="bi bi-chat-left me-2"></i>
            ${record.title}
          </a>
          <button class="btn btn-sm" onclick="event.preventDefault(); chatController.chat.history.delete('${record.id}')"><i class="bi bi-trash"></i></button>
        </div>
    `,
      )
      .join('');

    return `
    <div class="d-flex justify-content-end mb-3">
      <button onclick="chatController.chat.history.deleteAll()" class="btn btn-sm btn-outline-secondary"><i class="bi bi-trash"></i> Delete all</button>
    </div>
    ${recordRows}
  `;
  }

  load() {
    // Refresh UI with chat history
    document.getElementById('chatHistory').innerHTML = this.renderUI();
  }

  showModal() {
    // If chatHandler is empty, then there is nothing to save
    if (chatController.chat.isEmpty()) {
      renderSystemMessage('Nothing to save.');
      return;
    }
    saveChatModal.show();
    // Automatically focus to chatTitle input field
    document.getElementById('chatTitle').focus();
  }
}

module.exports = ChatHistory;
