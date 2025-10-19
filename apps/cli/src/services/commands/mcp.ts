import { PackageManager } from "@cli/services/package-manager.js"
import { CliOptions } from "@cli/contexts/cli-options.js"
import { MCPServer } from "@cli/services/mcp-server.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { FileSystem, Path } from "@effect/platform"
import { Effect, Layer } from "effect"
import { Prompt } from "@effect/cli"
import logSymbols from "log-symbols"

type McpOptions = {
  cwd: string
  client?: string | undefined
}

type McpInitOptions = {
  cwd: string
  client?: string
}

const REACT_NATIVE_REUSABLES_MCP_VERSION = "latest"

type McpServerCmd = { command: string; args: readonly string[] }

type ClientBase = {
  name: "claude" | "cursor" | "vscode" | "codex" | "opencode"
  label: string
  configPath: string
}

type ClientCodex = ClientBase & {
  name: "codex"
  schema: "toml"
  config: string
}

type ClientVscode = ClientBase & {
  name: "vscode"
  schema: "vscode"
  config: { servers: Record<string, McpServerCmd> }
}

type ClientOpenCode = ClientBase & {
  name: "opencode"
  schema: "opencode"
  config: {
    $schema: string
    mcp: Record<string, { type: "local"; command: readonly [string, ...string[]]; enabled: boolean }>
  }
}

type ClientMcpJson = ClientBase & {
  name: "claude" | "cursor"
  schema: "mcpJson"
  config: { mcpServers: Record<string, McpServerCmd> }
}

type ClientInfo = ClientCodex | ClientVscode | ClientOpenCode | ClientMcpJson

type ClientTemplate = Omit<ClientInfo, "config"> & { schema: ClientInfo["schema"] }

const MCP_PACKAGE = "@react-native-reusables/cli"
const MCP_ARGS = [`${MCP_PACKAGE}@${REACT_NATIVE_REUSABLES_MCP_VERSION}`, "mcp"] as const

const CLIENT_TEMPLATES: readonly ClientTemplate[] = [
  { name: "claude", label: "Claude Code", configPath: ".mcp.json", schema: "mcpJson" },
  { name: "cursor", label: "Cursor", configPath: ".cursor/mcp.json", schema: "mcpJson" },
  { name: "vscode", label: "VS Code", configPath: ".vscode/mcp.json", schema: "vscode" },
  { name: "codex", label: "Codex", configPath: ".codex/config.toml", schema: "toml" },
  { name: "opencode", label: "OpenCode", configPath: "opencode.json", schema: "opencode" }
] as const

type VscodeJson = { servers?: Record<string, McpServerCmd> } & Record<string, unknown>
type OpenCodeJson = {
  $schema?: string
  mcp?: Record<string, { type: "local"; command: readonly [string, ...string[]]; enabled: boolean }>
} & Record<string, unknown>
type McpJson = { mcpServers?: Record<string, McpServerCmd> } & Record<string, unknown>

function buildClientConfig(template: ClientTemplate, runner: readonly string[]): ClientInfo {
  const [bin, ...rest] = runner
  const cmd: McpServerCmd = { command: bin, args: [...rest, ...MCP_ARGS] }

  switch (template.name) {
    case "claude": {
      return {
        name: "claude",
        label: template.label,
        configPath: template.configPath,
        schema: "mcpJson",
        config: { mcpServers: { "react-native-reusables": cmd } }
      }
    }
    case "cursor": {
      return {
        name: "cursor",
        label: template.label,
        configPath: template.configPath,
        schema: "mcpJson",
        config: { mcpServers: { "react-native-reusables": cmd } }
      }
    }
    case "vscode": {
      return {
        name: "vscode",
        label: template.label,
        configPath: template.configPath,
        schema: "vscode",
        config: { servers: { "react-native-reusables": cmd } }
      }
    }
    case "opencode": {
      return {
        name: "opencode",
        label: template.label,
        configPath: template.configPath,
        schema: "opencode",
        config: {
          $schema: "https://opencode.ai/config.json",
          mcp: {
            "react-native-reusables": {
              type: "local",
              command: [bin, ...rest, ...MCP_ARGS],
              enabled: true
            }
          }
        }
      }
    }
    case "codex": {
      const toml = `[mcp_servers.react-native-reusables]\ncommand = "${bin}"\nargs = ${JSON.stringify([...rest, ...MCP_ARGS])}\n`
      return {
        name: "codex",
        label: template.label,
        configPath: template.configPath,
        schema: "toml",
        config: toml
      }
    }
  }
}

function mergeClientConfig(
  existing: Record<string, unknown>,
  client: Exclude<ClientInfo, ClientCodex>
): Record<string, unknown> {
  switch (client.schema) {
    case "vscode": {
      const e = existing as VscodeJson
      return {
        ...e,
        servers: {
          ...(e.servers ?? {}),
          ...client.config.servers
        }
      }
    }
    case "opencode": {
      const e = existing as OpenCodeJson
      return {
        ...e,
        $schema: client.config.$schema,
        mcp: {
          ...(e.mcp ?? {}),
          ...client.config.mcp
        }
      }
    }
    case "mcpJson": {
      const e = existing as McpJson
      return {
        ...e,
        mcpServers: {
          ...(e.mcpServers ?? {}),
          ...client.config.mcpServers
        }
      }
    }
  }
}

const loadEnvFiles = (cwd: string) =>
  Effect.tryPromise(() => import("@dotenvx/dotenvx").then(({ config }) => config({ path: cwd, quiet: true })))

