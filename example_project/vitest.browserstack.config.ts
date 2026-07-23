import basicSsl from '@vitejs/plugin-basic-ssl'
import { createBrowserStackVitestConfig, loadBrowserStackRunContext } from '@fpjs-incubator/broyster/vitest'

const context = loadBrowserStackRunContext()

export default createBrowserStackVitestConfig(
  {
    plugins: context.slot.protocol === 'https' ? [basicSsl()] : [],
    test: {
      include: ['src/**/*.test.ts'],
    },
  },
  context,
)
