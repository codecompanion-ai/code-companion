const diff = require('diff');
    return this.git.diff(['HEAD']);
    let diffResult;
      if (fileStatus) {
        let oldContent = '';
        let newContent = '';

        if (fileStatus.index === '?' && fileStatus.working_dir === '?') {
          // New file
          newContent = await fs.promises.readFile(filePath, 'utf8');
        } else if (fileStatus.working_dir === 'D') {
          // Deleted file
          oldContent = await this.git.show(['HEAD:' + selectedFile]);
        } else {
          // Modified file
          oldContent = await this.git.show(['HEAD:' + selectedFile]);
          newContent = await fs.promises.readFile(filePath, 'utf8');
        }

        diffResult = diff.createPatch(selectedFile, oldContent, newContent);
      // If no specific file is selected, show all changes
      diffResult = await this.getDiff();
    this.renderDiff(diffResult, diffConfig);
  }

  renderDiff(diffResult, diffConfig) {
    if (!diffResult) {
    const diff2htmlUi = new Diff2HtmlUI(targetElement, diffResult, diffConfig);
