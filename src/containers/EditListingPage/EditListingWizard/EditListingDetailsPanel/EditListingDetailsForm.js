import React, { useState, useEffect } from 'react';
import { Field, Form as FinalForm } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import classNames from 'classnames';
import { BrowserMultiFormatReader } from '@zxing/library';

// Import util modules
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { displayDescription } from '../../../../util/configHelpers.js';
import { useConfiguration } from '../../../../context/configurationContext.js';
import { EXTENDED_DATA_SCHEMA_TYPES, propTypes } from '../../../../util/types';
import {
  isFieldForCategory,
  isFieldForListingType,
  isValidCurrencyForTransactionProcess,
} from '../../../../util/fieldHelpers';
import { maxLength, required, composeValidators } from '../../../../util/validators';

// Import shared components
import {
  Form,
  Button,
  FieldSelect,
  FieldTextInput,
  Heading,
  CustomExtendedDataField,
} from '../../../../components';
// Import modules from this directory
import { FieldAddImage } from '../EditListingPhotosPanel/EditListingPhotosForm';
import ListingImage from '../EditListingPhotosPanel/ListingImage';
import css from './EditListingDetailsForm.module.css';

const TITLE_MAX_LENGTH = 60;
const MAX_IMAGES = 10;

// Show various error messages
const ErrorMessage = props => {
  const { fetchErrors } = props;
  const { updateListingError, createListingDraftError, showListingsError } = fetchErrors || {};
  const errorMessage = updateListingError ? (
    <FormattedMessage id="EditListingDetailsForm.updateFailed" />
  ) : createListingDraftError ? (
    <FormattedMessage id="EditListingDetailsForm.createListingDraftError" />
  ) : showListingsError ? (
    <FormattedMessage id="EditListingDetailsForm.showListingFailed" />
  ) : null;

  if (errorMessage) {
    return <p className={css.error}>{errorMessage}</p>;
  }
  return null;
};

// Hidden input field
const FieldHidden = props => {
  const { name } = props;
  return (
    <Field id={name} name={name} type="hidden" className={css.unitTypeHidden}>
      {fieldRenderProps => <input {...fieldRenderProps?.input} />}
    </Field>
  );
};

// Field component that either allows selecting listing type (if multiple types are available)
// or just renders hidden fields:
// - listingType              Set of predefined configurations for each listing type
// - transactionProcessAlias  Initiate correct transaction against Marketplace API
// - unitType                 Main use case: pricing unit
const FieldSelectListingType = props => {
  const {
    name,
    listingTypes,
    hasPredefinedListingType,
    onListingTypeChange,
    formApi,
    formId,
    intl,
  } = props;
  const hasMultipleListingTypes = listingTypes?.length > 1;

  const handleOnChange = value => {
    const selectedListingType = listingTypes.find(config => config.listingType === value);
    formApi.change('transactionProcessAlias', selectedListingType.transactionProcessAlias);
    formApi.change('unitType', selectedListingType.unitType);

    if (onListingTypeChange) {
      onListingTypeChange(selectedListingType);
    }
  };
  const getListingTypeLabel = listingType => {
    const listingTypeConfig = listingTypes.find(config => config.listingType === listingType);
    return listingTypeConfig ? listingTypeConfig.label : listingType;
  };

  return hasMultipleListingTypes && !hasPredefinedListingType ? (
    <>
      <FieldSelect
        id={formId ? `${formId}.${name}` : name}
        name={name}
        className={css.listingTypeSelect}
        label={intl.formatMessage({ id: 'EditListingDetailsForm.listingTypeLabel' })}
        validate={required(
          intl.formatMessage({ id: 'EditListingDetailsForm.listingTypeRequired' })
        )}
        onChange={handleOnChange}
      >
        <option disabled value="">
          {intl.formatMessage({ id: 'EditListingDetailsForm.listingTypePlaceholder' })}
        </option>
        {listingTypes.map(config => {
          const type = config.listingType;
          return (
            <option key={type} value={type}>
              {config.label}
            </option>
          );
        })}
      </FieldSelect>
      <FieldHidden name="transactionProcessAlias" />
      <FieldHidden name="unitType" />
    </>
  ) : hasMultipleListingTypes && hasPredefinedListingType ? (
    <div className={css.listingTypeSelect}>
      <Heading as="h5" rootClassName={css.selectedLabel}>
        {intl.formatMessage({ id: 'EditListingDetailsForm.listingTypeLabel' })}
      </Heading>
      <p className={css.selectedValue}>{getListingTypeLabel(formApi.getFieldState(name)?.value)}</p>
      <FieldHidden name={name} />
      <FieldHidden name="transactionProcessAlias" />
      <FieldHidden name="unitType" />
    </div>
  ) : (
    <>
      <FieldHidden name={name} />
      <FieldHidden name="transactionProcessAlias" />
      <FieldHidden name="unitType" />
    </>
  );
};

