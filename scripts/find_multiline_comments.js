const fs = require('fs');
const path = require('path');

// Find all multi-line comments in a file
function findMultilineComments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const results = [];

  // Track consecutive single-line comments
  let commentBlock = [];
  let blockStartLine = -1;

  // Track block comments (/* */)
  let inBlockComment = false;
  let blockCommentStart = -1;
  let blockCommentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Handle block comments /* */
    if (!inBlockComment && trimmed.includes('/*')) {
      inBlockComment = true;
      blockCommentStart = lineNum;
      blockCommentLines = [line];
      continue;
    }

    if (inBlockComment) {
      blockCommentLines.push(line);
      if (trimmed.includes('*/')) {
        inBlockComment = false;
        if (blockCommentLines.length >= 2) {
          results.push({
            type: 'block',
            startLine: blockCommentStart,
            endLine: lineNum,
            lines: blockCommentLines
          });
        }
        blockCommentLines = [];
        blockCommentStart = -1;
      }
      continue;
    }

    // Handle single-line comments //
    if (trimmed.startsWith('//')) {
      if (commentBlock.length === 0) {
        blockStartLine = lineNum;
      }
      commentBlock.push(line);
    } else if (commentBlock.length > 0) {
      // End of comment block
      if (commentBlock.length >= 2) {
        results.push({
          type: 'single',
          startLine: blockStartLine,
          endLine: lineNum - 1,
          lines: commentBlock
        });
      }
      commentBlock = [];
      blockStartLine = -1;
    }
  }

  // Handle trailing comment block
  if (commentBlock.length >= 2) {
    results.push({
      type: 'single',
      startLine: blockStartLine,
      endLine: lines.length,
      lines: commentBlock
    });
  }

  return results;
}

// Main execution
const files = [
  'mofacts/client/views/experiment/card.js',
  'mofacts/client/views/experiment/card.html'
];



files.forEach(relPath => {
  const fullPath = path.join(process.cwd(), relPath);
  
  
  

  if (!fs.existsSync(fullPath)) {
    
    return;
  }

  const comments = findMultilineComments(fullPath);

  if (comments.length === 0) {
    
    return;
  }

  

  comments.forEach((comment, idx) => {
    const typeLabel = comment.type === 'block' ? 'BLOCK (/* */)' : 'CONSECUTIVE (//)';
    
    
    

    // Show first 3 and last 1 line of comment
    const preview = comment.lines.length <= 4
      ? comment.lines
      : [...comment.lines.slice(0, 3), '      ...', comment.lines[comment.lines.length - 1]];

    preview.forEach(line => {
      const display = typeof line === 'string' ? line : line;
      
    });
    
  });
});




