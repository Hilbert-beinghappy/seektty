import { defineConfig } from 'tsdown'
import { resolve } from 'node:path'

const local = (path: string): string => resolve(import.meta.dirname, path)

const aliases = {
  '@deepseek-ai/dsh-api-gateway/node-client': local('vendor/api-gateway/client/index.js'),
  '@deepseek-ai/dsh-api-gateway/client': local('vendor/api-gateway/client/index.js'),
  '@deepseek-ai/dsh-api-remotes/node-client': local('vendor/api-remotes/client/index.js'),
  '@deepseek-ai/dsh-api-remotes/client': local('vendor/api-remotes/client/index.js'),
  '@deepseek-ai/dsh-client-connection/node-client': local('src/compat/client-connection.ts'),
  '@deepseek-ai/dsh-client-connection/client': local('vendor/client-connection/client/index.js'),
  '@deepseek-ai/dsh-client-connection': local('vendor/client-connection/index.js'),
  '@deepseek-ai/dsh-client-runtime/node-client': local('vendor/client-runtime/client/index.js'),
  '@deepseek-ai/dsh-client-runtime/projection': local('vendor/client-runtime/client/index.js'),
  '@deepseek-ai/dsh-client-runtime/client': local('vendor/client-runtime/client/index.js'),
  '@deepseek-ai/dsh-client-ui-slots': local('vendor/ui-slots/index.js'),
  '@deepseek-ai/dsh-client-ui-conversation/client': local('vendor/ui-conversation/client/index.js'),
  '@deepseek-ai/dsh-client-ui-conversation/projection': local('vendor/ui-conversation/client/conversation-nodes/register.js'),
  '@deepseek-ai/dsh-client-ui-deliverables/projection': local('vendor/ui-deliverables/client/projection.js'),
  '@deepseek-ai/dsh-client-ui-goal/projection': local('vendor/ui-goal/client/projection.js'),
  '@deepseek-ai/dsh-client-ui-trajectory/projection': local('vendor/ui-trajectory/client/projection.js'),
  '@deepseek-ai/dsh-client-ui-workflow-run/projection': local('vendor/ui-workflow-run/client/projection.js'),
  '@deepseek-ai/dsh-typert-registry/node-client': local('vendor/typert-registry/client/index.js'),
  '@deepseek-ai/dsh-typert-registry/client': local('vendor/typert-registry/client/index.js'),
  '@deepseek-ai/dsh-tui-protocol': local('src/protocol.ts'),
}

const internalClient = [
  /^@deepseek-ai\/dsh-api-gateway\/(?:node-client|client)$/,
  /^@deepseek-ai\/dsh-api-remotes\/(?:node-client|client)$/,
  /^@deepseek-ai\/dsh-client-connection\/(?:node-client|client)$/,
  /^@deepseek-ai\/dsh-client-runtime\/(?:node-client|projection|client(?:\/.*)?)$/,
  /^@deepseek-ai\/dsh-client-schema-form$/,
  /^@deepseek-ai\/dsh-client-ui-slots$/,
  /^@deepseek-ai\/dsh-client-ui-(?:conversation|deliverables|goal|trajectory|workflow-run)\/projection$/,
  /^@deepseek-ai\/dsh-typert-registry\/(?:node-client|client)$/,
  /^@deepseek-ai\/dsh-tui-protocol$/,
  /^@mariozechner\/pi-tui$/,
]

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    startup: 'src/host/startup.ts',
    'marketplace-provider': 'src/host/marketplace-provider.ts',
    'in-process': 'src/host/in-process.ts',
    'attachment-compat': 'src/host/attachment-compat.ts',
    bin: 'src/bin.ts',
  },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node22.19',
  tsconfig: 'tsconfig.build.json',
  alias: aliases,
  inputOptions: {
    experimental: {
      attachDebugInfo: 'none',
    },
  },
  clean: true,
  dts: false,
  sourcemap: false,
  noExternal: internalClient,
})
