import UAParser from 'ua-parser-js';
import {
  Error,
  Get3PcResponse,
  GetIdsPrefsResponse,
  GetNewIdResponse,
  Identifier,
  IdsAndOptionalPreferences,
  IdsAndPreferences,
  PostIdsPrefsRequest,
  PostSeedRequest,
  PostSignPreferencesRequest,
  Preferences,
  Seed,
  TransactionId,
} from '@core/model/generated-model';
import { Cookies, getPafRefreshExpiration, getPrebidDataCacheExpiration } from '@core/cookies';
import { jsonProxyEndpoints, proxyUriParams, redirectProxyEndpoints } from '@core/endpoints';
import { isBrowserKnownToSupport3PC } from '@core/user-agent';
import { QSParam } from '@core/query-string';
import { fromClientCookieValues, getPafStatus, PafStatus } from '@core/operator-client-commons';
import { getCookieValue } from '../utils/cookie';
import { NotificationEnum } from '../enums/notification.enum';
import { logDebug, logInfo } from './logging';

declare const PAFUI: {
  promptConsent: () => Promise<boolean>;
  showNotification: (notificationType: NotificationEnum) => void;
};

const redirect = (url: string): void => {
  logInfo('Redirecting to:', url);
  location.replace(url);
};

// Note: we don't use Content-type JSON to avoid having to trigger OPTIONS pre-flight.
// See https://stackoverflow.com/questions/37668282/unable-to-fetch-post-without-no-cors-in-header
const postJson = (url: string, input: object) =>
  fetch(url, {
    method: 'POST',
    body: JSON.stringify(input),
    credentials: 'include',
  });

const postText = (url: string, input: string) =>
  fetch(url, {
    method: 'POST',
    body: input,
    credentials: 'include',
  });

const get = (url: string) =>
  fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

// Remove any "paf data" param from the query string
// From https://stackoverflow.com/questions/1634748/how-can-i-delete-a-query-string-parameter-in-javascript/25214672#25214672
// TODO should be able to use a more standard way, but URL class is immutable :-(
const removeUrlParameters = (url: string, parameters: string[]) => {
  const urlParts = url.split('?');

  if (urlParts.length >= 2) {
    // Get first part, and remove from array
    const urlBase = urlParts.shift();

    // Join it back up
    const queryString = urlParts.join('?');

    const prefixes = parameters.map((param) => `${encodeURIComponent(param)}=`);
    const parts = queryString.split(/[&;]/g);

    // Reverse iteration as may be destructive
    prefixes.forEach((prefix) => {
      for (let i = parts.length; i-- > 0; ) {
        // Idiom for string.startsWith
        if (parts[i].lastIndexOf(prefix, 0) !== -1) {
          parts.splice(i, 1);
        }
      }
    });

    url = urlBase + (parts.length > 0 ? `?${parts.join('&')}` : '');
  }

  return url;
};

const setCookie = (cookieName: string, value: string, expiration: Date) => {
  document.cookie = `${cookieName}=${value};expires=${expiration.toUTCString()}`;
};

export const removeCookie = (cookieName: string) => {
  setCookie(cookieName, null, new Date(0));
};

const showNotificationIfValid = (consent: boolean | undefined) => {
  if (consent !== undefined) {
    PAFUI.showNotification(consent ? NotificationEnum.personalizedContent : NotificationEnum.generalContent);
  }
};

const getProxyUrl =
  (proxyHost: string) =>
  (endpoint: string): string =>
    `https://${proxyHost}${endpoint}`;

export const saveCookieValue = <T>(cookieName: string, cookieValue: T | undefined): string => {
  const valueToStore = cookieValue === undefined ? PafStatus.NOT_PARTICIPATING : JSON.stringify(cookieValue);

  logDebug(`Save cookie ${cookieName}:`, valueToStore);

  // TODO use different expiration if "not participating"
  setCookie(cookieName, valueToStore, getPrebidDataCacheExpiration());
  setCookie(Cookies.lastRefresh, new Date().toISOString(), getPafRefreshExpiration());

  return valueToStore;
};

let thirdPartyCookiesSupported: boolean | undefined;

export interface Options {
  proxyHostName: string;
}

