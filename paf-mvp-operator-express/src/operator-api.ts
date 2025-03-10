import { Express, Request, Response } from 'express';
import {
  corsOptionsAcceptAll,
  getPafDataFromQueryString,
  getPayload,
  httpRedirect,
  removeCookie,
  setCookie,
} from '@core/express/utils';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  GetIdsPrefsRequest,
  GetNewIdRequest,
  Identifier,
  Identifiers,
  PostIdsPrefsRequest,
  Preferences,
  RedirectGetIdsPrefsRequest,
  RedirectPostIdsPrefsRequest,
  Test3Pc,
} from '@core/model/generated-model';
import { UnsignedData } from '@core/model/model';
import { getTimeStampInSec } from '@core/timestamp';
import { Cookies, typedCookie, toTest3pcCookie } from '@core/cookies';
import { privateKeyFromString } from '@core/crypto/keys';
import { jsonOperatorEndpoints, redirectEndpoints } from '@core/endpoints';
import {
  Get3PCResponseBuilder,
  GetIdsPrefsResponseBuilder,
  GetNewIdResponseBuilder,
  PostIdsPrefsResponseBuilder,
} from '@core/model/operator-response-builders';
import { addIdentityEndpoint } from '@core/express/identity-endpoint';
import { KeyInfo } from '@core/crypto/identity';
import { PublicKeyStore } from '@core/crypto/key-store';
import { AxiosRequestConfig } from 'axios';
import domainParser from 'tld-extract';
import { Signer } from '@core/crypto/signer';
import {
  IdentifierDefinition,
  IdsAndPreferencesDefinition,
  MessageWithBodyDefinition,
  MessageWithoutBodyDefinition,
} from '@core/crypto/signing-definition';
import { MessageVerifier, Verifier } from '@core/crypto/verifier';

// Expiration: now + 3 months
const getOperatorExpiration = (date: Date = new Date()) => {
  const expirationDate = new Date(date);
  expirationDate.setMonth(expirationDate.getMonth() + 3);
  return expirationDate;
};

export enum Permission {
  READ = 'READ',
  WRITE = 'WRITE',
}

export const messageTTLSeconds = 30;

export type AllowedDomains = { [domain: string]: Permission[] };

