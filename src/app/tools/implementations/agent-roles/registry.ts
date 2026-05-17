import { AgentRoleDefinition } from './types';

export const DEFAULT_ROLE = 'general-assistant';

export class AgentRoleRegistry {
  public roles = new Map<string, AgentRoleDefinition>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    const defaultRoles: AgentRoleDefinition[] = [
      // ============================================================
      // PYTHON ECOSYSTEM (8 Roles)
      // ============================================================
      {
        id: 'python-backend-engineer',
        domain: 'Python / Backend',
        specialization: 'API & Service Development dengan Python (FastAPI, Django, Flask, Async)',
        owns: [
          'fastapi', 'django', 'flask', 'asyncio', 'sqlalchemy', 'pydantic',
          'api-design', 'dependency-injection', 'middleware', 'background-jobs',
          'python-typing', 'python-packaging', 'wsgi-asgi'
        ],
        excludes: [
          'frontend-styling', 'browser-dom', 'mobile-development',
          'machine-learning-training', 'infrastructure-provisioning'
        ],
        required_context: ['framework_preference', 'api_spec', 'database_layer'],
        output_schema: 'PYTHON_BACKEND_CODE_OR_OPENAPI_SPECS'
      },
      {
        id: 'python-data-engineer',
        domain: 'Python / Data Engineering',
        specialization: 'ETL, Data Pipeline, Orchestration, dan Data Quality',
        owns: [
          'etl-pipeline', 'apache-airflow', 'apache-spark', 'dbt', 'pandas',
          'data-validation', 'schema-evolution', 'data-lineage', 'batch-processing',
          'stream-processing', 'parquet', 'delta-lake', 'data-warehousing'
        ],
        excludes: [
          'model-training', 'hyperparameter-tuning', 'ui-development',
          'frontend-state-management'
        ],
        required_context: ['data_sources', 'target_destination', 'volume_scale', 'schedule_requirement'],
        output_schema: 'DATA_PIPELINE_CODE_OR_ETL_DESIGN'
      },
      {
        id: 'python-ml-engineer',
        domain: 'Python / ML Engineering',
        specialization: 'Model Serving, Feature Engineering, dan ML Pipeline Production',
        owns: [
          'feature-engineering', 'model-serving', 'mlflow', 'bentoml', 'onnx',
          'vector-database', 'embedding-pipeline', 'inference-optimization',
          'model-versioning', 'a-b-testing', 'feature-store', 'data-drift-detection'
        ],
        excludes: [
          'frontend-development', 'database-schema-design', 'ui-animations',
          'deep-research-theory'  // fokus implementasi, bukan riset paper
        ],
        required_context: ['model_type', 'serving_constraint', 'latency_sla', 'data_schema'],
        output_schema: 'ML_PIPELINE_CODE_OR_SERVING_ARCHITECTURE'
      },
      {
        id: 'python-devops-engineer',
        domain: 'Python / DevOps & Infrastructure',
        specialization: 'Infrastructure as Code, Deployment, dan Observability dengan Python',
        owns: [
          'docker', 'kubernetes', 'terraform', 'ansible', 'github-actions',
          'ci-cd-pipeline', 'python-deployment', 'gunicorn', 'uvicorn',
          'monitoring', 'logging', 'prometheus', 'grafana', 'helm-charts'
        ],
        excludes: [
          'business-logic-implementation', 'ui-component-design', 'model-training-code',
          'database-query-optimization'
        ],
        required_context: ['deployment_target', 'scale_estimate', 'compliance_requirement'],
        output_schema: 'INFRA_CODE_OR_DEPLOYMENT_MANIFEST'
      },
      {
        id: 'python-automation-engineer',
        domain: 'Python / Automation & Scripting',
        specialization: 'Task Automation, Web Scraping, RPA, dan System Scripting',
        owns: [
          'selenium', 'playwright', 'beautifulsoup', 'scrapy', 'requests',
          'rpa', 'cron-job', 'file-processing', 'pdf-generation', 'excel-automation',
          'api-integration-script', 'webhook-handler', 'batch-script'
        ],
        excludes: [
          'system-architecture', 'database-design', 'frontend-spa',
          'machine-learning-model'
        ],
        required_context: ['automation_target', 'trigger_mechanism', 'output_destination'],
        output_schema: 'AUTOMATION_SCRIPT_OR_BOT_CODE'
      },
      {
        id: 'python-scientist',
        domain: 'Python / Scientific Computing',
        specialization: 'Numerical Computing, Simulation, dan Research Code',
        owns: [
          'numpy', 'scipy', 'pandas', 'matplotlib', 'plotly', 'jupyter',
          'statistical-analysis', 'numerical-simulation', 'optimization-algorithm',
          'differential-equations', 'signal-processing', 'image-processing'
        ],
        excludes: [
          'web-development', 'database-administration', 'frontend-framework',
          'cloud-infrastructure'
        ],
        required_context: ['dataset_description', 'analysis_goal', 'expected_visualization'],
        output_schema: 'NOTEBOOK_OR_ANALYSIS_SCRIPT'
      },
      {
        id: 'python-optimizer',
        domain: 'Python / Performance Engineering',
        specialization: 'Profiling, Optimization, dan Python Acceleration',
        owns: [
          'profiling', 'cprofile', 'line-profiler', 'memory-profiler', 'tracemalloc',
          'cython', 'mypyc', 'numba', 'rust-extension', 'pyo3',
          'async-optimization', 'concurrency', 'multiprocessing', 'gil-workaround'
        ],
        excludes: [
          'feature-development', 'ui-design', 'business-requirement-analysis',
          'database-schema-design'
        ],
        required_context: ['bottleneck_description', 'performance_target', 'current_metrics'],
        output_schema: 'OPTIMIZATION_REPORT_OR_ACCELERATED_CODE'
      },
      {
        id: 'python-qa-engineer',
        domain: 'Python / Quality Assurance',
        specialization: 'Testing Strategy, Test Automation, dan Code Quality',
        owns: [
          'pytest', 'unittest', 'hypothesis', 'property-based-testing', 'mocking',
          'test-coverage', 'mutation-testing', 'tdd', 'integration-testing',
          'load-testing', 'locust', 'code-quality', 'ruff', 'mypy', 'bandit'
        ],
        excludes: [
          'feature-implementation', 'production-deployment', 'ui-visual-design',
          'infrastructure-provisioning'
        ],
        required_context: ['code_under_test', 'test_scope', 'coverage_target'],
        output_schema: 'TEST_SUITE_OR_QUALITY_REPORT'
      },

      // ============================================================
      // DATABASE & DATA (2 Roles)
      // ============================================================
      {
        id: 'database-engineer',
        domain: 'Database',
        specialization: 'Schema Design, Query Optimization, dan Data Integrity',
        owns: [
          'schema-design', 'normalization', 'index-strategy', 'query-optimization',
          'transaction-design', 'migration-strategy', 'postgresql', 'mysql',
          'mongodb', 'redis', 'data-integrity', 'partitioning', 'replication'
        ],
        excludes: [
          'frontend-logic', 'api-business-logic', 'ui-styling',
          'machine-learning-pipeline'
        ],
        required_context: ['db_engine', 'data_volume', 'access_pattern', 'consistency_model'],
        output_schema: 'SCHEMA_DESIGN_OR_QUERY_PLAN'
      },
      {
        id: 'data-analyst',
        domain: 'Data Analytics',
        specialization: 'SQL Analysis, Dashboard Logic, dan Business Metrics',
        owns: [
          'sql-analysis', 'window-functions', 'cte', 'reporting-query',
          'business-metrics', 'kpi-calculation', 'data-visualization-logic',
          'dashboard-query', 'etl-sql', 'data-cleaning-sql'
        ],
        excludes: [
          'python-pandas-pipeline', 'model-training', 'frontend-dashboard-ui',
          'infrastructure-setup'
        ],
        required_context: ['tables_schema', 'business_question', 'time_granularity'],
        output_schema: 'SQL_QUERIES_OR_ANALYSIS_REPORT'
      },

      // ============================================================
      // WEB DEVELOPMENT (3 Roles)
      // ============================================================
      {
        id: 'frontend-engineer',
        domain: 'UI/UX',
        specialization: 'Frontend Development, Component Design, dan Browser Performance',
        owns: [
          'react', 'vue', 'angular', 'svelte', 'typescript', 'tailwind',
          'css', 'html', 'dom-api', 'accessibility', 'responsive-design',
          'state-management', 'webpack', 'vite', 'frontend-performance',
          'ui-components', 'design-system', 'animations'
        ],
        excludes: [
          'database-design', 'server-architecture', 'security-audits',
          'api-backend-logic', 'infrastructure'
        ],
        required_context: ['ui_requirements', 'target_framework', 'design_reference'],
        output_schema: 'UI_COMPONENT_CODE_OR_DESIGN_SPECS'
      },
      {
        id: 'backend-engineer',
        domain: 'Server & Logic',
        specialization: 'Backend Architecture, API Design, dan System Integration (Language Agnostic)',
        owns: [
          'api-design', 'rest', 'graphql', 'grpc', 'microservices',
          'server-logic', 'authentication', 'authorization', 'rate-limiting',
          'caching-strategy', 'message-queue', 'event-driven', 'webhook'
        ],
        excludes: [
          'ui-styling', 'browser-animations', 'frontend-state-management',
          'database-administration'
        ],
        required_context: ['data_models', 'business_logic', 'integration_targets'],
        output_schema: 'SYSTEM_ARCHITECTURE_OR_BACKEND_CODE'
      },
      {
        id: 'fullstack-engineer',
        domain: 'Fullstack',
        specialization: 'End-to-End Feature Development dari DB ke UI',
        owns: [
          'api-integration', 'fullstack-feature', 'crud-development',
          'server-client-bridge', 'nextjs', 'nuxt', 'django-templates',
          'simple-database-schema', 'basic-deployment'
        ],
        excludes: [
          'complex-ml-pipeline', 'deep-security-audit', 'high-scale-architecture',
          'kernel-development'
        ],
        required_context: ['feature_spec', 'stack_preference', 'user_flow'],
        output_schema: 'FULLSTACK_FEATURE_CODE'
      },

      // ============================================================
      // SECURITY & COMPLIANCE (2 Roles)
      // ============================================================
      {
        id: 'security-auditor',
        domain: 'Security',
        specialization: 'Application Security, Vulnerability Assessment, dan Secure Coding',
        owns: [
          'input-validation', 'auth-mechanism', 'session-management',
          'dependency-vulnerability', 'secrets-management', 'owasp-top-10',
          'secure-coding', 'cryptography-usage', 'penetration-testing-logic',
          'compliance-check', 'gdpr', 'security-headers'
        ],
        excludes: [
          'feature-development', 'ui-design', 'performance-optimization',
          'database-query-tuning'
        ],
        required_context: ['code_to_audit', 'threat_model', 'compliance_framework'],
        output_schema: 'SECURITY_AUDIT_REPORT'
      },
      {
        id: 'appsec-engineer',
        domain: 'Application Security',
        specialization: 'Security Architecture, Threat Modeling, dan SDL',
        owns: [
          'threat-modeling', 'secure-sdlc', 'security-architecture',
          'api-security', 'zero-trust-design', 'security-policy',
          'incident-response-plan', 'vulnerability-management'
        ],
        excludes: [
          'feature-implementation', 'ui-frontend-code', 'database-migration'
        ],
        required_context: ['system_architecture', 'data_classification', 'compliance_requirement'],
        output_schema: 'THREAT_MODEL_OR_SECURITY_ARCHITECTURE'
      },

      // ============================================================
      // INFRASTRUCTURE & DEVOPS (2 Roles)
      // ============================================================
      {
        id: 'cloud-architect',
        domain: 'Cloud & Infrastructure',
        specialization: 'Cloud Architecture, Cost Optimization, dan Scalability Design',
        owns: [
          'aws', 'gcp', 'azure', 'serverless', 'lambda', 'cloud-run',
          'vpc-design', 'load-balancer', 'auto-scaling', 'cost-optimization',
          'multi-region', 'disaster-recovery', 'backup-strategy'
        ],
        excludes: [
          'application-code', 'business-logic', 'frontend-components',
          'ml-model-training'
        ],
        required_context: ['traffic_estimate', 'budget_constraint', 'compliance_zone'],
        output_schema: 'CLOUD_ARCHITECTURE_DIAGRAM_OR_TF_CODE'
      },
      {
        id: 'site-reliability-engineer',
        domain: 'SRE',
        specialization: 'Reliability, Observability, dan Incident Response',
        owns: [
          'observability', 'monitoring', 'alerting', 'slo-sli',
          'incident-response', 'postmortem', 'chaos-engineering',
          'capacity-planning', 'on-call-runbook', 'log-aggregation'
        ],
        excludes: [
          'feature-development', 'ui-implementation', 'database-schema-design'
        ],
        required_context: ['service_list', 'current_slo', 'incident_history'],
        output_schema: 'SRE_RUNBOOK_OR_OBSERVABILITY_CONFIG'
      },

      // ============================================================
      // ALGORITHMS & SYSTEMS (2 Roles)
      // ============================================================
      {
        id: 'algorithm-engineer',
        domain: 'Algorithms & DS',
        specialization: 'Algorithm Design, Complexity Analysis, dan Optimization',
        owns: [
          'algorithm-design', 'data-structures', 'complexity-analysis',
          'graph-algorithm', 'dynamic-programming', 'greedy-algorithm',
          'sorting', 'searching', 'string-algorithm', 'geometric-algorithm'
        ],
        excludes: [
          'ui-development', 'database-administration', 'infrastructure-setup',
          'business-logic-implementation'
        ],
        required_context: ['problem_constraints', 'input_size', 'performance_requirement'],
        output_schema: 'ALGORITHM_IMPLEMENTATION_OR_COMPLEXITY_ANALYSIS'
      },
      {
        id: 'systems-programmer',
        domain: 'Systems Programming',
        specialization: 'Low-Level Development, Memory Management, dan High Performance',
        owns: [
          'c', 'cpp', 'rust', 'zig', 'memory-management', 'cache-optimization',
          'concurrent-programming', 'lock-free', 'simd', 'kernel-module',
          'embedded', 'bare-metal', 'ffi', 'zero-copy'
        ],
        excludes: [
          'web-frontend', 'business-application', 'database-query-optimization',
          'ui-design'
        ],
        required_context: ['target_platform', 'memory_constraint', 'performance_target'],
        output_schema: 'SYSTEMS_CODE_OR_PERFORMANCE_REPORT'
      },

      // ============================================================
      // MOBILE & EDGE (2 Roles)
      // ============================================================
      {
        id: 'mobile-developer',
        domain: 'Mobile',
        specialization: 'Mobile App Development (Native & Cross-Platform)',
        owns: [
          'ios', 'android', 'swift', 'kotlin', 'flutter', 'react-native',
          'mobile-ui', 'gesture', 'animation', 'offline-storage',
          'push-notification', 'app-store', 'mobile-performance'
        ],
        excludes: [
          'web-backend', 'database-server', 'cloud-infrastructure',
          'ml-training'
        ],
        required_context: ['platform_target', 'ui_mockup', 'api_contract'],
        output_schema: 'MOBILE_CODE_OR_UI_IMPLEMENTATION'
      },
      {
        id: 'edge-iot-engineer',
        domain: 'Edge / IoT',
        specialization: 'IoT Firmware, Edge Computing, dan Sensor Integration',
        owns: [
          'mqtt', 'coap', 'embedded-python', 'micropython', 'arduino',
          'raspberry-pi', 'sensor-integration', 'edge-inference',
          'firmware-update', 'low-power-design', 'gpio', 'serial-communication'
        ],
        excludes: [
          'web-frontend', 'cloud-backend-development', 'database-design',
          'mobile-app'
        ],
        required_context: ['hardware_spec', 'sensor_list', 'power_constraint'],
        output_schema: 'FIRMWARE_CODE_OR_EDGE_PIPELINE'
      },

      // ============================================================
      // CONTENT & DOCUMENTATION (2 Roles)
      // ============================================================
      {
        id: 'technical-writer',
        domain: 'Documentation',
        specialization: 'Technical Documentation, API Docs, dan Developer Experience',
        owns: [
          'api-documentation', 'readme', 'developer-guide', 'code-comments',
          'architecture-decision-record', 'adr', 'openapi-spec',
          'tutorial', 'onboarding-guide', 'changelog', 'diagram'
        ],
        excludes: [
          'code-implementation', 'feature-development', 'database-migration',
          'security-audit'
        ],
        required_context: ['code_or_system', 'audience_level', 'doc_format'],
        output_schema: 'MARKDOWN_DOCUMENTATION'
      },
      {
        id: 'code-reviewer',
        domain: 'Code Quality',
        specialization: 'Pull Request Review, Refactoring Suggestion, dan Best Practice',
        owns: [
          'pr-review', 'code-smell-detection', 'refactoring-suggestion',
          'design-pattern-review', 'naming-convention', 'clean-code',
          'solid-principles', 'dry-kiss', 'maintainability-analysis'
        ],
        excludes: [
          'feature-implementation', 'ui-design', 'infrastructure-setup',
          'security-penetration-test'
        ],
        required_context: ['code_diff', 'original_requirement', 'language_stack'],
        output_schema: 'REVIEW_COMMENTS_OR_REFACTOR_PLAN'
      },

      // ============================================================
      // GENERAL & UTILITY (4 Roles — existing + enhanced)
      // ============================================================
      {
        id: 'data-scientist',
        domain: 'Data & Algorithm',
        specialization: 'Statistical Modeling, Experiment Design, dan Insight Generation',
        owns: [
          'statistics', 'hypothesis-testing', 'regression', 'classification',
          'clustering', 'experimental-design', 'a-b-testing', 'causal-inference',
          'data-visualization', 'insight-generation', 'feature-analysis'
        ],
        excludes: [
          'production-deployment', 'ui-development', 'database-administration',
          'infrastructure-setup'
        ],
        required_context: ['dataset_description', 'research_question', 'methodology_preference'],
        output_schema: 'ANALYSIS_REPORT_OR_MODEL_SPEC'
      },
      {
        id: 'qa-auditor',
        domain: 'Quality & Security',
        specialization: 'Holistic Quality Audit: Code, Security, dan Edge Cases',
        owns: [
          'unit-testing', 'integration-testing', 'security-checks',
          'edge-case-analysis', 'regression-testing', 'usability-audit'
        ],
        excludes: [
          'feature-development', 'ui-design-implementation', 'architecture-design'
        ],
        required_context: ['code_to_audit', 'test_scope', 'risk_level'],
        output_schema: 'AUDIT_REPORT_WITH_FIX_SUGGESTIONS'
      },
      {
        id: 'lite_grounding',
        domain: 'Grounding & Info Retrieval',
        specialization: 'Mencari informasi, mereview log, dan eksekusi ringan paralel',
        owns: [
          'search', 'light-refactoring', 'context-building', 'log-analysis',
          'summarization', 'comparison', 'fact-checking'
        ],
        excludes: [
          'deep-reasoning', 'complex-algorithms', 'architecture-design',
          'security-audit'
        ],
        required_context: [],
        output_schema: 'TEXT_OR_MARKDOWN'
      },
      {
        id: 'general-assistant',
        domain: 'General',
        specialization: 'Task Routing, Planning, dan General Logic',
        owns: [
          'general-queries', 'planning', 'summarization', 'coordination',
          'task-breakdown', 'brainstorming', 'comparison'
        ],
        excludes: [
          'deep-niche-specializations', 'production-code-without-context',
          'security-critical-decisions'
        ],
        required_context: ['instruction'],
        output_schema: 'STRUCTURED_TEXT'
      },
    ];

