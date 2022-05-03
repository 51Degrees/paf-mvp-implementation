import { Locale } from './locale';
import { Controller } from './controller';
import * as cmp from '@cmp/controller';
import { Log } from '@core/log';

const log = new Log('audit', '#18a9e1');

class MonitoredElement extends HTMLDivElement {
  public timer: NodeJS.Timer;
}

document.querySelectorAll('[auditLog]').forEach((e) => {
  if (e instanceof HTMLDivElement) {
    log.Message('register', e.id);
    const content = e.innerHTML;
    (<MonitoredElement>e).timer = setInterval(() => {
      log.Message('check', e.id);
      if (content !== e.innerHTML) {
        log.Message('adding', e.id);
        clearInterval((<MonitoredElement>e).timer);
        new Controller(new Locale(window.navigator.languages), e, log, <cmp.Controller>window.PAFUI.controller);
      }
    }, 1000);
  }
});
