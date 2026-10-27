import { runOnMainThread, useEffect, useMainThreadRef } from '@lynx-js/react';

export function Panel() {
  const lastTopY = useMainThreadRef(0);
  const setLastTopY = (top: number) => {
    'main thread';
    lastTopY.current = top;
    console.info('EXTERNAL_MTS_EXECUTED', top);
  };
  useEffect(() => {
    console.info('EXTERNAL_BTS_DISPATCH', 411.66666666666663);
    runOnMainThread(setLastTopY)(411.66666666666663);
  }, []);
  return <view style={{ height: '120px', backgroundColor: 'pink' }}>
    <text id="external-mts" main-thread:bindtap={() => {
      'main thread';
      setLastTopY(42);
    }}>External MTS component</text>
  </view>;
}
