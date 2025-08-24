module.exports = {
  project: {
    name: "ClaudeCluster",
    description: "Open-source orchestration framework that transforms Claude Code into a scalable coding cluster",
    version: "0.1.0",
    repository: "https://github.com/moshinhashmi/claudecluster"
  },
  
  ai: {
    model: "claude-3.5-sonnet",
    temperature: 0.1,
    maxTokens: 4000,
    systemPrompt: `You are Task Master AI, an intelligent project management assistant for ClaudeCluster. 
    
    Your role is to:
    1. Help plan and break down complex development tasks
    2. Coordinate parallel development work across multiple workers
    3. Ensure code quality, testing, and documentation standards
    4. Manage task dependencies and scheduling
    5. Provide insights and recommendations for project architecture
    
    ClaudeCluster is a framework for orchestrating multiple Claude Code instances to work in parallel on coding tasks.
    Focus on scalability, parallelism, and enterprise-ready features.`
  },
  
  tasks: {
    categories: [
      {
        name: "Architecture",
        description: "High-level system design and architecture decisions",
        color: "#3B82F6"
      },
      {
        name: "Core Development",
        description: "Main framework implementation and features",
        color: "#10B981"
      },
      {
        name: "Testing",
        description: "Test implementation, coverage, and quality assurance",
        color: "#F59E0B"
      },
      {
        name: "Documentation",
        description: "Docs, README, API references, and guides",
        color: "#8B5CF6"
      },
      {
        name: "DevOps",
        description: "CI/CD, deployment, and infrastructure",
        color: "#EF4444"
      },
      {
        name: "Research",
        description: "Investigation, RFCs, and design exploration",
        color: "#6B7280"
      }
    ],
    
    templates: [
      {
        name: "Feature Implementation",
        description: "Implement a new feature with tests and docs",
        steps: [
          "Analyze requirements and design approach",
          "Create feature branch",
          "Implement core functionality",
          "Add comprehensive tests",
          "Update documentation",
          "Create PR with clear description"
        ],
        estimatedTime: "2-4 hours",
        priority: "medium"
      },
      {
        name: "Refactoring",
        description: "Improve code structure and maintainability",
        steps: [
          "Identify refactoring targets",
          "Plan refactoring approach",
          "Execute refactoring with tests",
          "Verify functionality unchanged",
          "Update affected documentation"
        ],
        estimatedTime: "1-3 hours",
        priority: "medium"
      },
      {
        name: "Bug Fix",
        description: "Fix a reported bug or issue",
        steps: [
          "Reproduce the bug",
          "Identify root cause",
          "Implement fix",
          "Add regression tests",
          "Update documentation if needed"
        ],
        estimatedTime: "30 minutes - 2 hours",
        priority: "high"
      },
      {
        name: "Documentation Update",
        description: "Improve or add project documentation",
        steps: [
          "Identify documentation gaps",
          "Research and gather information",
          "Write clear, concise content",
          "Review for accuracy and clarity",
          "Update related links and references"
        ],
        estimatedTime: "1-2 hours",
        priority: "low"
      }
    ]
  },
  
  workflows: [
    {
      name: "New Feature Development",
      description: "Complete workflow for developing new features",
      steps: [
        {
          name: "Planning",
          description: "Define requirements and design approach",
          duration: "30 minutes",
          dependencies: []
        },
        {
          name: "Implementation",
          description: "Core feature development",
          duration: "2-4 hours",
          dependencies: ["Planning"]
        },
        {
          name: "Testing",
          description: "Unit and integration tests",
          duration: "1-2 hours",
          dependencies: ["Implementation"]
        },
        {
          name: "Documentation",
          description: "Update docs and create examples",
          duration: "1 hour",
          dependencies: ["Implementation"]
        },
        {
          name: "Review",
          description: "Code review and final adjustments",
          duration: "30 minutes",
          dependencies: ["Testing", "Documentation"]
        }
      ]
    },
    {
      name: "Release Preparation",
      description: "Prepare project for a new release",
      steps: [
        {
          name: "Version Update",
          description: "Update version numbers and changelog",
          duration: "15 minutes",
          dependencies: []
        },
        {
          name: "Testing",
          description: "Run full test suite and integration tests",
          duration: "1-2 hours",
          dependencies: ["Version Update"]
        },
        {
          name: "Documentation Review",
          description: "Ensure all docs are up to date",
          duration: "30 minutes",
          dependencies: ["Testing"]
        },
        {
          name: "Release Notes",
          description: "Prepare comprehensive release notes",
          duration: "1 hour",
          dependencies: ["Documentation Review"]
        }
      ]
    }
  ],
  
  priorities: [
    { name: "Critical", value: 1, color: "#DC2626", description: "Blocking development or production" },
    { name: "High", value: 2, color: "#EA580C", description: "Important for next milestone" },
    { name: "Medium", value: 3, color: "#D97706", description: "Normal priority development" },
    { name: "Low", value: 4, color: "#059669", description: "Nice to have, not blocking" },
    { name: "Backlog", value: 5, color: "#6B7280", description: "Future consideration" }
  ],
  
  statuses: [
    { name: "Backlog", color: "#6B7280" },
    { name: "To Do", color: "#3B82F6" },
    { name: "In Progress", color: "#F59E0B" },
    { name: "Review", color: "#8B5CF6" },
    { name: "Testing", color: "#10B981" },
    { name: "Done", color: "#059669" },
    { name: "Blocked", color: "#DC2626" }
  ],
  
  integrations: {
    github: {
      enabled: true,
      repository: "moshinhashmi/claudecluster",
      autoSync: true,
      createIssues: true,
      linkCommits: true
    },
    slack: {
      enabled: false,
      webhookUrl: process.env.SLACK_WEBHOOK_URL
    }
  },
  
  notifications: {
    email: {
      enabled: false,
      recipients: []
    },
    webhook: {
      enabled: false,
      url: ""
    }
  },
  
  reporting: {
    metrics: [
      "tasks_completed",
      "time_spent",
      "velocity",
      "quality_score",
      "team_productivity"
    ],
    dashboards: [
      {
        name: "Project Overview",
        description: "High-level project metrics and progress"
      },
      {
        name: "Team Performance",
        description: "Individual and team productivity metrics"
      },
      {
        name: "Quality Metrics",
        description: "Code quality, test coverage, and bug tracking"
      }
    ]
  }
};