export enum ShowPromptOption {
  doNotPrompt = 'doNotPrompt',
  doPrompt = 'doPrompt',
  promptIfUnknownUser = 'promptIfUnknownUser',
}

export interface RefreshIdsAndPrefsOptions extends Options {
  triggerRedirectIfNeeded?: boolean;
  redirectUrl?: URL;
  showPrompt?: ShowPromptOption;
}

const defaultsRefreshIdsAndPrefsOptions: RefreshIdsAndPrefsOptions = {
  proxyHostName: 'MISSING_PROXY_HOST_NAME',
  showPrompt: ShowPromptOption.promptIfUnknownUser,
  triggerRedirectIfNeeded: true,
};

export type WriteIdsAndPrefsOptions = Options;

export type SignPrefsOptions = Options;

export type GetNewIdOptions = Options;

export type CreateSeedOptions = Options;

/**
 * Refresh result
 */
export interface RefreshResult {
  status: PafStatus;
  data?: IdsAndOptionalPreferences;
}

/**
 * Sign new optin value and send it with ids to the operator for writing
 * @param proxyHostName
 * @param optIn
 * @param identifiers
 */
export const updateIdsAndPreferences = async (proxyHostName: string, optIn: boolean, identifiers: Identifier[]) => {
  // 1. sign preferences
  const unsignedPreferences = {
    version: '0.1',
    data: {
      use_browsing_for_personalization: optIn,
    },
  };
  const signedPreferences = await signPreferences(
    { proxyHostName },
    {
      identifiers,
      unsignedPreferences,
    }
  );

  // 2. write
  await writeIdsAndPref(
    { proxyHostName },
    {
      identifiers,
      preferences: signedPreferences,
    }
  );
};

/**
 *
 * @param idsAndPreferences
 * @param proxyHostName
 * @param showPrompt
 */
async function updateDataWithPrompt(
  idsAndPreferences: RefreshResult,
  proxyHostName: string,
  showPrompt: ShowPromptOption
) {
  const { status, data } = idsAndPreferences;

  logDebug('showPrompt', showPrompt);
  logDebug('status', status);

  // If a redirect is needed, nothing more to do
  if (status === PafStatus.REDIRECT_NEEDED) {
    return;
  }

  let optIn: boolean | undefined;

  // Show prompt only if explicitly requested, or if user is unknown and prompt is accepted
  if (
    showPrompt === ShowPromptOption.doPrompt ||
    (showPrompt === ShowPromptOption.promptIfUnknownUser && status === PafStatus.UNKNOWN)
  ) {
    optIn = await PAFUI.promptConsent();
  }

  if (optIn === undefined) {
    // User closed the prompt consent without defining their preferences, or the prompt was not even shown
    // => either they canceled modification of existing ids and preferences, or they don't want to participate

    // Was not participating => save this information
    if (status === PafStatus.UNKNOWN) {
      saveCookieValue(Cookies.identifiers, undefined);
      saveCookieValue(Cookies.preferences, undefined);
    }
    // Otherwise, don't do anything, preserve existing cookies
  } else {
    let identifiers = data.identifiers;
    if (identifiers?.length === 0) {
      // If opening the prompt while the user is unknown, it can happen that we need to query for a new id
      identifiers = [await getNewId({ proxyHostName })];
    }
    await updateIdsAndPreferences(proxyHostName, optIn, identifiers);
  }
}

/**
 * Ensure local cookies for PAF identifiers and preferences are up-to-date.
 * If they aren't, contact the operator to get fresh values.
 * @param options:
 * - proxyHostName: servername of operator proxy. ex: www.myproxy.com
 * - triggerRedirectIfNeeded: `true` if redirect can be triggered immediately, `false` if it should wait
 * - redirectUrl: the redirectUrl that must be called in return when no 3PC are available. Default = current page
 * @return a status and optional data
 */