// TODO should be a proper ExpressJS middleware
// TODO all received requests should be verified (signature)
// Note that CORS is "disabled" here because the check is done via signature
// So accept whatever the referer is
export const addOperatorApi = (
  app: Express,
  operatorHost: string,
  privateKey: string,
  name: string,
  keys: KeyInfo[],
  allowedDomains: AllowedDomains,
  dpoEmailAddress: string,
  privacyPolicyUrl: URL,
  s2sOptions?: AxiosRequestConfig
) => {
  const keyStore = new PublicKeyStore(s2sOptions);

  // Start by adding identity endpoint
  addIdentityEndpoint(app, name, 'operator', keys, dpoEmailAddress, privacyPolicyUrl);

  const getIdsPrefsResponseBuilder = new GetIdsPrefsResponseBuilder(operatorHost, privateKey);
  const get3PCResponseBuilder = new Get3PCResponseBuilder();
  const postIdsPrefsResponseBuilder = new PostIdsPrefsResponseBuilder(operatorHost, privateKey);
  const getNewIdResponseBuilder = new GetNewIdResponseBuilder(operatorHost, privateKey);
  const idVerifier = new Verifier(keyStore.provider, new IdentifierDefinition());
  const prefsVerifier = new Verifier(keyStore.provider, new IdsAndPreferencesDefinition());

  const tld = domainParser(`https://${operatorHost}`).domain;

  const writeAsCookies = (input: PostIdsPrefsRequest, res: Response) => {
    if (input.body.identifiers !== undefined) {
      setCookie(res, Cookies.identifiers, JSON.stringify(input.body.identifiers), getOperatorExpiration(), {
        domain: tld,
      });
    }
    if (input.body.preferences !== undefined) {
      setCookie(res, Cookies.preferences, JSON.stringify(input.body.preferences), getOperatorExpiration(), {
        domain: tld,
      });
    }
  };

  const operatorApi = new OperatorApi(operatorHost, privateKey, keyStore);

  const getReadResponse = async (request: GetIdsPrefsRequest, req: Request) => {
    const sender = request.sender;

    if (!allowedDomains[sender]?.includes(Permission.READ)) {
      throw `Domain not allowed to read data: ${sender}`;
    }

    if (
      !(await operatorApi.getIdsPrefsRequestVerifier.verifySignatureAndContent(
        request,
        sender, // sender will always be ok
        operatorHost // but operator needs to be verified
      ))
    ) {
      // TODO [errors] finer error feedback
      throw 'Read request verification failed';
    }

    const identifiers = typedCookie<Identifiers>(req.cookies[Cookies.identifiers]) ?? [];
    const preferences = typedCookie<Preferences>(req.cookies[Cookies.preferences]);

    if (!identifiers.some((i: Identifier) => i.type === 'paf_browser_id')) {
      // No existing id, let's generate one, unpersisted
      identifiers.push(operatorApi.generateNewId());
    }

    return getIdsPrefsResponseBuilder.buildResponse(sender, { identifiers, preferences });
  };

  const getWriteResponse = async (input: PostIdsPrefsRequest, res: Response) => {
    const sender = input.sender;

    if (!allowedDomains[sender]?.includes(Permission.WRITE)) {
      throw `Domain not allowed to write data: ${sender}`;
    }

    // Verify message
    if (
      !(await operatorApi.postIdsPrefsRequestVerifier.verifySignatureAndContent(
        input,
        sender, // sender will always be ok
        operatorHost // but operator needs to be verified
      ))
    ) {
      // TODO [errors] finer error feedback
      throw 'Write request verification failed';
    }

    const { identifiers, preferences } = input.body;

    // because default value is true, we just remove it to save space
    identifiers[0].persisted = undefined;

    // Verify ids
    for (const id of identifiers) {
      if (!(await idVerifier.verifySignature(id))) {
        throw `Identifier verification failed for ${id.value}`;
      }
    }

    // Verify preferences FIXME optimization here: PAF_ID has already been verified in previous step
    if (!(await prefsVerifier.verifySignature(input.body))) {
      throw 'Preferences verification failed';
    }

    writeAsCookies(input, res);

    return postIdsPrefsResponseBuilder.buildResponse(sender, { identifiers, preferences });
  };

  // *****************************************************************************************************************
  // ************************************************************************************************************ JSON
  // *****************************************************************************************************************
  const setTest3pcCookie = (res: Response) => {
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setTime(now.getTime() + 1000 * 60); // Lifespan: 1 minute
    const test3pc: Test3Pc = {
      timestamp: getTimeStampInSec(now),
    };
    setCookie(res, Cookies.test_3pc, toTest3pcCookie(test3pc), expirationDate, { domain: tld });
  };

  app.get(jsonOperatorEndpoints.read, cors(corsOptionsAcceptAll), async (req, res) => {
    // Attempt to set a cookie (as 3PC), will be useful later if this call fails to get Prebid cookie values
    setTest3pcCookie(res);

    const request = getPafDataFromQueryString<GetIdsPrefsRequest>(req);

    const response = await getReadResponse(request, req);

    res.send(response);
  });

  app.get(jsonOperatorEndpoints.verify3PC, cors(corsOptionsAcceptAll), (req, res) => {
    // Note: no signature verification here

    const cookies = req.cookies;
    const testCookieValue = typedCookie<Test3Pc>(cookies[Cookies.test_3pc]);

    // Clean up
    removeCookie(req, res, Cookies.test_3pc, { domain: tld });

    const response = get3PCResponseBuilder.buildResponse(testCookieValue);

    res.send(response);
  });

  app.post(jsonOperatorEndpoints.write, cors(corsOptionsAcceptAll), async (req, res) => {
    const input = getPayload<PostIdsPrefsRequest>(req);

    try {
      const signedData = await getWriteResponse(input, res);

      res.send(signedData);
    } catch (e) {
      res.status(400);
      res.send(e);
    }
  });

  app.get(jsonOperatorEndpoints.newId, cors(corsOptionsAcceptAll), (req, res) => {
    const input = getPafDataFromQueryString<GetNewIdRequest>(req);

    const sender = input.sender;

    if (!allowedDomains[sender]?.includes(Permission.READ)) {
      throw `Domain not allowed to read data: ${sender}`;
    }

    // FIXME verify signature

    const response = getNewIdResponseBuilder.buildResponse(input.receiver, operatorApi.generateNewId());

    res.send(response);
  });

  // *****************************************************************************************************************
  // ******************************************************************************************************* REDIRECTS
  // *****************************************************************************************************************

  app.get(redirectEndpoints.read, async (req, res) => {
    const { request, returnUrl } = getPafDataFromQueryString<RedirectGetIdsPrefsRequest>(req);

    if (returnUrl) {
      // FIXME verify returnUrl is HTTPs

      const response = await getReadResponse(request, req);

      const redirectResponse = getIdsPrefsResponseBuilder.toRedirectResponse(response, 200);
      const redirectUrl = getIdsPrefsResponseBuilder.getRedirectUrl(new URL(returnUrl), redirectResponse);

      httpRedirect(res, redirectUrl.toString());
    } else {
      res.sendStatus(400);
    }
  });

  app.get(redirectEndpoints.write, async (req, res) => {
    const { request, returnUrl } = getPafDataFromQueryString<RedirectPostIdsPrefsRequest>(req);

    if (returnUrl) {
      // FIXME verify returnUrl is HTTPs

      const response = await getWriteResponse(request, res);

      const redirectResponse = postIdsPrefsResponseBuilder.toRedirectResponse(response, 200);
      const redirectUrl = postIdsPrefsResponseBuilder.getRedirectUrl(new URL(returnUrl), redirectResponse);

      httpRedirect(res, redirectUrl.toString());
    } else {
      res.sendStatus(400);
    }
  });
};

// FIXME should probably be moved to core library
export class OperatorApi {
  constructor(
    public host: string,
    privateKey: string,
    keyStore: PublicKeyStore,
    private readonly idSigner = new Signer(privateKeyFromString(privateKey), new IdentifierDefinition()),
    public readonly postIdsPrefsRequestVerifier = new MessageVerifier(
      keyStore.provider,
      new MessageWithBodyDefinition() // POST ids and prefs has body property
    ),
    public readonly getIdsPrefsRequestVerifier = new MessageVerifier(
      keyStore.provider,
      new MessageWithoutBodyDefinition()
    )
  ) {}

  generateNewId(timestamp = getTimeStampInSec()): Identifier {
    return {
      ...this.signId(uuidv4(), timestamp),
      persisted: false,
    };
  }

  signId(value: string, timestampInSec = getTimeStampInSec()): Identifier {
    const unsignedId: UnsignedData<Identifier> = {
      version: '0.1',
      type: 'paf_browser_id',
      value,
      source: {
        domain: this.host,
        timestamp: timestampInSec,
      },
    };
    const { source, ...rest } = unsignedId;

    return {
      ...rest,
      source: {
        ...source,
        signature: this.idSigner.sign(unsignedId),
      },
    };
  }
}