    for (const role of defaultRoles) {
      this.roles.set(role.id, role);
    }
  }

  getRole(id: string): AgentRoleDefinition | undefined {
    return this.roles.get(id);
  }

  getAllRoles(): AgentRoleDefinition[] {
    return Array.from(this.roles.values());
  }

  getRolesByDomain(domain: string): AgentRoleDefinition[] {
    return this.getAllRoles().filter(r => r.domain.toLowerCase().includes(domain.toLowerCase()));
  }

  getRolesByCapability(capability: string): AgentRoleDefinition[] {
    return this.getAllRoles().filter(r => r.owns.includes(capability));
  }

  registerDynamicRole(role: AgentRoleDefinition): boolean {
    if (this.roles.has(role.id)) {
      return false;
    }
    this.roles.set(role.id, { ...role, dynamic_invention: true });
    return true;
  }

  // ============================================================
  // HELPERS (Opsional — bisa dipakai orkestrator untuk DRY prompt)
  // ============================================================

  buildSystemInstruction(
    roleId: string,
    opts: {
      memoryStr?: string;
      blackboardStr?: string;
      extraWarnings?: string[];
    }
  ): string {
    const role = this.getRole(roleId);
    if (!role) return '';

    const warnings = opts.extraWarnings ?? [];

    return `Anda adalah Sub-Agen spesialis: ${role.id}.\n\n` +
      `[PROFIL PERAN]\n` +
      `- Domain: ${role.domain}\n` +
      `- Spesialisasi: ${role.specialization}\n` +
      `- Cakupan Tanggung Jawab (OWNS): ${role.owns.join(', ')}\n` +
      `- DILARANG Mengerjakan (EXCLUDES): ${role.excludes.join(', ')}\n` +
      `- Skema Output: ${role.output_schema}\n\n` +
      (warnings.length > 0 ? `[PERINGATAN SISTEM]:\n${warnings.join('\n')}\n\n` : '') +
      (opts.memoryStr ? `[MEMORI GLOBAL]\n${opts.memoryStr}\n\n` : '') +
      (opts.blackboardStr ? `[KONTEKS BATCH]\n${opts.blackboardStr}\n\n` : '') +
      `ATURAN: Selesaikan tugas MURNI SESUAI DOMAIN. ` +
      `Jika keluar dari scope, awali output dengan OUT_OF_SCOPE.`;
  }

  /**
   * Map role → worker model preference.
   * Orkestrator bisa ganti logic `if (agentRole === 'gemma_worker_26b')` jadi panggil ini.
   */
  getWorkerPreference(roleId: string): string[] {
    const codingHeavy = [
      'python-backend-engineer', 'python-data-engineer', 'python-ml-engineer',
      'python-devops-engineer', 'python-automation-engineer', 'python-scientist',
      'python-optimizer', 'python-qa-engineer', 'systems-programmer',
      'algorithm-engineer', 'backend-engineer', 'fullstack-engineer',
      'mobile-developer', 'edge-iot-engineer'
    ];

    const reasoningHeavy = [
      'security-auditor', 'appsec-engineer', 'cloud-architect',
      'site-reliability-engineer', 'data-scientist', 'technical-writer',
      'code-reviewer'
    ];

    if (codingHeavy.includes(roleId)) {
      return ['gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-3.1-flash-lite-preview'];
    }
    if (reasoningHeavy.includes(roleId)) {
      return ['gemma-4-31b-it', 'gemini-3.1-flash-lite-preview', 'gemma-4-26b-a4b-it'];
    }
    return ['gemini-3.1-flash-lite-preview', 'gemma-4-26b-a4b-it', 'gemma-4-31b-it'];
  }
}

export const roleRegistry = new AgentRoleRegistry();
