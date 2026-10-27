import { root, runOnMainThread, useEffect } from '@lynx-js/react';
import { Panel } from './Panel.js';

function Page() {
  useEffect(() => {
    runOnMainThread(() => {
      'main thread';
      console.info('PAGE_MTS_EXECUTED');
    })();
  }, []);
  return <view><text>New compiler with old external</text><Panel /></view>;
}
root.render(<Page />);
