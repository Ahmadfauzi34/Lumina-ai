import { subAgentTools } from './src/app/tools/implementations/sub-agent-tool';
import { registry as unifiedRegistry } from './src/app/tools/implementations/tool-registry';

class AppToolRegistry {
  getAllDefinitions(): any[] {
    return unifiedRegistry.snapshot().definitions;
  }

  toGeminiFunctions() {
    return this.getAllDefinitions().map(def => ({
      name: def.name,
      description: def.description,
      parameters: {
        type: 'OBJECT' as any,
        properties: Object.fromEntries(
          def.parameters.map((p: any) => [p.name, {
            type: typeof p.type === 'string' ? p.type.toUpperCase() as any : p.type,
            description: p.description,
            ...(p.enum ? { enum: p.enum } : {}),
            ...(p.type === 'array' || p.type === 'ARRAY' ? { 
              items: p.items ? { 
                type: typeof p.items.type === 'string' ? p.items.type.toUpperCase() as any : p.items.type,
                ...(p.items.properties ? {
                   properties: Object.fromEntries(
                    Object.entries(p.items.properties).map(([k, v]: [string, any]) => [k, { type: v.type.toUpperCase() }])
                   )
                } : {})
              } : { type: 'STRING' } 
            } : {}),
          }])
        ),
        required: def.parameters.filter((p: any) => p.required !== false).map((p: any) => p.name),
      },
    }));
  }
}

const reg = new AppToolRegistry();
console.log(JSON.stringify(reg.toGeminiFunctions().find(f => f.name === 'delegate_batch'), null, 2));
