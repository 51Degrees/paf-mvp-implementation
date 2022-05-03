import { Log } from '@core/log';

// The default language to use if the users preferences are not available.
const defaultLang = 'en-us';

// Record the current script so that the language script can be inserted.
const thisScript = document.currentScript;

// The base URL that should be used to find the language specific script.
const baseUrl = thisScript.getAttribute('src');

// The mode to use with fetch if not 'cors'.
const checkMode = <RequestMode>thisScript.getAttribute('data-mode');

/**
 * Gets the URL for the language code provided.
 * @param language required
 * @returns URL for the language
 */
const getUrlFromLanguage = (language: string) => baseUrl.replace('ok-ui', `ok-ui-${language.toLowerCase()}`);

/**
 * Gets the URL for the language at the index in window.navigator.languages
 * @param index in window.navigator.languages
 * @returns URL for the language
 */
const getUrlFromIndex = (index: number) => getUrlFromLanguage(window.navigator.languages[index].toLowerCase());

/**
 * Insert the JavaScript at the provided URL into the document next to this loader script copying all the configuration
 * from the loader to the language specific script.
 * @param url
 */
const insertScript = async (url: string) => {
  const script = document.createElement('script');
  const attrNames = thisScript.getAttributeNames();
  for (let i = 0; i < attrNames.length; i++) {
    const qn = attrNames[i];
    script.setAttribute(qn, thisScript.getAttribute(qn));
  }
  script.setAttribute('src', url);
  thisScript.insertAdjacentElement('afterend', script);
  return Promise.resolve();
};

/**
 * Inserts the default language script as one could not be identified from the browser's preferred languages.
 */
const insertDefault = async () => {
  return insertScript(getUrlFromLanguage(defaultLang));
};

/**
 * Checks if there is a bundle for the next language in the list. If so then this is inserted into the document,
 * otherwise if there are more languages remaining then these are loaded. If there are no more languages then use the
 * default.
 */
const checkNext = async (index: number): Promise<void> => {
  if (index < 0 || index >= window.navigator.languages.length) {
    // Insert the default language as nothing matched.
    return insertDefault();
  }
  // Get the URL from the index incrementing it by one.
  const url = getUrlFromIndex(index++);
  // Fetch the language specific bundle.
  let response: Response = null;
  try {
    response = await fetch(url, { method: 'GET', mode: checkMode !== null ? checkMode : 'cors' });
  } catch (err) {
    // Do nothing.
  }
  // If available insert it, otherwise move to the next one.
  return response !== null && response.ok ? insertScript(url) : checkNext(index);
};

// Start the process of finding and loading the correct script.
checkNext(0).catch((e) => new Log('ok-ui-loader', '#18a9e1').Error(e));