// Finds the correct subcategory within the given categories array based on the provided categoryIdToFind.
const findCategoryConfig = (categories, categoryIdToFind) => {
  return categories?.find(category => category.id === categoryIdToFind);
};

/**
 * Recursively render subcategory field inputs if there are subcategories available.
 * This function calls itself with updated props to render nested category fields.
 * The select field is used for choosing a category or subcategory.
 */
const CategoryField = props => {
  const { currentCategoryOptions, level, values, prefix, handleCategoryChange, intl } = props;

  const currentCategoryKey = `${prefix}${level}`;

  const categoryConfig = findCategoryConfig(currentCategoryOptions, values[`${prefix}${level}`]);

  return (
    <>
      {currentCategoryOptions ? (
        <FieldSelect
          key={currentCategoryKey}
          id={currentCategoryKey}
          name={currentCategoryKey}
          className={css.listingTypeSelect}
          onChange={event => handleCategoryChange(event, level, currentCategoryOptions)}
          label={intl.formatMessage(
            { id: 'EditListingDetailsForm.categoryLabel' },
            { categoryLevel: currentCategoryKey }
          )}
          validate={required(
            intl.formatMessage(
              { id: 'EditListingDetailsForm.categoryRequired' },
              { categoryLevel: currentCategoryKey }
            )
          )}
        >
          <option disabled value="">
            {intl.formatMessage(
              { id: 'EditListingDetailsForm.categoryPlaceholder' },
              { categoryLevel: currentCategoryKey }
            )}
          </option>

          {currentCategoryOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </FieldSelect>
      ) : null}

      {categoryConfig?.subcategories?.length > 0 ? (
        <CategoryField
          currentCategoryOptions={categoryConfig.subcategories}
          level={level + 1}
          values={values}
          prefix={prefix}
          handleCategoryChange={handleCategoryChange}
          intl={intl}
        />
      ) : null}
    </>
  );
};

const FieldSelectCategory = props => {
  useEffect(() => {
    checkIfInitialValuesExist();
  }, []);

  const { prefix, listingCategories, formApi, intl, setAllCategoriesChosen, values } = props;

  // Counts the number of selected categories in the form values based on the given prefix.
  const countSelectedCategories = () => {
    return Object.keys(values).filter(key => key.startsWith(prefix)).length;
  };

  // Checks if initial values exist for categories and sets the state accordingly.
  // If initial values exist, it sets `allCategoriesChosen` state to true; otherwise, it sets it to false
  const checkIfInitialValuesExist = () => {
    const count = countSelectedCategories(values, prefix);
    setAllCategoriesChosen(count > 0);
  };

  // If a parent category changes, clear all child category values
  const handleCategoryChange = (category, level, currentCategoryOptions) => {
    const selectedCatLenght = countSelectedCategories();
    if (level < selectedCatLenght) {
      for (let i = selectedCatLenght; i > level; i--) {
        formApi.change(`${prefix}${i}`, null);
      }
    }
    const categoryConfig = findCategoryConfig(currentCategoryOptions, category).subcategories;
    setAllCategoriesChosen(!categoryConfig || categoryConfig.length === 0);
  };

  return (
    <CategoryField
      currentCategoryOptions={listingCategories}
      level={1}
      values={values}
      prefix={prefix}
      handleCategoryChange={handleCategoryChange}
      intl={intl}
    />
  );
};

// Add collect data for listing fields (both publicData and privateData) based on configuration
const AddListingFields = props => {
  const { listingType, listingFieldsConfig, selectedCategories, formId, intl, excludeKeys = [], fieldHelpTexts = {} } = props;
  const targetCategoryIds = Object.values(selectedCategories);

  const fields = listingFieldsConfig.reduce((pickedFields, fieldConfig) => {
    const { key, schemaType, scope } = fieldConfig || {};
    if (excludeKeys.includes(key)) return pickedFields;
    const namespacedKey = scope === 'public' ? `pub_${key}` : `priv_${key}`;

    const isKnownSchemaType = EXTENDED_DATA_SCHEMA_TYPES.includes(schemaType);
    const isProviderScope = ['public', 'private'].includes(scope);
    const isTargetListingType = isFieldForListingType(listingType, fieldConfig);
    const isTargetCategory = isFieldForCategory(targetCategoryIds, fieldConfig);

    if (!isKnownSchemaType || !isProviderScope || !isTargetListingType || !isTargetCategory) {
      return pickedFields;
    }

    const helpTextNode = fieldHelpTexts[key] || null;
    return [
      ...pickedFields,
      <CustomExtendedDataField
        key={namespacedKey}
        name={namespacedKey}
        fieldConfig={fieldConfig}
        defaultRequiredMessage={intl.formatMessage({
          id: 'EditListingDetailsForm.defaultRequiredMessage',
        })}
        formId={formId}
      />,
      ...(helpTextNode ? [<div key={`${namespacedKey}-help`}>{helpTextNode}</div>] : []),
    ];
  }, []);

  return <>{fields}</>;
};

// Return configuration for given listingType
const getListingTypeConfig = (config, listingType) => {
  return config.listing.listingTypes?.find(config => config.listingType === listingType);
};

/**
 * Form that asks title, description, transaction process and unit type for pricing
 * In addition, it asks about custom fields according to marketplace-custom-config.js
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.formId] - The form id
 * @param {boolean} props.disabled - Whether the form is disabled
 * @param {boolean} props.ready - Whether the form is ready
 * @param {boolean} props.updated - Whether the form is updated
 * @param {boolean} props.updateInProgress - Whether the update is in progress
 * @param {Object} props.fetchErrors - The fetch errors object
 * @param {propTypes.error} [props.fetchErrors.createListingDraftError] - The create listing draft error
 * @param {propTypes.error} [props.fetchErrors.showListingsError] - The show listings error
 * @param {propTypes.error} [props.fetchErrors.updateListingError] - The update listing error
 * @param {Function} props.pickSelectedCategories - The pick selected categories function
 * @param {Array<Object>} props.selectableListingTypes - The selectable listing types
 * @param {boolean} props.hasPredefinedListingType - Whether the listing type is already saved or predefined through URL
 * @param {propTypes.listingFields} props.listingFieldsConfig - The listing fields config
 * @param {string} props.listingCurrency - The listing currency
 * @param {string} props.saveActionMsg - The save action message
 * @param {boolean} [props.autoFocus] - Whether the form should autofocus
 * @param {Function} props.onListingTypeChange - The listing type change function
 * @param {Function} props.onSubmit - The submit function
 * @returns {JSX.Element}
 */
const EditListingDetailsForm = props => (
  <FinalForm
    {...props}
    mutators={{ ...arrayMutators }}
    render={formRenderProps => {
      const {
        autoFocus,
        className,
        disabled,
        ready,
        formId = 'EditListingDetailsForm',
        form: formApi,
        handleSubmit,
        onListingTypeChange,
        invalid,
        pristine,
        marketplaceCurrency,
        marketplaceName,
        selectableListingTypes,
        selectableCategories,
        hasPredefinedListingType = false,
        pickSelectedCategories,
        categoryPrefix,
        saveActionMsg,
        updated,
        updateInProgress,
        fetchErrors,
        listingFieldsConfig = [],
        listingCurrency,
        onImageUpload,
        onRemoveImage,
        listingImageConfig,
        images,
        values,
      } = formRenderProps;

      const intl = useIntl();
      const { listingType, transactionProcessAlias, unitType } = values;
      const { variantPrefix } = listingImageConfig || {};
      const [allCategoriesChosen, setAllCategoriesChosen] = useState(false);
      const [isGenerating, setIsGenerating] = useState(false);
      const [aiError, setAiError] = useState(null);
      const [imageUploadRequested, setImageUploadRequested] = useState(false);

      const [uploadQueue, setUploadQueue] = useState([]);
      const [isUploading, setIsUploading] = useState(false);
      const [shouldAutoGenerate, setShouldAutoGenerate] = useState(false);
      const [detectedBarcode, setDetectedBarcode] = useState(null);

useEffect(() => {
  console.log('detectedBarcode useEffect fired:', detectedBarcode);
  console.log('formApi:', !!formApi);
  if (detectedBarcode) {
    formApi.change('pub_barcode_UPC', detectedBarcode);
    console.log('formApi.change called with:', detectedBarcode);
    console.log('pub_barcode value after change:', formApi.getState()?.values?.pub_barcode);
  }
}, [detectedBarcode]);

useEffect(() => {
  if (shouldAutoGenerate && images && images.length > 0) {
    // Check all images have CDN URLs (are fully uploaded)
    const allUploaded = images.every(image => 
      image.attributes?.variants?.['listing-card']?.url ||
      image.attributes?.variants?.['scaled-small']?.url ||
      image.imageUrl
    );
    if (allUploaded) {
      setShouldAutoGenerate(false);
      handleGenerateListing();
    }
  }
}, [images, shouldAutoGenerate]);

      const onImageUploadHandler = async (files) => {
        if (!files || files.length === 0) return;
        const fileArray = Array.isArray(files) ? files : [files];
        
        setImageUploadRequested(true);
        setIsUploading(true);

        // Attempt barcode scan on each file before uploading
        const codeReader = new BrowserMultiFormatReader();
        for (const file of fileArray) {
          try {
            const imageUrl = URL.createObjectURL(file);
            const result = await codeReader.decodeFromImageUrl(imageUrl);
            URL.revokeObjectURL(imageUrl);
            if (result?.text) {
              console.log('Barcode detected:', result.text);
              setDetectedBarcode(result.text);
              break;
            } // Stop after first barcode found
            
          } catch (err) {
            // No barcode found in this image, continue
            console.log('No barcode found in image:', file.name);
          }
        }

        // Upload all files sequentially
        for (const file of fileArray) {
          if (file && typeof onImageUpload === 'function') {
            await Promise.resolve(
              onImageUpload({ id: `${file.name}_${Date.now()}`, file }, listingImageConfig)
            ).catch(err => console.error('Upload error:', err));
          }
        }

        setImageUploadRequested(false);
        setIsUploading(false);
        setShouldAutoGenerate(true);
      };

      const handleGenerateListing = async () => {
        setIsGenerating(true);
        setAiError(null);

        try {
          // Get images from Redux prop (images are managed outside FinalForm state)

          if (!images || images.length === 0) {
            setAiError('Please upload at least one photo first, then click Generate with AI.');
            setIsGenerating(false);
            return;
          }

          // Send CDN URLs to the server — the server fetches and converts to base64
          const imageData = images.map(image => ({
            data: image.attributes?.variants?.['listing-card']?.url
              || image.attributes?.variants?.['scaled-small']?.url
              || image.imageUrl,
          }));

          const res = await fetch('/api/generate-listing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: imageData }),
          });

          const data = await res.json();

          if (data.success && data.listing) {
            const { title, description, brand, series, artist, condition, edition, original_packaging, condition_notes, barcode, category } = data.listing;
            if (title) formApi.change('title', title);
            if (description) formApi.change('description', description);
            if (brand) formApi.change('pub_brand', brand);
            if (series) formApi.change('pub_series', series);
            if (artist) formApi.change('pub_artist', artist);
            if (condition_notes) formApi.change('pub_condition_notes', condition_notes);
            if (barcode) formApi.change('pub_barcode_UPC', barcode);
            if (original_packaging) formApi.change('pub_original_packaging_included', original_packaging === 'Yes' ? 'yes-original-packaging' : 'no-original-packaging');
            if (condition) {
              if (condition === 'New / Sealed') formApi.change('pub_itemcondition', 'new-sealed');
              else if (condition === 'Opened / Used') formApi.change('pub_itemcondition', 'opened-used');
            }
            if (edition) {
              const editionMap = {
                'Standard Edition': 'standard-edition',
                'Limited Edition': 'limited-edition',
                'Special Edition': 'special-edition',
                'Exclusive Edition': 'exclusive-edition',
              };
              const mapped = editionMap[edition] || edition.toLowerCase().replace(/\s+/g, '-');
              formApi.change('pub_edition', mapped);
            }
            if (category) {
              const categoryMap = {
                'Blind Boxes': 'blind-boxes',
                'Figures & Collectibles': 'figures-collectibles',
                'Plush': 'plush',
                'TCG & Trading Cards': 'tcg-trading-cards',
                'Accessories': 'accessories',
              };
              const mappedCategory = categoryMap[category];
              if (mappedCategory) formApi.change('categoryLevel1', mappedCategory);
            }
          } else {
            setAiError('Could not generate listing details. Please try again.');
          }
        } catch (error) {
          console.error('AI generation error:', error);
          setAiError('Something went wrong. Please try again.');
        } finally {
          setIsGenerating(false);
        }
      };

      const titleRequiredMessage = intl.formatMessage({
        id: 'EditListingDetailsForm.titleRequired',
      });
      const maxLengthMessage = intl.formatMessage(
        { id: 'EditListingDetailsForm.maxLength' },
        {
          maxLength: TITLE_MAX_LENGTH,
        }
      );

      // Determine the currency to validate:
      // - If editing an existing listing, use the listing's currency.
      // - If creating a new listing, fall back to the default marketplace currency.
      const currencyToCheck = listingCurrency || marketplaceCurrency;

      // Verify if the selected listing type's transaction process supports the chosen currency.
      // This checks compatibility between the transaction process
      // and the marketplace or listing currency.
      const isCompatibleCurrency = isValidCurrencyForTransactionProcess(
        transactionProcessAlias,
        currencyToCheck
      );

      const maxLength60Message = maxLength(maxLengthMessage, TITLE_MAX_LENGTH);

      const hasCategories = selectableCategories && selectableCategories.length > 0;
      const showCategories = listingType && hasCategories;

      const showTitle = !!listingType;

      const config = useConfiguration();
      const listingTypeConfig = getListingTypeConfig(config, listingType);
      const showDescriptionMaybe = displayDescription(listingTypeConfig);
      const showDescription = showDescriptionMaybe;

      const showListingFields = !!listingType;

      const classes = classNames(css.root, className);
      const submitReady = (updated && pristine) || ready;
      const submitInProgress = updateInProgress;
      const hasMandatoryListingTypeData = listingType && transactionProcessAlias && unitType;
      const submitDisabled =
        invalid ||
        disabled ||
        submitInProgress ||
        !hasMandatoryListingTypeData ||
        !isCompatibleCurrency;

      return (
        <Form className={classes} onSubmit={handleSubmit}>
          <ErrorMessage fetchErrors={fetchErrors} />

          <FieldSelectListingType
            name="listingType"
            listingTypes={selectableListingTypes}
            hasPredefinedListingType={hasPredefinedListingType}
            onListingTypeChange={onListingTypeChange}
            formApi={formApi}
            formId={formId}
            intl={intl}
          />

          <div className={css.imagesSection}>
            <div className={css.photoStrip}>
              <FieldAddImage
                id="addImage"
                name="addImage"
                accept="image/*"
                label={
                  <span className={css.cameraButtonInner}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span className={css.photoCount}>{(images || []).length}/{MAX_IMAGES}</span>
                  </span>
                }
                type="file"
                disabled={imageUploadRequested || (images || []).length >= MAX_IMAGES}
                formApi={formApi}
                onImageUploadHandler={onImageUploadHandler}
                aspectWidth={1}
                aspectHeight={1}
                inputClassName={css.addImageInput}
                wrapperClassName={css.cameraButtonWrapper}
                labelClassName={css.cameraButton}
              />
              {(images || []).map((image, index) => (
                <div key={image?.id?.uuid || image?.id} className={css.photoThumb}>
                  {index === 0 && <span className={css.coverBadge}>Cover</span>}
                  <ListingImage
                    image={image}
                    className={css.thumbnail}
                    savedImageAltText={intl.formatMessage({ id: 'EditListingPhotosForm.savedImageAltText' })}
                    onRemoveImage={() => { if (onRemoveImage) onRemoveImage(image?.id); }}
                    aspectWidth={1}
                    aspectHeight={1}
                    variantPrefix={variantPrefix}
                  />
                </div>
              ))}
            </div>

            <div className={css.aiButtonWrapper}>
              <button
                type="button"
                className={css.aiButton}
                onClick={handleGenerateListing}
                disabled={isGenerating}
              >
                {isGenerating ? '✨ Generating...' : '✨ Generate with AI'}
              </button>
              {aiError && <p className={css.aiError}>{aiError}</p>}
              <p className={css.aiDisclaimer}>AI can make mistakes. Please verify accuracy.</p>
            </div>
          </div>

          <hr className={css.sectionDivider} />

          {showCategories && isCompatibleCurrency && (
            <FieldSelectCategory
              values={values}
              prefix={categoryPrefix}
              listingCategories={selectableCategories}
              formApi={formApi}
              intl={intl}
              allCategoriesChosen={allCategoriesChosen}
              setAllCategoriesChosen={setAllCategoriesChosen}
            />
          )}

          <hr className={css.sectionDivider} />

          {showTitle && isCompatibleCurrency && (
            <FieldTextInput
              id={`${formId}title`}
              name="title"
              className={css.title}
              type="text"
              label={intl.formatMessage({ id: 'EditListingDetailsForm.title' })}
              placeholder={intl.formatMessage({
                id: 'EditListingDetailsForm.titlePlaceholder',
              })}
              maxLength={TITLE_MAX_LENGTH}
              validate={composeValidators(required(titleRequiredMessage), maxLength60Message)}
              autoFocus={false}
            />
          )}

          {showDescription && isCompatibleCurrency && (
            <FieldTextInput
              id={`${formId}description`}
              name="description"
              className={css.description}
              type="textarea"
              label={intl.formatMessage({ id: 'EditListingDetailsForm.description' })}
              placeholder={intl.formatMessage({
                id: 'EditListingDetailsForm.descriptionPlaceholder',
              })}
              validate={required(
                intl.formatMessage({
                  id: 'EditListingDetailsForm.descriptionRequired',
                })
              )}
            />
          )}

          <hr className={css.sectionDivider} />

          {showListingFields && isCompatibleCurrency && (() => {
            const barcodeConfig = listingFieldsConfig.find(f => f.key === 'barcode_UPC');
            console.log('barcodeConfig:', barcodeConfig);
            console.log('listingFieldsConfig keys:', listingFieldsConfig.map(f => f.key));
            const barcodeLabel = barcodeConfig?.saveConfig?.label || barcodeConfig?.label || 'Barcode / UPC';
            const barcodePlaceholder = barcodeConfig?.saveConfig?.placeholderMessage || '';
            return (
              <>
                <AddListingFields
                  listingType={listingType}
                  listingFieldsConfig={listingFieldsConfig}
                  selectedCategories={pickSelectedCategories(values)}
                  formId={formId}
                  intl={intl}
                  excludeKeys={['barcode_UPC']}
                  fieldHelpTexts={{
                    itemcondition: (
                      <p className={css.fieldHelpText}>
                        <strong>New / Sealed:</strong>{' '}The item is in its original sealed packaging, never opened.<br />
                        <strong>Opened / Used:</strong>{' '}The item&apos;s original packaging has been altered. The item is USED or a confirmed figure where a blind box was opened to identify.
                      </p>
                    ),
                  }}
                />
                {barcodeConfig && (
                  <FieldTextInput
                    id={`${formId}.pub_barcode`}
                    name="pub_barcode_UPC"
                    type="text"
                    label={barcodeLabel}
                    placeholder={barcodePlaceholder}
                    helpText="Enter the UPC, EAN, or GTIN barcode number found on the product's packaging. Example: 012345678901. This helps buyers find and verify the exact product."
                    className={css.customField}
                  />
                )}
              </>
            );
          })()}

          {!isCompatibleCurrency && listingType && (
            <p className={css.error}>
              <FormattedMessage
                id="EditListingDetailsForm.incompatibleCurrency"
                values={{ marketplaceName, marketplaceCurrency }}
              />
            </p>
          )}

          <Button
            className={css.submitButton}
            type="submit"
            inProgress={submitInProgress}
            disabled={submitDisabled}
            ready={submitReady}
          >
            {saveActionMsg}
          </Button>
          <p className={css.submitDisclaimer}>AI can make mistakes. Please verify the accuracy of the AI-generated text and data. Accurate listing information is your responsibility.</p>
        </Form>
      );
    }}
  />
);

export default EditListingDetailsForm;
