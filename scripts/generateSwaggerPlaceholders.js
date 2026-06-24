// scripts/generateSwaggerPlaceholders.js
const fs = require('fs');
const path = require('path');

const routesDir = path.resolve(__dirname, '..', 'backend', 'src', 'routes');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes('@swagger')) {
        const placeholder = `/**\n * @swagger\n * /${path.basename(fullPath, path.extname(fullPath))}:{\n *   get:\n *     summary: Placeholder endpoint\n *     responses:\n *       200:\n *         description: Successful response\n * }\n */\n`;
        // Prepend placeholder
        content = placeholder + '\n' + content;
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Added placeholder to', fullPath);
      }
    }
  }
}

walk(routesDir);
console.log('Placeholder generation completed.');