export const refreshIdsAndPreferences = async (options: RefreshIdsAndPrefsOptions): Promise<RefreshResult> => {
  const mergedOptions = {
    ...defaultsRefreshIdsAndPrefsOptions,
    ...options,
  };
  const { proxyHostName, triggerRedirectIfNeeded, redirectUrl } = mergedOptions;
  let { showPrompt } = mergedOptions;

  // Special query string param to remember the prompt must be shown
  const localQSParamShowPrompt = 'paf_show_prompt';

  // Update the URL shown in the address bar, without PAF data
  const cleanUpUrL = () => {
    const cleanedUrl = removeUrlParameters(location.href, [QSParam.paf, localQSParamShowPrompt]);
    history.pushState(null, '', cleanedUrl);
  };
  const getUrl = getProxyUrl(proxyHostName);

  const redirectToRead = () => {
    logInfo('Redirect to operator');
    const url = redirectUrl ?? new URL(getUrl(redirectProxyEndpoints.read));
    const currentUrl = new URL(location.href);
    currentUrl.searchParams.set(localQSParamShowPrompt, showPrompt);
    url.searchParams.set(proxyUriParams.returnUrl, currentUrl.toString());
    redirect(url.toString());
  };

  const processGetIdsAndPreferences = async (): Promise<RefreshResult> => {
    const urlParams = new URLSearchParams(window.location.search);
    const uriOperatorData = urlParams.get(QSParam.paf);
    const uriShowPrompt = urlParams.get(localQSParamShowPrompt);

    cleanUpUrL();

    // 1. Any Prebid 1st party cookie?
    const strIds = getCookieValue(Cookies.identifiers);
    const lastRefresh = getCookieValue(Cookies.lastRefresh);
    const strPreferences = getCookieValue(Cookies.preferences);
    const currentPafData = fromClientCookieValues(strIds, strPreferences);
    const currentlySelectedConsent = currentPafData.preferences?.data?.use_browsing_for_personalization;

    const triggerNotification = (freshConsent: boolean) => {
      const shouldShowNotification =
        !strPreferences || // there was no value before the refresh
        freshConsent !== currentlySelectedConsent; // the new value is different from the previous one

      if (shouldShowNotification) {
        logDebug(`Preferences changes detected (${currentlySelectedConsent} => ${freshConsent}), show notification`);
        showNotificationIfValid(freshConsent);
      } else {
        logDebug(`No preferences changes (${currentlySelectedConsent}), don't show notification`);
      }
    };

    async function handleAfterRedirect() {
      // Verify message
      const response = await postText(getUrl(jsonProxyEndpoints.verifyRead), uriOperatorData);
      const operatorData = (await response.json()) as GetIdsPrefsResponse;

      if (!operatorData) {
        throw 'Verification failed';
      }

      logDebug('Operator data after redirect', operatorData);

      // 3. Received data?
      const persistedIds = operatorData.body.identifiers?.filter((identifier) => identifier?.persisted !== false);
      const hasPersistedId = persistedIds.length > 0;
      const preferences = operatorData?.body?.preferences;
      const hasPreferences = preferences !== undefined;
      saveCookieValue(Cookies.identifiers, hasPersistedId ? persistedIds : undefined);
      saveCookieValue(Cookies.preferences, preferences);

      triggerNotification(preferences?.data?.use_browsing_for_personalization);

      return {
        status: hasPersistedId && hasPreferences ? PafStatus.PARTICIPATING : PafStatus.UNKNOWN,
        data: operatorData.body,
      };
    }

    // 2. Redirected from operator?
    if (uriOperatorData) {
      logInfo('Redirected from operator: YES');

      // Consider that if we have been redirected, it means 3PC are not supported
      thirdPartyCookiesSupported = false;

      // Remember what was asked for prompt, before the redirect
      showPrompt = uriShowPrompt as ShowPromptOption;

      return await handleAfterRedirect();
    }

    logInfo('Redirected from operator: NO');

    const pafStatus = getPafStatus(strIds, strPreferences);

    if (pafStatus === PafStatus.REDIRECT_NEEDED) {
      logInfo('Redirect previously deferred');

      if (triggerRedirectIfNeeded) {
        redirectToRead();
      }

      return {
        status: pafStatus,
      };
    }

    if (lastRefresh) {
      logInfo('Cookie found: YES');

      if (pafStatus === PafStatus.NOT_PARTICIPATING) {
        logInfo('User is not participating');
      }

      return {
        status: pafStatus,
        data: currentPafData,
      };
    }

    logInfo('Cookie found: NO');

    // 4. Browser known to support 3PC?
    const userAgent = new UAParser(navigator.userAgent);

    if (isBrowserKnownToSupport3PC(userAgent.getBrowser())) {
      logInfo('Browser known to support 3PC: YES');

      logInfo('Attempt to read from JSON');
      const readResponse = await get(getUrl(jsonProxyEndpoints.read));
      const operatorData = (await readResponse.json()) as GetIdsPrefsResponse;

      const persistedIds = operatorData.body.identifiers?.filter((identifier) => identifier?.persisted !== false);
      const hasPersistedId = persistedIds.length > 0;
      const preferences = operatorData?.body?.preferences;
      const hasPreferences = preferences !== undefined;

      // 3. Received data?
      if (hasPersistedId && hasPreferences) {
        logDebug('Operator returned id & prefs: YES');

        // If we got data, it means 3PC are supported
        thirdPartyCookiesSupported = true;

        // /!\ Note: we don't need to verify the message here as it is a REST call

        saveCookieValue(Cookies.identifiers, persistedIds);
        saveCookieValue(Cookies.preferences, operatorData.body.preferences);

        triggerNotification(operatorData.body.preferences?.data?.use_browsing_for_personalization);

        return {
          status: PafStatus.PARTICIPATING,
          data: operatorData.body,
        };
      }
      logInfo('Operator returned id & prefs: NO');

      logInfo('Verify 3PC on operator');
      // Note: need to include credentials to make sure cookies are sent
      const verifyResponse = await get(getUrl(jsonProxyEndpoints.verify3PC));
      const testOk: Get3PcResponse | Error = await verifyResponse.json();

      // 4. 3d party cookie ok?
      if ((testOk as Get3PcResponse)?.['3pc']) {
        logDebug('3PC verification OK: YES');

        thirdPartyCookiesSupported = true;

        return {
          status: PafStatus.UNKNOWN,
          data: {
            identifiers: operatorData.body.identifiers,
          },
        };
      }
      logInfo('3PC verification OK: NO');
      thirdPartyCookiesSupported = false;
      logInfo('Fallback to JS redirect');
    } else {
      logInfo('Browser known to support 3PC: NO');
      thirdPartyCookiesSupported = false;
      logInfo('JS redirect');
    }

    if (triggerRedirectIfNeeded) {
      redirectToRead();
    } else {
      logInfo('Deffer redirect to later, in agreement with options');
      saveCookieValue(Cookies.identifiers, PafStatus.REDIRECT_NEEDED);
      saveCookieValue(Cookies.preferences, PafStatus.REDIRECT_NEEDED);
    }

    return {
      status: PafStatus.REDIRECT_NEEDED,
    };
  };

  const idsAndPreferences = await processGetIdsAndPreferences();

  logInfo('Processed refresh', idsAndPreferences);

  // Now handle prompt, if relevant
  await updateDataWithPrompt(idsAndPreferences, proxyHostName, showPrompt);

  return idsAndPreferences;
};

