import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import IconsResolver from 'unplugin-icons/resolver';
import Icons from 'unplugin-icons/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import VueRouter from 'unplugin-vue-router/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    VueRouter({ routesFolder: 'src/routes' }),
    vue(),
    tailwindcss(),
    AutoImport({
      dts: 'auto-imports.d.ts',
      imports: [{ 'vee-validate': ['useForm'] }],
    }),
    Icons({
      customCollections: {
        example: FileSystemIconLoader('./src/assets/icons'),
      },
    }),
    Components({
      dirs: ['./src/components/auto-primary'],
      dts: 'components.d.ts',
      resolvers: [IconsResolver({ customCollections: ['example'] })],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
