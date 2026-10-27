# ReactLynx legacy external worklet reproduction

A ReactLynx 0.129.0 page consuming a precompiled 0.126.2 component external and a 0.126.2 React UMD renders successfully but fails when the component's background effect calls `runOnMainThread`:

```text
main-thread.js exception: cannot read property 'bind' of undefined
    at transformWorkletInner
    at transformWorklet
    at runWorkletImpl
    at runWorklet
    at runRunOnMainThreadTask
```

This is a native Lynx Explorer reproduction, not a WebCore test or registry-deletion fault injection. The effect triggers automatically after mounting; no tap is required.

Upstream issue: https://github.com/lynx-family/lynx-stack/issues/4260

## Run

Use Node.js 22.12+ and pnpm 10.34.6:

```sh
pnpm run setup
pnpm build
pnpm serve
```

Open the failing build in an Android emulator with Lynx Explorer installed:

```sh
adb -s emulator-5554 shell am start \
  -n com.lynx.explorer/.DebugBridgeActivity \
  -a android.intent.action.VIEW \
  -d 'lynx://open?url=http%3A%2F%2F10.0.2.2%3A3114%2Fnew-page-lynx%2Fmain.lynx.bundle'
```

`10.0.2.2` is the Android emulator's address for the host. Port 3114 must be available. A physical device needs a reachable host address in `build.mjs`.

## Controls

The React UMD stays at **0.126.2** in every case. The build script deliberately replaces the new compiler's emitted UMD with the same old published UMD.

| Page compiler | Component compiler | URL path | Native result |
| --- | --- | --- | --- |
| 0.126.2 | 0.126.2 | `/old-page-lynx/main.lynx.bundle` | Both MTS callbacks execute |
| 0.129.0 | 0.126.2 | `/new-page-lynx/main.lynx.bundle` | Component callback fails at `.bind` |
| 0.129.0 | 0.129.0 | `/new-page-newcomp-lynx/main.lynx.bundle` | Both MTS callbacks execute |

Change the URL path in the command above to open a control. The component source is identical across compiler versions. Each case has its own public path/debug metadata URL, so the page bundles are not byte-identical. The first two cases have byte-identical component and UMD bundles.

The failing case was opened twice in separate LynxView instances; both failed. Tested on Android 16, `sdk_gphone64_arm64`, native synchronous externals, `SystemInfo.lynxSdkVersion === '4.4'`. The local Explorer build advertises `0.0.1` in its debug handshake; that is its build label.

## What the fixture does

`Panel.tsx` captures a main-thread ref in `setLastTopY` and calls it from a background `useEffect` with `411.66666666666663`. The page also has its own MTS callback, demonstrating that the runtime starts and page-local worklets still execute.

Console markers:

- `EXTERNAL_BTS_DISPATCH`: component effect dispatched the task.
- `EXTERNAL_MTS_EXECUTED`: component task actually executed on the main thread.
- `PAGE_MTS_EXECUTED`: page-local task executed on the main thread.

In the failing case, only the first and third markers appear. The worklet registry contains only `5ab4:372ef:1`; it lacks component IDs `d04c:ee7e1:1` and `d04c:ee7e1:2`.

## Why registration is skipped

The generated externals-loading runtime eagerly evaluates the component's main-thread section before the page entry imports its module-delivered worklet initializer. The old section does:

```js
var loaded = loadWorkletRuntime('__Card__');
loaded && registerWorkletInternal('main-thread', id, implementation);
```

There is no initialized runtime yet. The old helper tries to load the page's legacy `worklet-runtime` chunk. The 0.126.2 page has it; the 0.129.0 page does not. The component therefore skips registration. The page initializes the runtime later, but the component module is already evaluated and does not register again.

The old component build generates an intermediate `worklet-runtime.js`, but its final external encoder inputs only retain the component's BTS/MTS custom sections. An intermediate file does not prove that the final external owns that chunk.

This failure is distinct from `loadWorkletRuntime is not a function`: the 0.126.2 UMD already exports the helper. Restoring that export alone does not make a missing legacy chunk or early runtime initialization available.

## Inspect the output

`artifacts/` contains the final bundles, readable thread sources, complete encoder inputs, and debug metadata. HMR/live reload are disabled; the server serves build output with `Cache-Control: no-store`.

These generated debug artifacts may contain local source paths. They are ignored by Git and should not be deployed to a public server.
