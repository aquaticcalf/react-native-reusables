import { Effect } from "effect"
import { PROJECT_MANIFEST } from "@cli/project-manifest.js"
import { PackageManager } from "@cli/services/package-manager.js"
import { CliOptions } from "@cli/contexts/cli-options.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import dedent from "dedent"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import pkg from "../../package.json" with { type: "json" }

import { formatRunnerCommand, formatRegistryItems, formatSearchResultsWithPagination } from "../utils/mcp-formatting.js"

class MCPServer extends Effect.Service<MCPServer>()("MCPServer", {
  dependencies: [PackageManager.Default],
  effect: Effect.gen(function* () {
    const pm = yield* PackageManager
    const { cwd } = yield* CliOptions
    const runner = yield* pm.getBinaryRunner(cwd)

    const server = new Server(
      {
        name: "react-native-reusables",
        version: pkg.version
      },
      {
        capabilities: {
          resources: {},
          tools: {}
        }
      }
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "list_available_components",
            description: "List all available React Native components in the registry",
            inputSchema: zodToJsonSchema(
              z.object({
                limit: z.number().optional().describe("Maximum number of components to return"),
                offset: z.number().optional().describe("Number of components to skip for pagination")
              })
            )
          },
          {
            name: "search_components",
            description: "Search for React Native components by name or description using fuzzy matching",
            inputSchema: zodToJsonSchema(
              z.object({
                query: z.string().describe("Search query string for fuzzy matching against component names"),
                limit: z.number().optional().describe("Maximum number of components to return"),
                offset: z.number().optional().describe("Number of components to skip for pagination")
              })
            )
          },
          {
            name: "get_component_details",
            description:
              "View detailed information about specific components including name, description, and dependencies",
            inputSchema: zodToJsonSchema(
              z.object({
                components: z
                  .array(z.string())
                  .describe("Array of component names to get details for (e.g., ['button', 'card'])")
              })
            )
          },
          {
            name: "get_add_command",
            description: "Get the CLI command to add specific components to your project",
            inputSchema: zodToJsonSchema(
              z.object({
                components: z
                  .array(z.string())
                  .describe("Array of component names to get the add command for (e.g., ['button', 'card'])")
              })
            )
          },
          {
            name: "list_available_blocks",
            description: "List all available React Native blocks in the registry",
            inputSchema: zodToJsonSchema(
              z.object({
                limit: z.number().optional().describe("Maximum number of blocks to return"),
                offset: z.number().optional().describe("Number of blocks to skip for pagination")
              })
            )
          },
          {
            name: "search_blocks",
            description: "Search for React Native blocks by name or description using fuzzy matching",
            inputSchema: zodToJsonSchema(
              z.object({
                query: z.string().describe("Search query string for fuzzy matching against block names"),
                limit: z.number().optional().describe("Maximum number of blocks to return"),
                offset: z.number().optional().describe("Number of blocks to skip for pagination")
              })
            )
          },
          {
            name: "get_block_details",
            description: "View detailed information about specific blocks including name and description",
            inputSchema: zodToJsonSchema(
              z.object({
                blocks: z.array(z.string()).describe("Array of block names to get details for (e.g., ['sign-in-form'])")
              })
            )
          },
          {
            name: "get_add_block_command",
            description: "Get the CLI command to add specific blocks to your project",
            inputSchema: zodToJsonSchema(
              z.object({
                blocks: z
                  .array(z.string())
                  .describe("Array of block names to get the add command for (e.g., ['sign-in-form'])")
              })
            )
          },
          {
            name: "get_audit_checklist",
            description: "Get a checklist to verify that components were added correctly after installation",
            inputSchema: zodToJsonSchema(z.object({}))
          }
        ]
      }
    })

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (!request.params.arguments) {
          throw new Error("No tool arguments provided.")
        }

        switch (request.params.name) {
          case "list_available_components": {
            const inputSchema = z.object({
              limit: z.number().optional(),
              offset: z.number().optional()
            })

            const args = inputSchema.parse(request.params.arguments)
            const offset = args.offset ?? 0
            const limit = args.limit ?? 20

            const items = PROJECT_MANIFEST.components.slice(offset, offset + limit)
            const hasMore = offset + limit < PROJECT_MANIFEST.components.length

            const formattedItems = items.map((name) => ({
              name,
              description: `React Native ${name} component`
            }))

            return {
              content: [
                {
                  type: "text",
                  text: dedent`Found ${PROJECT_MANIFEST.components.length} components:

                   ${formatSearchResultsWithPagination(formattedItems, { runner })}


                  ${hasMore ? `\nMore components available. Use offset: ${offset + limit} to see the next page.` : ""}`
                }
              ]
            }
          }

          case "search_components": {
            const inputSchema = z.object({
              query: z.string(),
              limit: z.number().optional(),
              offset: z.number().optional()
            })

            const args = inputSchema.parse(request.params.arguments)
            const query = args.query.toLowerCase()

            const filtered = PROJECT_MANIFEST.components
              .filter((name) => name.toLowerCase().includes(query))
              .slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 20))

            if (filtered.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: dedent`No components found matching "${query}". Try searching with a different query.

                  Available components: ${PROJECT_MANIFEST.components.slice(0, 10).join(", ")}${
                    PROJECT_MANIFEST.components.length > 10 ? "..." : ""
                  }`
                  }
                ]
              }
            }

            const formattedItems = filtered.map((name) => ({
              name,
              description: `React Native ${name} component`
            }))

            return {
              content: [
                {
                  type: "text",
                  text: formatSearchResultsWithPagination(formattedItems, {
                    query,
                    runner
                  })
                }
              ]
            }
          }

          case "list_available_blocks": {
            const inputSchema = z.object({
              limit: z.number().optional(),
              offset: z.number().optional()
            })

            const args = inputSchema.parse(request.params.arguments)
            const offset = args.offset ?? 0
            const limit = args.limit ?? 20

            const items = PROJECT_MANIFEST.blocks.slice(offset, offset + limit)
            const hasMore = offset + limit < PROJECT_MANIFEST.blocks.length

            const formattedItems = items.map((name) => ({
              name,
              description: `React Native ${name} block`
            }))

            return {
              content: [
                {
                  type: "text",
                  text: dedent`Found ${PROJECT_MANIFEST.blocks.length} blocks:

                   ${formatSearchResultsWithPagination(formattedItems, { runner })}


                  ${hasMore ? `\nMore blocks available. Use offset: ${offset + limit} to see the next page.` : ""}`
                }
              ]
            }
          }

          case "search_blocks": {
            const inputSchema = z.object({
              query: z.string(),
              limit: z.number().optional(),
              offset: z.number().optional()
            })

            const args = inputSchema.parse(request.params.arguments)
            const query = args.query.toLowerCase()

            const filtered = PROJECT_MANIFEST.blocks
              .filter((name) => name.toLowerCase().includes(query))
              .slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 20))

            if (filtered.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: dedent`No blocks found matching "${query}". Try searching with a different query.

                  Available blocks: ${PROJECT_MANIFEST.blocks.slice(0, 10).join(", ")}${
                    PROJECT_MANIFEST.blocks.length > 10 ? "..." : ""
                  }`
                  }
                ]
              }
            }

            const formattedItems = filtered.map((name) => ({
              name,
              description: `React Native ${name} block`
            }))

            return {
              content: [
                {
                  type: "text",
                  text: formatSearchResultsWithPagination(formattedItems, {
                    query,
                    runner
                  })
                }
              ]
            }
          }

          case "get_block_details": {
            const inputSchema = z.object({
              blocks: z.array(z.string())
            })

            const args = inputSchema.parse(request.params.arguments)

            const validBlocks = args.blocks.filter((b) => PROJECT_MANIFEST.blocks.includes(b))

            if (validBlocks.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: dedent`No valid blocks found. Available blocks:

                  ${PROJECT_MANIFEST.blocks.join(", ")}`
                  }
                ]
              }
            }

            const details = validBlocks.map((name) => ({
              name,
              description: `React Native ${name} block from the registry`,
              type: "block"
            }))

            const formattedDetails = formatRegistryItems(details)

            return {
              content: [
                {
                  type: "text",
                  text: dedent`Block Details:

                  ${formattedDetails.join("\n\n---\n\n")}`
                }
              ]
            }
          }

          case "get_add_block_command": {
            const args = z
              .object({
                blocks: z.array(z.string())
              })
              .parse(request.params.arguments)

            const validBlocks = args.blocks.filter((b) => PROJECT_MANIFEST.blocks.includes(b))

            if (validBlocks.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: dedent`No valid blocks provided.

                  Available blocks: ${PROJECT_MANIFEST.blocks.join(", ")}`
                  }
                ],
                isError: true
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: formatRunnerCommand(runner, `add ${validBlocks.join(" ")}`)
                }
              ]
            }
          }

          case "get_component_details": {
            const inputSchema = z.object({
              components: z.array(z.string())
            })

            const args = inputSchema.parse(request.params.arguments)

            const validComponents = args.components.filter((c) => PROJECT_MANIFEST.components.includes(c))

            if (validComponents.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: dedent`No valid components found. Available components:

                  ${PROJECT_MANIFEST.components.join(", ")}`
                  }
                ]
              }
            }

            const details = validComponents.map((name) => ({
              name,
              description: `React Native ${name} component from the registry`,
              type: "component"
            }))

            const formattedDetails = formatRegistryItems(details)

            return {
              content: [
                {
                  type: "text",
                  text: dedent`Component Details:

                  ${formattedDetails.join("\n\n---\n\n")}`
                }
              ]
            }
          }

          case "get_add_command": {
            const args = z
              .object({
                components: z.array(z.string())
              })
              .parse(request.params.arguments)

            const validComponents = args.components.filter((c) => PROJECT_MANIFEST.components.includes(c))

            if (validComponents.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: dedent`No valid components provided.

                  Available components: ${PROJECT_MANIFEST.components.join(", ")}`
                  }
                ],
                isError: true
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: formatRunnerCommand(runner, `add ${validComponents.join(" ")}`)
                }
              ]
            }
          }

          case "get_audit_checklist": {
            return {
              content: [
                {
                  type: "text",
                  text: dedent`## Component Audit Checklist

                  After adding components, verify the following:

                  - [ ] Ensure imports are correct (named vs default imports)
                  - [ ] Check for any missing dependencies
                  - [ ] Verify component styling with NativeWind
                  - [ ] Check for linting errors or warnings
                  - [ ] Check for TypeScript errors
                  `
                }
              ]
            }
          }

          default:
            throw new Error(`Tool ${request.params.name} not found`)
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            content: [
              {
                type: "text",
                text: dedent`Invalid input parameters:
                  ${error.errors.map((e) => `- ${e.path.join(".")}: ${e.message}`).join("\n")}
                  `
              }
            ],
            isError: true
          }
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          content: [
            {
              type: "text",
              text: dedent`Error: ${errorMessage}`
            }
          ],
          isError: true
        }
      }
    })

    return server
  })
}) {}

export { MCPServer }