/**
 * Write update of identifiers and preferences on the PAF domain
 * @param options:
 * - proxyBase: base URL (scheme, servername) of operator proxy. ex: http://myproxy.com
 * @param input the identifiers and preferences to write
 * @return the written identifiers and preferences
 */
const writeIdsAndPref = async (
  { proxyHostName }: WriteIdsAndPrefsOptions,
  input: IdsAndPreferences
): Promise<IdsAndOptionalPreferences | undefined> => {
  const getUrl = getProxyUrl(proxyHostName);

  const processWriteIdsAndPref = async (): Promise<IdsAndOptionalPreferences | undefined> => {
    logInfo('Attempt to write:', input.identifiers, input.preferences);

    // First clean up local cookies
    removeCookie(Cookies.identifiers);
    removeCookie(Cookies.preferences);

    // FIXME this boolean will be up to date only if a read occurred just before. If not, would need to explicitly test
    if (thirdPartyCookiesSupported) {
      logInfo('3PC supported');

      // 1) sign the request
      const signedResponse = await postJson(getUrl(jsonProxyEndpoints.signWrite), input);
      const signedData = (await signedResponse.json()) as PostIdsPrefsRequest;

      // 2) send
      const response = await postJson(getUrl(jsonProxyEndpoints.write), signedData);
      const operatorData = (await response.json()) as GetIdsPrefsResponse;

      const persistedIds = operatorData?.body?.identifiers?.filter((identifier) => identifier?.persisted !== false);
      const hasPersistedId = persistedIds.length > 0;

      saveCookieValue(Cookies.identifiers, hasPersistedId ? persistedIds : undefined);
      saveCookieValue(Cookies.preferences, operatorData.body.preferences);

      showNotificationIfValid(operatorData?.body?.preferences?.data?.use_browsing_for_personalization);

      return operatorData.body;
    }

    logInfo('3PC not supported: redirect');

    // Redirect. Signing of the request will happen on the backend proxy
    const returnUrl = new URL(getUrl(redirectProxyEndpoints.write));
    returnUrl.searchParams.set(proxyUriParams.returnUrl, location.href);
    returnUrl.searchParams.set(proxyUriParams.message, JSON.stringify(input));

    const url = returnUrl.toString();

    redirect(url);
  };

  const idsAndPreferences = await processWriteIdsAndPref();

  logInfo('Finished', idsAndPreferences);

  return idsAndPreferences;
};

