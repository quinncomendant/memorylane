export interface McpIntegration {
  name: string
  label: string
  register(): Promise<boolean>
  isMcpAdded(): boolean
}
