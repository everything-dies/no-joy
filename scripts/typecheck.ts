import { resolve } from 'node:path'

import ts from 'typescript'

import { createTypeInjector } from '../src/plugin/inject-types'

const injector = createTypeInjector(ts)

// Parse --project flag (default: tsconfig.json in cwd)
const args = process.argv.slice(2)
const projectIndex = args.indexOf('--project')
const configFileName =
  projectIndex !== -1 && args[projectIndex + 1]
    ? resolve(args[projectIndex + 1])
    : undefined

// Find and read tsconfig.json
const configPath = configFileName
  ? configFileName
  : ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json')

if (!configPath) {
  console.error('Could not find tsconfig.json')
  process.exit(1)
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext([configFile.error], {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    })
  )
  process.exit(1)
}

const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  resolve(configPath, '..')
)

// Create custom CompilerHost that injects types into view files
const host = ts.createCompilerHost(parsedConfig.options)
const originalGetSourceFile = host.getSourceFile.bind(host)

host.getSourceFile = (
  fileName: string,
  languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
  onError?: (message: string) => void,
  shouldCreateNewSourceFile?: boolean
): ts.SourceFile | undefined => {
  const sourceFile = originalGetSourceFile(
    fileName,
    languageVersionOrOptions,
    onError,
    shouldCreateNewSourceFile
  )

  if (!sourceFile) return sourceFile
  if (!injector.isComponentView(fileName)) return sourceFile

  const augmented = injector.injectTypes(fileName, sourceFile.text)
  if (augmented === sourceFile.text) return sourceFile

  return ts.createSourceFile(
    fileName,
    augmented,
    languageVersionOrOptions,
    true
  )
}

// Run type checker
const program = ts.createProgram(
  parsedConfig.fileNames,
  parsedConfig.options,
  host
)
const diagnostics = ts.getPreEmitDiagnostics(program)

if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(Array.from(diagnostics), {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    })
  )
  process.exit(1)
}

console.log('No type errors found.')
