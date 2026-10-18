
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const CALLBACK_PREFIX = 'com.carecue.app://auth/callback';

let callbackHandler = null;
let pendingUrl = null;

function deliverCallback(url) {
  if (!url || !url.startsWith(CALLBACK_PREFIX)) return;

  if (Capacitor.isNativePlatform()) {
    Browser.close().catch(() => {});
  }

  if (callbackHandler) {
    callbackHandler(url);
  } else {
    pendingUrl = url;
  }
}

App.addListener('appUrlOpen', ({ url }) => {
  deliverCallback(url);
});

App.getLaunchUrl()
  .then(result => {
    if (result && result.url) {
      deliverCallback(result.url);
    }
  })
  .catch(error => {
    console.warn('Could not read launch URL:', error);
  });

window.CareCueNativeAuth = {
  isNative: Capacitor.isNativePlatform(),

  openBrowser: async (url) => {
    if (!Capacitor.isNativePlatform()) {
      window.location.href = url;
      return;
    }

    await Browser.open({ url });
  },

  onOAuthUrl: (callback) => {
    callbackHandler = callback;

    if (pendingUrl) {
      const url = pendingUrl;
      pendingUrl = null;
      callbackHandler(url);
    }
  }
};
