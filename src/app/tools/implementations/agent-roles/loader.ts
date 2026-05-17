import { AgentRoleDefinition } from './types';
import { roleRegistry } from './registry';
import { roleDexieStore } from './dexie-store';

export class AgentRoleLoader {
  /**
   * Initializes the role registry by loading overrides from Dexie DB.
   * This allows user-configured roles to override the defaults.
   */
  async loadRolesFromDB() {
    const customRoles = await roleDexieStore.loadAllRoles();
    
    for (const dbRole of customRoles) {
      const def: AgentRoleDefinition = {
        id: dbRole.id,
        domain: dbRole.domain,
        specialization: dbRole.specialization,
        owns: dbRole.owns,
        excludes: dbRole.excludes,
        required_context: dbRole.required_context,
        output_schema: dbRole.output_schema,
      };
      
      // Override or register new dynamic role
      roleRegistry.roles.set(def.id, def);
    }
  }

  /**
   * Parse a Markdown string containing YAML-like or JSON frontmatter to an AgentRoleDefinition.
   */
  static parseMarkdown(content: string): AgentRoleDefinition | null {
    try {
      // Basic extraction of YAML-like frontmatter
      const regex = /---\n([\s\S]*?)\n---/;
      const match = content.match(regex);
      if (!match) return null;

      const metadataStr = match[1];
      const parsed: Record<string, any> = {};
      
      const lines = metadataStr.split('\n');
      let currentKey = '';
      let currentArray: string[] = [];
      let inArray = false;

      // Simple pseudo YAML parser for string + arrays
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (inArray && trimmed.startsWith('-')) {
          currentArray.push(trimmed.slice(1).trim().replace(/^['"]|['"]$/g, ''));
        } else if (trimmed.includes(':')) {
          const idx = line.indexOf(':');
          const key = line.slice(0, idx).trim();
          const val = line.slice(idx + 1).trim();
          
          if (!val || val === '') {
            inArray = true;
            currentKey = key;
            currentArray = [];
            parsed[currentKey] = currentArray;
          } else {
            inArray = false;
            parsed[key] = val.replace(/^['"]|['"]$/g, '');
          }
        }
      }

      if (!parsed['id'] || !parsed['domain']) {
        return null; // Invalid missing required fields
      }

      return {
        id: parsed['id'],
        domain: parsed['domain'],
        specialization: parsed['specialization'] || '',
        owns: Array.isArray(parsed['owns']) ? parsed['owns'] : [],
        excludes: Array.isArray(parsed['excludes']) ? parsed['excludes'] : [],
        required_context: Array.isArray(parsed['required_context']) ? parsed['required_context'] : [],
        output_schema: parsed['output_schema'] || 'TEXT',
      };
    } catch (e) {
      console.error("Failed to parse role markdown", e);
      return null;
    }
  }
}

export const roleLoader = new AgentRoleLoader();
