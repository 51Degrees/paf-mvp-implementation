/**
 * Optional configuration passed to the constructor of the controller.
 */
export interface IConfig {
  brandName: string; // to use to replace the [BrandName] tokens
  logoUrls: string[]; // to use in the header of the UI
  pauseAdVisible: boolean; // true to display the pause ad feature, otherwise false
}
