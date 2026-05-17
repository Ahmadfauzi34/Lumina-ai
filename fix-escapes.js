import fs from 'fs';
import path from 'path';

const files = [
  'src/app/app.ts',
  'src/app/chat-input.component.ts',
  'src/app/chat-message.component.ts',
  'src/app/sidebar.component.ts',
  'src/app/markdown-renderer.ts',
  'src/app/gemini.service.ts',
  'src/app/utils.ts',
  'src/app/tools/registry.ts',
  'src/app/tools/implementations/file-tools.ts'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\\\`/g, '\`');
    content = content.replace(/\\\$/g, '$');
    content = content.replace(/\\\\n/g, '\\n');
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  } else {
    console.log('Not found', file);
  }
});
