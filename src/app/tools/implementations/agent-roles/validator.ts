import { RoleValidationResult } from './types';
import { roleRegistry, DEFAULT_ROLE } from './registry';

export class RoleValidator {
  /**
   * Memvalidasi apakah role yang diminta tersedia dan context terpenuhi.
   */
  static validate(roleId: string, providedContextKeys: string[] = []): RoleValidationResult {
    let resolvedRole = roleRegistry.getRole(roleId);
    const warnings: string[] = [];
    const missingContext: string[] = [];
    let suggestedAction: 'PROCEED' | 'ABORT' | 'HANDOFF' = 'PROCEED';

    if (!resolvedRole) {
      warnings.push(`Role [${roleId}] tidak ditemukan di registry. Fallback ke '${DEFAULT_ROLE}'.`);
      resolvedRole = roleRegistry.getRole(DEFAULT_ROLE)!;
      suggestedAction = 'HANDOFF';
    }

    if (resolvedRole.required_context && resolvedRole.required_context.length > 0) {
      for (const req of resolvedRole.required_context) {
        if (!providedContextKeys.includes(req)) {
          missingContext.push(req);
        }
      }
    }

    if (missingContext.length > 0) {
      warnings.push(`Konteks kurang detail: membutuhkan [${missingContext.join(', ')}].`);
    }

    return {
      valid: warnings.length === 0 && missingContext.length === 0,
      resolvedRole,
      warnings,
      missingContext,
      suggestedAction
    };
  }

  /**
   * Mengecek apakah target role potensial bentrok/overlap dengan role existing.
   */
  static checkOverlap(newRoleOwns: string[]): string[] {
    const overlappingRoles: string[] = [];
    const existing = roleRegistry.getAllRoles();
    
    for (const r of existing) {
      const match = r.owns.filter(o => newRoleOwns.includes(o));
      if (match.length >= 2) {
         overlappingRoles.push(r.id);
      }
    }
    return overlappingRoles;
  }

  static validateBatch(request: {
    taskDescription: string;
    tasks: { role: string; name: string }[];
  }): {
    isValid: boolean;
    gaps: string[];
    overlaps: { aspect: string; roles: string[] }[];
    enriched: { roleId: string; warnings: string[] }[];
  } {
    const gaps: string[] = [];
    const overlaps: { aspect: string; roles: string[] }[] = [];
    const enriched: { roleId: string; warnings: string[] }[] = [];

    // 1. Resolve semua role
    const resolved = request.tasks.map(t => ({
      ...t,
      def: roleRegistry.getRole(t.role),
      fallback: !roleRegistry.getRole(t.role)
    }));

    // Warning untuk role tidak dikenal
    for (const r of resolved) {
      if (r.fallback) {
        enriched.push({ roleId: r.role, warnings: [`Role '${r.role}' tidak terdaftar, fallback ke general.`] });
      } else {
        enriched.push({ roleId: r.role, warnings: [] });
      }
    }

    // 2. Scope gap detection (sederhana, berbasis keyword)
    const desc = request.taskDescription.toLowerCase();
    const aspectsNeeded: string[] = [];
    
    // Keyword map minimal — bisa di-extend
    if (desc.includes('database') || desc.includes('schema') || desc.includes('query')) aspectsNeeded.push('database-schema', 'query-optimization');
    if (desc.includes('api') || desc.includes('endpoint') || desc.includes('server')) aspectsNeeded.push('api-design', 'server-logic');
    if (desc.includes('ui') || desc.includes('frontend') || desc.includes('css')) aspectsNeeded.push('ui-components', 'css');
    if (desc.includes('security') || desc.includes('auth') || desc.includes('vulnerab')) aspectsNeeded.push('security-checks');
    if (desc.includes('test') || desc.includes('bug')) aspectsNeeded.push('unit-testing');

    const coveredAspects = new Set<string>();
    for (const r of resolved) {
      if (r.def) r.def.owns.forEach(o => coveredAspects.add(o));
    }

    for (const needed of aspectsNeeded) {
      if (!coveredAspects.has(needed)) gaps.push(needed);
    }

    // 3. Overlap detection (criticality-based, bukan count-based)
    const ownershipMap = new Map<string, string[]>();
    for (const r of resolved) {
      if (!r.def) continue;
      for (const o of r.def.owns) {
        const arr = ownershipMap.get(o) ?? [];
        arr.push(r.role);
        ownershipMap.set(o, arr);
      }
    }

    for (const [aspect, roles] of ownershipMap) {
      if (roles.length > 1) {
        // Cek apakah ada exclusion conflict
        const hasConflict = resolved.some(r => 
          r.def?.excludes.includes(aspect) && roles.includes(r.role)
        );
        if (hasConflict || roles.length > 2) {
          overlaps.push({ aspect, roles });
        }
      }
    }

    return { isValid: gaps.length === 0 && overlaps.length === 0, gaps, overlaps, enriched };
  }
}

