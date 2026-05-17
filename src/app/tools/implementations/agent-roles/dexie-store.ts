import { db, AgentRoleDB } from '../../../core/services/db.service';
import { AgentRoleDefinition } from './types';

export class AgentRoleDexieStore {
  /**
   * Save a role (parsed from MD or elsewhere) to Dexie DB.
   */
  async saveRole(role: AgentRoleDefinition, markdownContent?: string): Promise<void> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;

    await db.agent_roles.put({
      id: role.id,
      domain: role.domain,
      specialization: role.specialization,
      owns: role.owns,
      excludes: role.excludes,
      required_context: role.required_context,
      output_schema: role.output_schema,
      markdownContent,
      updatedAt: Date.now()
    });
  }

  /**
   * Load all custom overrides from Dexie.
   */
  async loadAllRoles(): Promise<AgentRoleDB[]> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return [];
    try {
      return await db.agent_roles.toArray();
    } catch (e) {
      console.warn("Failed to load agent roles from Dexie", e);
      return [];
    }
  }

  /**
   * Load a specific role from Dexie.
   */
  async getRole(id: string): Promise<AgentRoleDB | undefined> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return undefined;
    try {
      return await db.agent_roles.get(id);
    } catch (e) {
      return undefined;
    }
  }
}

export const roleDexieStore = new AgentRoleDexieStore();
