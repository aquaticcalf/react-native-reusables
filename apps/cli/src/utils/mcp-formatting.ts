const RNR_CLI_COMMAND = "react-native-reusables@latest"

export function formatRunnerCommand(runner: readonly string[], command: string) {
  const [bin, ...rest] = runner
  const runnerPrefix = [bin, ...rest].join(" ")
  return `${runnerPrefix} ${RNR_CLI_COMMAND} ${command}`
}

export function formatSearchResultsWithPagination(
  items: Array<{ name: string; description?: string }>,
  options: {
    query?: string
    runner: readonly string[]
  }
) {
  const { query, runner } = options

  const formattedItems = items.map((item) => {
    const parts: Array<string> = [`- ${item.name}`]

    if (item.description) {
      parts.push(`- ${item.description}`)
    }

    parts.push(`\n  Add command: \`${formatRunnerCommand(runner, `add ${item.name}`)}\``)

    return parts.join(" ")
  })

  let header = `Found ${items.length} item${items.length !== 1 ? "s" : ""}`
  if (query) {
    header += ` matching "${query}"`
  }
  header += ":"

  return `${header}\n\n${formattedItems.join("\n\n")}`
}

export function formatRegistryItems(
  items: Array<{
    name: string
    description?: string
    type?: string
    files?: Array<{ path: string }>
    dependencies?: Array<string>
    devDependencies?: Array<string>
  }>
) {
  return items.map((item) => {
    const parts: Array<string> = [
      `## ${item.name}`,
      item.description ? `\n${item.description}\n` : "",
      item.type ? `**Type:** ${item.type}` : "",
      item.files && item.files.length > 0 ? `**Files:** ${item.files.length} file(s)` : "",
      item.dependencies && item.dependencies.length > 0 ? `**Dependencies:** ${item.dependencies.join(", ")}` : "",
      item.devDependencies && item.devDependencies.length > 0
        ? `**Dev Dependencies:** ${item.devDependencies.join(", ")}`
        : ""
    ]
    return parts.filter(Boolean).join("\n")
  })
}

export function formatItemExamples(
  items: Array<{
    name: string
    description?: string
    files?: Array<{ path: string; content?: string }>
  }>,
  query: string
) {
  const sections = items.map((item) => {
    const parts: Array<string> = [`## Example: ${item.name}`, item.description ? `\n${item.description}\n` : ""]

    if (item.files?.length) {
      item.files.forEach((file) => {
        if (file.content) {
          parts.push(`### Code (${file.path}):\n`)
          parts.push("```tsx")
          parts.push(file.content)
          parts.push("```")
        }
      })
    }

    return parts.filter(Boolean).join("\n")
  })

  const header = `# Usage Examples\n\nFound ${items.length} example${
    items.length > 1 ? "s" : ""
  } matching "${query}":\n`

  return header + sections.join("\n\n---\n\n")
}
