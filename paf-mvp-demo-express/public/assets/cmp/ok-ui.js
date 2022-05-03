(function () {
    'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    // Wrappers to console.(log | info | warn | error). Takes N arguments, the same as the native methods
    class Log {
        constructor(id, color) {
            this.id = id;
            this.color = color;
        }
        Debug(...args) {
            console.log(...this.decorateLog('DEBUG:', args));
        }
        Message(...args) {
            console.log(...this.decorateLog('MESSAGE:', args));
        }
        Info(...args) {
            console.info(...this.decorateLog('INFO:', args));
        }
        Warn(...args) {
            console.warn(...this.decorateLog('WARNING:', args));
        }
        Error(...args) {
            console.error(...this.decorateLog('ERROR:', args));
        }
        decorateLog(prefix, args) {
            const newArgs = [].slice.call(args);
            prefix && newArgs.unshift(prefix);
            newArgs.unshift(Log.label(this.color));
            newArgs.unshift(`%c${this.id}`);
            return newArgs;
        }
    }
    Log.label = (color) => `display: inline-block; color: #fff; background: ${color}; padding: 1px 4px; border-radius: 3px;`;

    // The default language to use if the users preferences are not available.
    const defaultLang = 'en-us';
    // Record the current script so that the language script can be inserted.
    const thisScript = document.currentScript;
    // The base URL that should be used to find the language specific script.
    const baseUrl = thisScript.getAttribute('src');
    // The mode to use with fetch if not 'cors'.
    const checkMode = thisScript.getAttribute('data-mode');
    /**
     * Gets the URL for the language code provided.
     * @param language required
     * @returns URL for the language
     */
    const getUrlFromLanguage = (language) => baseUrl.replace('ok-ui', `ok-ui-${language.toLowerCase()}`);
    /**
     * Gets the URL for the language at the index in window.navigator.languages
     * @param index in window.navigator.languages
     * @returns URL for the language
     */
    const getUrlFromIndex = (index) => getUrlFromLanguage(window.navigator.languages[index].toLowerCase());
    /**
     * Insert the JavaScript at the provided URL into the document next to this loader script copying all the configuration
     * from the loader to the language specific script.
     * @param url
     */
    const insertScript = (url) => __awaiter(void 0, void 0, void 0, function* () {
        const script = document.createElement('script');
        const attrNames = thisScript.getAttributeNames();
        for (let i = 0; i < attrNames.length; i++) {
            const qn = attrNames[i];
            script.setAttribute(qn, thisScript.getAttribute(qn));
        }
        script.setAttribute('src', url);
        thisScript.insertAdjacentElement('afterend', script);
        return Promise.resolve();
    });
    /**
     * Inserts the default language script as one could not be identified from the browser's preferred languages.
     */
    const insertDefault = () => __awaiter(void 0, void 0, void 0, function* () {
        return insertScript(getUrlFromLanguage(defaultLang));
    });
    /**
     * Checks if there is a bundle for the next language in the list. If so then this is inserted into the document,
     * otherwise if there are more languages remaining then these are loaded. If there are no more languages then use the
     * default.
     */
    const checkNext = (index) => __awaiter(void 0, void 0, void 0, function* () {
        if (index < 0 || index >= window.navigator.languages.length) {
            // Insert the default language as nothing matched.
            return insertDefault();
        }
        else {
            // Get the URL from the index incrementing it by one.
            const url = getUrlFromIndex(index++);
            // Fetch the language specific bundle.
            let response = null;
            try {
                response = yield fetch(url, { method: 'GET', mode: (checkMode !== null ? checkMode : 'cors') });
            }
            catch (err) {
                // Do nothing.
            }
            // If available insert it, otherwise move to the next one.
            return response !== null && response.ok ? insertScript(url) : checkNext(index);
        }
    });
    // Start the process of finding and loading the correct script.
    checkNext(0).catch(e => new Log('ok-ui-loader', '#18a9e1').Error(e));

})();
//# sourceMappingURL=ok-ui.js.map
