const { Diff2HtmlUI } = require('diff2html/lib/ui/js/diff2html-ui');
const diff = require('diff');

function generateDiff(oldContent, newContent, oldFileName, newFileName) {
  if (oldContent && !oldContent.endsWith('\n')) {
    oldContent += '\n';
  }
  if (newContent && !newContent.endsWith('\n')) {
    newContent += '\n';
  }
  const patch = diff.createTwoFilesPatch(oldFileName, newFileName, oldContent, newContent);
  return patch;
}

function drawDiff(targetElement, diffString) {
  const diffConfig = {
    drawFileList: false,
    highlight: true,
    matching: 'none',
    colorScheme: chatController.settings.theme,
    showDiffOnly: true,
    fileContentToggle: false,
    renderNothingWhenEmpty: false,
    maxLineSizeInBlockForComparison: 200,
    diffStyle: 'word',
  };
  const diff2htmlUi = new Diff2HtmlUI(targetElement, diffString, diffConfig);
  diff2htmlUi.draw();
  diff2htmlUi.highlightCode();
}

module.exports = {
  generateDiff,
  drawDiff,
};
