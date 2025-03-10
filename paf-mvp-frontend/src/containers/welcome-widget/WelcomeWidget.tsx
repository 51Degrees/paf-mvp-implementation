import { h } from 'preact';
import { Modal } from '../../components/modal/Modal';
import { useEffect, useState } from 'preact/compat';

import style from './style.scss';
import grid from '../../styles/grid.scss';
import layout from '../../styles/layouts.scss';
import typography from '../../styles/typography.scss';

import { Button } from '../../components/button/Button';
import { Option } from '../../components/forms/option/Option';
import { Tooltip } from '../../components/tooltip/Tooltip';
import { SubPanel } from '../../components/sub-panel/SubPanel';
import { OptionsGroup } from '../../components/forms/options-group/OptionsGroup';
import { Arrow } from '../../components/svg/arrow/Arrow';
import { Refresh } from '../../components/svg/refresh/Refresh';
import { DotTyping } from '../../components/animations/DotTyping';
import { OnekeyLogo } from '../../components/svg/onekey-logo/OnekeyLogo';
import { currentScript } from '@frontend/utils/current-script';
import { updateIdsAndPreferences } from '@frontend/lib/paf-lib';

export interface IWelcomeWidgetProps {
  brandName?: string;
  brandLogoUrl?: string;
  emitConsent?: (value: boolean) => void;
}

export const WelcomeWidget = ({ emitConsent }: IWelcomeWidgetProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [pafCookies, setPafCookies] = useState(window.PAF.getIdsAndPreferences());

  const originalIdentifier = pafCookies?.identifiers?.[0]?.value;
  const originalConsent = pafCookies?.preferences?.data?.use_browsing_for_personalization;
  const proxyHostName = currentScript.getData()?.proxy;
  const brandName = window.location.hostname;

  const [consent, setConsent] = useState(originalIdentifier && originalConsent);
  const [appIdentifier, setAppIdentifier] = useState(originalIdentifier);

  const onChooseOption = (consent: boolean) => {
    setConsent(consent);
    if (originalIdentifier) {
      // Update existing settings => don't close the widget until confirmation
      return;
    }
    emitConsent(consent);
    setIsOpen(false);
  };

  const closeWidget = () => {
    setIsOpen(false);
    emitConsent(undefined);
  };

  const updateIdentifier = async () => {
    setAppIdentifier('');
    const newIdentifier = await window.PAF.getNewId({ proxyHostName });
    setAppIdentifier(newIdentifier.value);
    setPafCookies({
      ...pafCookies,
      identifiers: [newIdentifier],
    });
  };

  const updateSettings = async () => {
    await window.PAF.updateIdsAndPreferences(proxyHostName, consent, pafCookies.identifiers);
    closeWidget();
  };

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'visible';
  }, [isOpen]);

  const getConsentValue = () => (consent === true ? 'on' : consent === false ? 'off' : undefined);

  if (!isOpen) {
    return;
  }

  return (
    <div class={style.container}>
      <Modal closeBtnText={originalIdentifier ? 'Cancel' : 'Close dialog'} maxWidth={385} onClose={() => closeWidget()}>
        <h2 class={`${style.textCenter} ${style.widgetHeading}`}>Choose your marketing preferences</h2>

        <p class={style.textCenter}>
          Onekey respects your preferences to offer you a better experience across partner websites, without needing to
          bother you with additional prompts.
        </p>

        <div class={grid['my-5']}>
          {!!originalIdentifier && (
            <div class={`${layout.justifyBetween} ${layout.alignCenter} ${grid['mb-3']}`}>
              <div className={`${layout.alignCenter}`}>
                <small className={[typography.textDark, grid['mr-1'], typography.textBold].join(' ')}>
                  Your browsing ID
                </small>
                <Tooltip>
                  OneKey links your preferences to a random, pseudonymous ID. Use your right to be forgotten at any time
                  by refreshing your Browsing ID.
                </Tooltip>
              </div>

              <div>
                <Button
                  accent
                  highlight
                  testid="refresh-id-btn"
                  classList={appIdentifier ? '' : style.loading}
                  action={() => updateIdentifier()}
                >
                  <div class={layout.alignCenter}>
                    {appIdentifier && (
                      <small class={[grid['mr-2'], typography.textUpper].join(' ')}>
                        {appIdentifier.split('-')?.[0]}
                      </small>
                    )}
                    {appIdentifier ? <Refresh /> : <DotTyping />}
                  </div>
                </Button>
              </div>
            </div>
          )}
          <OptionsGroup selected={getConsentValue()} onSelectOption={(value) => onChooseOption(value === 'on')}>
            <Option value="on" testid="consent-option">
              <div class={style.optionTitle}>
                <h3>Turn on personalized marketing</h3>
                <Arrow />
              </div>
              <p class={style.optionDescription}>See more relevant content and ads.</p>
            </Option>
            <Option value="off" testid="consent-option">
              <div className={style.optionTitle}>
                <h3>Turn on standard marketing</h3>
                <Arrow />
              </div>
              <p class={style.optionDescription}>See generic content and ads.</p>
            </Option>
          </OptionsGroup>
        </div>

        {!!originalIdentifier && (
          <div class={grid['my-5']}>
            <Button testid="save-btn" wide primary action={() => updateSettings()}>
              Confirm settings
            </Button>
          </div>
        )}

        <p class={style.textCenter}>By choosing one of these options, you agree to our site's terms and conditions.</p>
        <div class={`${layout.justifyCenter} ${layout.alignCenter}`}>
          <Button action={() => setIsDetailsPanelOpen(true)} accent outline small>
            Learn more about Onekey
          </Button>
        </div>

        <SubPanel
          isOpen={isDetailsPanelOpen}
          header={
            <div data-testid="learn-more-header">
              <h4 class={style.learnMoreTitle}>Learn more about</h4>
              <div class={[layout.justifyCenter, grid['mb-2']].join(' ')}>
                <OnekeyLogo />
              </div>
            </div>
          }
          onClose={() => setIsDetailsPanelOpen(false)}
        >
          <div class={style.learnMoreContent}>
            <p>We believe you should have transparency and control over how, where, and why your data is used.</p>
            <p>
              We partnered with OneKey, a non-profit technology, to manage your marketing preferences when accessing{' '}
              {brandName}. OneKey relies on digital IDs to understand your activity and sends your preferences to our
              partner websites in order to customize the ads you see. IDs like these are an essential part of how{' '}
              {brandName}'s website operates and provides you with a more relevant experience.
            </p>
            <p>
              You may change your preferences at any time. Your consent will automatically expire 2 years after you
              provide it. You have the right to be forgotten, which you can exercise at any time, and on any OneKey
              partner website simply by resetting your ID. You can also get a temporary ID by using the
              incognito/private browsing function of your browser.
            </p>
            <p>If you choose not to participate, you will still see ads unrelated to your browsing activity.</p>
            <p>
              You can learn more and manage your choices at any time by going to "Privacy settings" at the bottom of any
              page. See our <a href="#">Privacy Policy</a> and <a href="#">Privacy Notice</a>.
            </p>
          </div>
        </SubPanel>
      </Modal>
    </div>
  );
};
