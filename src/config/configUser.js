/////////////////////////////////////////////////////////
// Configurations related to user.                     //
/////////////////////////////////////////////////////////

// Note: The userFields come from userFields asset nowadays by default.
//       To use this built-in configuration, you need to change the overwrite from configHelper.js
//       (E.g. use mergeDefaultTypesAndFieldsForDebugging func)

/**
 * Configuration options for user fields (custom extended data fields):
 * - key:                           Unique key for the extended data field.
 * - scope (optional):              Scope of the extended data can be either 'public', 'protected', or 'private'.
 *                                  Default value: 'public'.
 * - schemaType (optional):         Schema for this extended data field.
 *                                  This is relevant when rendering components.
 *                                  Possible values: 'enum', 'multi-enum', 'text', 'long', 'boolean'.
 * - enumOptions (optional):        Options shown for 'enum' and 'multi-enum' extended data.
 *                                  These are used to render options for inputs on
 *                                  ProfileSettingsPage and AuthenticationPage.
 * - showConfig:                    Configuration for rendering user information. (How the field should be shown.)
 *   - label:                         Label for the saved data.
 *   - displayInProfile (optional):   Can be used to hide field content from profile page.
 *                                    Default value: true.
 * - saveConfig:                    Configuration for adding and modifying extended data fields.
 *   - label:                         Label for the input field.
 *   - placeholderMessage (optional): Default message for user input.
 *   - isRequired (optional):         Is the field required for users to fill
 *   - requiredMessage (optional):    Message for mandatory fields.
 *   - displayInSignUp (optional):    Can be used to show field input on sign up page.
 *                                    Default value: true.
 * - userTypeConfig:                Configuration for limiting user field to specific user types.
 *   - limitToUserTypeIds:            Can be used to determine whether to limit the field to certain user types. The
 *                                    Console based asset configurations do not yet support user types, so in hosted configurations
 *                                    the default value for this is 'false'.
 *   - userTypeIds:                   An array of user types for which the extended
 *   (optional)                       data is relevant and should be added.
 */
export const userFields = [
  
  {
    key: 'country',
    scope: 'private',
    schemaType: 'enum',
    enumOptions: [
      { option: 'US', label: 'United States' },
      { option: 'CA', label: 'Canada' },
      { option: 'GB', label: 'United Kingdom' },
      { option: 'AU', label: 'Australia' },
      { option: 'AT', label: 'Austria' },
      { option: 'BE', label: 'Belgium' },
      { option: 'CN', label: 'China' },
      { option: 'CY', label: 'Cyprus' },
      { option: 'EE', label: 'Estonia' },
      { option: 'FI', label: 'Finland' },
      { option: 'FR', label: 'France' },
      { option: 'DE', label: 'Germany' },
      { option: 'GR', label: 'Greece' },
      { option: 'HK', label: 'Hong Kong' },
      { option: 'IE', label: 'Ireland' },
      { option: 'IT', label: 'Italy' },
      { option: 'JP', label: 'Japan' },
      { option: 'KR', label: 'Korea, South' },
      { option: 'LV', label: 'Latvia' },
      { option: 'LT', label: 'Lithuania' },
      { option: 'LU', label: 'Luxembourg' },
      { option: 'MT', label: 'Malta' },
      { option: 'NL', label: 'Netherlands' },
      { option: 'PT', label: 'Portugal' },
      { option: 'SG', label: 'Singapore' },
      { option: 'SK', label: 'Slovakia' },
      { option: 'SI', label: 'Slovenia' },
      { option: 'ES', label: 'Spain' },
      { option: 'TH', label: 'Thailand' },
    ],
    showConfig: {
      label: 'Country',
      displayInProfile: false,
    },
    saveConfig: {
      label: 'Country',
      isRequired: false,
      displayInSignUp: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
  {
    key: 'streetAddress',
    scope: 'private',
    schemaType: 'text',
    showConfig: {
      label: 'Street Address',
      displayInProfile: false,
    },
    saveConfig: {
      label: 'Street Address',
      placeholderMessage: '123 Main St',
      isRequired: false,
      displayInSignUp: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
  {
    key: 'streetAddress2',
    scope: 'private',
    schemaType: 'text',
    showConfig: {
      label: 'Street Address 2',
      displayInProfile: false,
    },
    saveConfig: {
      label: 'Apt, Suite, Unit (optional)',
      placeholderMessage: 'Apt 4B',
      isRequired: false,
      displayInSignUp: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
  {
    key: 'city',
    scope: 'private',
    schemaType: 'text',
    showConfig: {
      label: 'City',
      displayInProfile: false,
    },
    saveConfig: {
      label: 'City',
      placeholderMessage: 'Toronto',
      isRequired: false,
      displayInSignUp: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
  {
    key: 'stateProvince',
    scope: 'private',
    schemaType: 'text',
    showConfig: {
      label: 'State / Province',
      displayInProfile: false,
    },
    saveConfig: {
      label: 'State / Province',
      placeholderMessage: 'Ontario',
      isRequired: false,
      displayInSignUp: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
  {
    key: 'postalCode',
    scope: 'private',
    schemaType: 'text',
    showConfig: {
      label: 'Zip / Postal Code',
      displayInProfile: false,
    },
    saveConfig: {
      label: 'Zip / Postal Code',
      placeholderMessage: '90210 or M5V 3A8',
      isRequired: false,
      displayInSignUp: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
];

/////////////////////////////////////
// Example user type configuration //
/////////////////////////////////////
/**
 * User types are not supported in hosted configuration yet.
 *
 * To take user types into use in your
 * custom code, you can do the following things:
 * - Add a new user field with key 'userType', scope 'publicData', and schemaType enum
 *  - Consider whether or not you want to allow your users to change their user type after first creating it
 * - Set your user types as the available options for the userType field
 * - Add your user types in the array below
 * - Update configHelpers.js mergeUserConfig to pass user types to the validUserFields function
 */

export const userTypes = [
  {
    userType: 'a',
    label: 'Seller',
  },
  {
    userType: 'b',
    label: 'Buyer',
  },
  {
    userType: 'c',
    label: 'Guest',
  },
  {
    userType: 'd',
    label: 'Host',
  },
];
