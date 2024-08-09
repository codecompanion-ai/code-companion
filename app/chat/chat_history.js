const { v4: uuidv4 } = require('uuid');

const saveChatModal = new bootstrap.Modal(document.getElementById('saveChatModal'));

class ChatHistory {
  save() {
    const id = uuidv4();
    const date = new Date().toISOString();
    const titleElement = document.getElementById('chatTitle');
    const title = titleElement.value || 'Untitled';
    titleElement.value = '';

    const record = {
      id,
      title,
      date,
      chat: {
        frontendMessages: chatController.chat.frontendMessages,
        backendMessages: chatController.chat.backendMessages,
        currentId: chatController.chat.currentId,
        lastBackendMessageId: chatController.chat.lastBackendMessageId,
        taskTitle: chatController.chat.taskTitle,
        task: chatController.chat.task,
        taskPlan: chatController.chat.taskPlan,
        taskContext: chatController.chat.taskContext,
        taskContextFiles: chatController.chat.chatContextBuilder.taskContextFiles,
      },
      workingDir: chatController.agent.currentWorkingDir,
      selectedModel: chatController.settings.selectedModel,
    };

    const chatHistory = localStorage.get('chatHistory', {});
    chatHistory[id] = record;
    localStorage.set('chatHistory', chatHistory);
    saveChatModal.hide();
    viewController.updateFooterMessage('Chat saved.');
  }

  delete(id) {
    const chatHistory = localStorage.get('chatHistory', {});
    delete chatHistory[id];
    localStorage.set('chatHistory', chatHistory);
    this.load();
  }

  retrieveAll() {
    const records = Object.values(localStorage.get('chatHistory', {}));
    return records.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async restoreChat(id) {
    const record = localStorage.get('chatHistory', {})[id];
    if (record) {
      console.log('record', record);
      chatController.saveSetting('selectedModel', record.selectedModel);
      Object.assign(chatController.chat, record.chat);
      chatController.chat.chatContextBuilder.taskContextFiles = record.chat.taskContextFiles;
      chatController.chat.updateUI();
      chatController.taskTab.render();
      chatController.agent.projectController.openProject(record.workingDir);
    }
  }

  deleteAll() {
    localStorage.set('chatHistory', {});
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
    document.getElementById('chatHistory').innerHTML = this.renderUI();
  }

  showModal() {
    if (chatController.chat.isEmpty()) {
      viewController.updateFooterMessage('Nothing to save.');
      return;
    }
    saveChatModal.show();
    const chatTitleInput = document.getElementById('chatTitle');
    chatTitleInput.value = chatController.chat.taskTitle || '';
    chatTitleInput.focus();
  }
}

module.exports = ChatHistory;
