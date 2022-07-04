/**
 * Optional configuration passed to the constructor of the controller.
 */
export interface IConfig {
  brandName: string; // to use to replace the [BrandName] token in the language file
  logoUrls: string[]; // to use in the header of the UI
  pauseAdVisible: boolean; // true to display the pause ad feature, otherwise false
  // true to display a third tab under participants for all identified participants
  identifiedParticipantsVisible: boolean;
  // A HTML element or id that will have a click event registered to display the audit viewer. If not provided a OneKey
  // button will be added under the advert container.
  auditClickElement: HTMLElement | string;
}
