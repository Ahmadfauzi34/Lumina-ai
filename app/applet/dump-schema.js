import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('ts-node/esm', pathToFileURL('./'));

import { toolRegistry } from './src/app/tools/registry.ts';

console.log(JSON.stringify(toolRegistry.toGeminiFunctions(), null, 2));
