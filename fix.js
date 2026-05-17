import fs from 'fs';

let content = fs.readFileSync('src/app/tools/implementations/file-tools.ts', 'utf8');
content = content.split('executor: async (args) =>').join('executor: async (args: any) =>');
content = content.split('allFiles.forEach(file =>').join('allFiles.forEach((file: any) =>');
content = content.split('lines.forEach((line, index) =>').join('lines.forEach((line: string, index: number) =>');
fs.writeFileSync('src/app/tools/implementations/file-tools.ts', content);

let regContent = fs.readFileSync('src/app/tools/registry.ts', 'utf8');
regContent = regContent.split("const tz = String(args.timezone || 'Asia/Jakarta');").join("const tz = String(args?.['timezone'] || 'Asia/Jakarta');");
regContent = regContent.split("switch (args.format) {").join("switch (args?.['format']) {");
regContent = regContent.split("const key = String(args.key);").join("const key = String(args?.['key']);");
regContent = regContent.split("const scope = String(args.scope || 'session');").join("const scope = String(args?.['scope'] || 'session');");
regContent = regContent.split("const value = String(args.value);").join("const value = String(args?.['value']);");
regContent = regContent.split("const ttl = Number(args.ttl) || 0;").join("const ttl = Number(args?.['ttl']) || 0;");
regContent = regContent.split("const scope = String(args.scope || '');").join("const scope = String(args?.['scope'] || '');");
regContent = regContent.split("const pattern = String(args.pattern || '');").join("const pattern = String(args?.['pattern'] || '');");
regContent = regContent.split('executor: async () =>').join('executor: async (args: any) =>');
regContent = regContent.split('executor: async (args) =>').join('executor: async (args: any) =>');
fs.writeFileSync('src/app/tools/registry.ts', regContent);

let chatContent = fs.readFileSync('src/app/chat-message.component.ts', 'utf8');
chatContent = chatContent.replace(/const thinkMatch = raw.match\\(.*\\);/, "const thinkMatch = raw.match(/<think>([\\\\s\\\\S]*?)<\\\\/think>/ig);");
chatContent = chatContent.replace(/raw = raw.replace\\(.*\\);/, "raw = raw.replace(/<think>[\\\\s\\\\S]*?<\\\\/think>/ig, '');");
fs.writeFileSync('src/app/chat-message.component.ts', chatContent);