class McpInit extends Effect.Service<McpInit>()("McpInit", {
  dependencies: [PackageManager.Default],
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const pm = yield* PackageManager

    return {
      run: (options: McpInitOptions) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`McpInit options: ${JSON.stringify(options, null, 2)}`)

          let client = options.client

          const runner = yield* pm.getBinaryRunner(options.cwd)

          if (!client) {
            const response = yield* Prompt.select({
              message: "Which MCP client are you using?",
              choices: CLIENT_TEMPLATES.map((c) => ({
                title: c.label,
                value: c.name
              }))
            })

            if (!response) {
              yield* Effect.log("No client selected. Exiting.")
              return
            }

            client = response
          }

          const template = CLIENT_TEMPLATES.find((c) => c.name === client)
          if (!template) {
            return yield* Effect.fail(
              new Error(
                `Unknown client: ${client}. Available clients: ${CLIENT_TEMPLATES.map((c) => c.name).join(", ")}`
              )
            )
          }

          const clientInfo = buildClientConfig(template, runner)

          const configPath = path.join(options.cwd, clientInfo.configPath)
          const dir = path.dirname(configPath)

          if (client === "codex") {
            yield* Effect.log("")
            yield* Effect.log(`${logSymbols.info} To configure the react-native-reusables MCP server in Codex:`)
            yield* Effect.log("")
            yield* Effect.log(`1. Open or create the file: ~/.codex/config.toml`)
            yield* Effect.log(`2. Add the following configuration:`)
            yield* Effect.log("")
            yield* Effect.log(clientInfo.config as string)
            yield* Effect.log(`3. Restart Codex to load the MCP server`)
            yield* Effect.log("")
            return
          }

          yield* fs.makeDirectory(dir, { recursive: true })

          const existingRaw: Record<string, unknown> = yield* fs.readFileString(configPath).pipe(
            Effect.map((content) => JSON.parse(content) as Record<string, unknown>),
            Effect.catchAll(() => Effect.succeed({} as Record<string, unknown>))
          )

          let mergedConfig: Record<string, unknown>
          switch (clientInfo.schema) {
            case "vscode":
              mergedConfig = mergeClientConfig(existingRaw as VscodeJson, clientInfo)
              break
            case "opencode":
              mergedConfig = mergeClientConfig(existingRaw as OpenCodeJson, clientInfo)
              break
            case "mcpJson":
              mergedConfig = mergeClientConfig(existingRaw as McpJson, clientInfo)
              break
            default:
              mergedConfig = existingRaw
          }

          yield* fs.writeFileString(configPath, JSON.stringify(mergedConfig, null, 2) + "\n")

          yield* Effect.log("")
          yield* Effect.log(`${logSymbols.success} Configuration saved to ${clientInfo.configPath}`)
          yield* Effect.log("")

          const packageManager = yield* pm.getPackageManager(options.cwd)
          const hasPackageJson = yield* fs.exists(path.join(options.cwd, "package.json"))

          if (hasPackageJson) {
            yield* Effect.log(
              `${logSymbols.info} Run the following command to install dependencies:\n  ${packageManager} ${packageManager === "npm" ? "install" : "add"} --save-dev @react-native-reusables/cli@${REACT_NATIVE_REUSABLES_MCP_VERSION}`
            )
          } else {
            yield* Effect.log(
              `${logSymbols.warning} No package.json found. Please install the package manually:\n  ${packageManager} ${packageManager === "npm" ? "install" : "add"} --save-dev @react-native-reusables/cli@${REACT_NATIVE_REUSABLES_MCP_VERSION}`
            )
          }
        })
    }
  })
}) {}

class Mcp extends Effect.Service<Mcp>()("Mcp", {
  dependencies: [PackageManager.Default, MCPServer.Default, McpInit.Default],
  effect: Effect.gen(function* () {
    yield* PackageManager
    const mcpServer = yield* MCPServer
    const mcpInit = yield* McpInit

    return {
      run: (options: McpOptions) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`MCP options: ${JSON.stringify(options, null, 2)}`)

          if (options.client) {
            return yield* mcpInit.run({ cwd: options.cwd, client: options.client })
          }

          yield* loadEnvFiles(options.cwd)

          const transport = yield* Effect.sync(() => new StdioServerTransport())

          yield* Effect.tryPromise({
            try: () => mcpServer.connect(transport),
            catch: (error) =>
              new Error(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`)
          })

          yield* Effect.log("MCP server connected")
        })
    }
  })
}) {}

function make(options: McpOptions) {
  const optionsLayer = Layer.succeed(CliOptions, { cwd: options.cwd, yes: true })

  return Effect.gen(function* () {
    const mcp = yield* Mcp

    return yield* mcp.run(options)
  }).pipe(
    Effect.provide(Mcp.Default),
    Effect.provide(McpInit.Default),
    Effect.provide(MCPServer.Default),
    Effect.provide(PackageManager.Default),
    Effect.provide(optionsLayer)
  )
}

function makeInit(options: McpInitOptions) {
  const optionsLayer = Layer.succeed(CliOptions, { cwd: options.cwd, yes: true })

  return Effect.gen(function* () {
    const mcpInit = yield* McpInit
    return yield* mcpInit.run(options)
  }).pipe(Effect.provide(McpInit.Default), Effect.provide(PackageManager.Default), Effect.provide(optionsLayer))
}

export { make, makeInit }
