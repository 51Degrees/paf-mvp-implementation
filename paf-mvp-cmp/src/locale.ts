export class Values {
  introBody = ['NOT SET'];
  aboutBody = ['NOT SET'];
  settingsBody = ['NOT SET'];

  // Snackbar fields
  snackbarHeadingPersonalized = 'NOT SET';
  snackbarHeadingStandard = 'NOT SET';
  snackbarHeadingCustomized = 'NOT SET';
  snackbarBodyPersonalized = 'NOT SET';
  snackbarBodyStandard = 'NOT SET';
  snackbarBodyCustomized = 'NOT SET';

  // Customize fields
  customizeStandard = 'NOT SET';
  customizePersonalized = 'NOT SET';
  customizeCustomized = 'NOT SET';

  // Customize card settings and labels
  customizeLabels = ['NOT SET'];
  customizeTips = ['NOT SET'];

  // The customized items. Added to the locale when first used by the view.
  customizeHtml: string = null;
}

export class Locale extends Values {
  public readonly introBodyHTML: string;
  public readonly aboutBodyHTML: string;
  public readonly settingsBodyHTML: string;

  /**
   * Logo to use with the templates.
   */
  public Logo = '';
  public LogoCenter = '';

  constructor() {
    super();
    Object.assign(this, <Values>__localeJSON__);
    this.introBodyHTML = this.toHtml(this.introBody);
    this.aboutBodyHTML = this.toHtml(this.aboutBody);
    this.settingsBodyHTML = this.toHtml(this.settingsBody);
  }

  private toHtml(list: string[]): string {
    return `<p>${list.join('</p><p>')}</p>`;
  }
}
