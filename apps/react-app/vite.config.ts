import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import AutoImport from 'unplugin-auto-import/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: false,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      importRoutesUsingAbsolutePaths: false,
      quoteStyle: 'single',
      semicolons: true,
    }),
    react(),
    tailwindcss(),
    AutoImport({
      dts: 'auto-imports.d.ts',
      imports: [{ 'react-hook-form': ['useForm'] }],
    }),
    Icons({
      compiler: 'jsx',
      jsx: 'react',
      customCollections: {
        // The Vue example already registers `example`. Difftrail keeps one
        // directory per collection name, so this app imports `react`.
        example: FileSystemIconLoader('./src/assets/icons'),
        react: FileSystemIconLoader('./src/assets/icons'),
      },
    }),
  ],
});
