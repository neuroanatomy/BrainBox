import { getYjsValue, syncedStore } from '@syncedstore/core';
import { WebrtcProvider } from 'y-webrtc';

export const initSyncedStore = (identifier) => {
  const store = syncedStore({ files: [], fragment: 'xml' });

  // Get the Yjs document and sync automatically using y-webrtc
  const doc = getYjsValue(store);
  // eslint-disable-next-line
  const webrtcProvider = new WebrtcProvider(identifier, doc);

  return { store, webrtcProvider, doc };
};

// not the prettiest way to poll for sync, but will do for now
export const waitForSync = (provider) => new Promise((resolve) => {
  const int = setInterval(() => {
    if (provider.room !== null) {
      if (provider.room.synced || provider.room.webrtcConns.size === 0) {
        clearInterval(int);
        resolve();
      }
    }
  }, 500);
});