/**
 * Sign preferences
 * @param options:
 * - proxyBase: base URL (scheme, servername) of operator proxy. ex: http://myproxy.com
 * @param input the main identifier of the web user, and the optin value
 * @return the signed Preferences
 */
export const signPreferences = async (
  { proxyHostName }: SignPrefsOptions,
  input: PostSignPreferencesRequest
): Promise<Preferences> => {
  const getUrl = getProxyUrl(proxyHostName);

  // TODO use ProxyRestSignPreferencesRequestBuilder
  const signedResponse = await postJson(getUrl(jsonProxyEndpoints.signPrefs), input);
  return (await signedResponse.json()) as Preferences;
};

/**
 * Get new random identifier
 * @param options:
 * - proxyBase: base URL (scheme, servername) of operator proxy. ex: http://myproxy.com
 * @return the new Id, signed
 */
export const getNewId = async ({ proxyHostName }: GetNewIdOptions): Promise<Identifier> => {
  const getUrl = getProxyUrl(proxyHostName);

  const response = await get(getUrl(jsonProxyEndpoints.newId));
  // Assume no error. FIXME should handle potential errors
  return ((await response.json()) as GetNewIdResponse).body.identifiers[0];
};

/**
 * If at least one identifier and some preferences are present as a 1P cookie, return them
 * Otherwise, return undefined
 */
export const getIdsAndPreferences = (): IdsAndPreferences | undefined => {
  if (!getCookieValue(Cookies.lastRefresh)) {
    return undefined;
  }
  // Remove special string values
  const cleanCookieValue = (rawValue: string) =>
    rawValue === PafStatus.REDIRECT_NEEDED || rawValue === PafStatus.NOT_PARTICIPATING ? undefined : rawValue;

  const strIds = cleanCookieValue(getCookieValue(Cookies.identifiers));
  const strPreferences = cleanCookieValue(getCookieValue(Cookies.preferences));

  const values = fromClientCookieValues(strIds, strPreferences);

  // If the object is not complete (no identifier or no preferences), then consider no valid data
  if (values.identifiers === undefined || values.identifiers.length === 0 || values.preferences === undefined) {
    return undefined;
  }

  return values as IdsAndPreferences;
};

/**
 *
 * @param proxyHostName
 * @param transactionIds
 */
export const createSeed = async (
  { proxyHostName }: CreateSeedOptions,
  transactionIds: TransactionId[]
): Promise<Seed | undefined> => {
  if (transactionIds.length == 0) {
    return undefined;
  }

  const getUrl = getProxyUrl(proxyHostName);
  const url = getUrl(jsonProxyEndpoints.createSeed);
  const idsAndPrefs = getIdsAndPreferences();
  if (idsAndPrefs === undefined) {
    return undefined;
  }

  const requestContent: PostSeedRequest = {
    transaction_ids: transactionIds,
    data: idsAndPrefs,
  };
  const response = await postJson(url, requestContent);

  return await response.json();
};
