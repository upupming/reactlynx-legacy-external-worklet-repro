import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root = import.meta.dirname;
const [version = 'old', kind = 'page', target = 'lynx', componentVersion = 'old'] = process.argv.slice(2);
const caseName = `${version}-${kind}${kind === 'page' && componentVersion !== 'old' ? '-newcomp' : ''}${process.env.EXTERNALS_LOADING_PLUGIN ? '-fixed' : ''}-${target}`;
const cwd = path.join(root, version);
process.chdir(cwd);
process.env.NODE_ENV = 'development';
const require = createRequire(path.join(cwd, 'package.json'));
const { pluginReactLynx, pluginExternalBundle, createRslib, createRsbuild, defineExternalBundleRslibConfig } = await import(pathToFileURL(path.join(cwd, 'compiler.mjs')));
const out = path.join(root, 'artifacts', caseName);
const metadata = path.join(out, 'metadata');
await mkdir(metadata, { recursive: true });
const capture = {
  name: 'capture-mts-minimal',
  setup(api) {
    // Optional local checkout of the proposed fix. Default builds stay broken.
    if (process.env.EXTERNALS_LOADING_PLUGIN) {
      api.modifyRspackConfig({ order: 'post', async handler(config) {
        const { ExternalsLoadingPlugin } = await import(pathToFileURL(process.env.EXTERNALS_LOADING_PLUGIN));
        let replaced = 0;
        config.plugins = config.plugins.map(plugin => {
          if (plugin?.constructor?.name !== 'ExternalsLoadingPlugin') return plugin;
          replaced++;
          return new ExternalsLoadingPlugin(plugin.options);
        });
        if (!replaced) throw new Error('ExternalsLoadingPlugin not found');
      } });
    }
    api.modifyRspackConfig(config => {
      const { LynxTemplatePlugin } = api.useExposed(Symbol.for('LynxTemplatePlugin'));
      config.plugins.push({
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('CaptureMTS', compilation => {
            const hooks = LynxTemplatePlugin.getLynxTemplatePluginHooks(compilation);
            hooks.beforeEncode.tapPromise({ name: 'CaptureMTS', stage: 10000 }, async args => {
              const name = kind === 'component' ? 'comp' : 'main';
              const url = `http://10.0.2.2:3114/${caseName}/metadata/${name}.${target}.bundle.debug.json`;
              args.encodeData.compilerOptions.templateDebugUrl = url;
              args.encodeData.sourceContent.config.debugMetadataUrl = url;
              return args;
            });
            hooks.beforeEmit.tapPromise({ name: 'CaptureMTS', stage: 10000 }, async args => {
              const name = args.outputName.replaceAll('/', '_');
              await writeFile(path.join(metadata, `${name}.json`), JSON.stringify(args.finalEncodeOptions));
              await writeFile(path.join(metadata, `${name}.debug.json`), args.debugInfo || '');
              return args;
            });
          });
        },
      });
    });
  },
};
const base = {
  plugins: [pluginReactLynx(), capture],
  dev: { hmr: false, liveReload: false },
  performance: { buildCache: false },
  output: { distPath: { root: out }, cleanDistPath: false, minify: false, sourceMap: { js: 'source-map' } },
};
if (kind === 'component') {
  const rslib = await createRslib({ cwd, config: defineExternalBundleRslibConfig({
    ...base,
    id: 'comp',
    source: { entry: { PanelLib: './src/Panel.tsx' } },
    output: { ...base.output, globalObject: 'globalThis', externalsPresets: { reactlynx: { async: target === 'web' } } },
  }, { target, enableJsBytecode: false }) });
  const result = await rslib.build();
  await result.close();
} else {
  const bundle = `comp.${target}.bundle`;
  const componentRoot = path.join(root, 'artifacts', `${componentVersion}-component-${target}`);
  const rsbuild = await createRsbuild({ cwd, rsbuildConfig: {
    ...base,
    dev: { ...base.dev, assetPrefix: `http://10.0.2.2:3114/${caseName}/` },
    output: { ...base.output, assetPrefix: `http://10.0.2.2:3114/${caseName}/` },
    source: { entry: { main: { import: './src/index.tsx', publicPath: `http://10.0.2.2:3114/${caseName}/` } } },
    ...(target === 'web' ? { environments: { web: {} } } : {}),
    plugins: [...base.plugins, pluginExternalBundle({
      globalObject: 'globalThis',
      externalBundleRoot: componentRoot,
      externalsPresets: { reactlynx: { async: target === 'web' } },
      externals: { './Panel.js': {
        bundlePath: bundle, libraryName: 'PanelLib',
        background: { sectionPath: 'PanelLib' },
        mainThread: { sectionPath: 'PanelLib__main-thread' },
        async: target === 'web',
      } },
    })],
  } });
  const result = await rsbuild.build();
  await result.close();
  // The independent variable is the page compiler. Both cases load old UMD.
  const oldRequire = createRequire(path.join(root, 'old/package.json'));
  const oldRuntime = oldRequire.resolve('@lynx-js/react-umd/dev');
  const runtime = target === 'web' ? oldRuntime.replace('.lynx.bundle', '.web.bundle') : oldRuntime;
  await copyFile(runtime, path.join(out, `react.${target}.bundle`));
}
console.log('ARTIFACTS', out);
