/**
 * Type definitions for MCP server
 */

export interface McpServerConfig {
  name: string;
  version: string;
  capabilities: McpCapabilities;
}

export interface McpCapabilities {
  resources?: boolean;
  tools?: boolean;
  prompts?: boolean;
}