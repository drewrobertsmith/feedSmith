import * as WebBrowser from 'expo-web-browser';

/** Opens a link in the browser, never inside the app (Q8). Only https links exist (T17). */
export function openLink(url: string) {
  if (url.startsWith('https://')) void WebBrowser.openBrowserAsync(url);
}
