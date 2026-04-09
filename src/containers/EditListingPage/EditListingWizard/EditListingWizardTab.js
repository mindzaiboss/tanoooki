import React from 'react';
import { Helmet } from 'react-helmet-async';

// Import configs and util modules
import {
  LISTING_PAGE_PARAM_TYPE_DRAFT,
  LISTING_PAGE_PARAM_TYPE_EDIT,
  LISTING_PAGE_PARAM_TYPE_NEW,
} from '../../../util/urlHelpers';
import { ensureListing } from '../../../util/data';
import { createResourceLocatorString } from '../../../util/routes';

// Import modules from this directory
import EditListingAvailabilityPanel from './EditListingAvailabilityPanel/EditListingAvailabilityPanel';
import EditListingDetailsPanel from './EditListingDetailsPanel/EditListingDetailsPanel';
import EditListingDeliveryPanel from './EditListingDeliveryPanel/EditListingDeliveryPanel';
import EditListingLocationPanel from './EditListingLocationPanel/EditListingLocationPanel';
import EditListingPhotosPanel from './EditListingPhotosPanel/EditListingPhotosPanel';
import EditListingPricingPanel from './EditListingPricingPanel/EditListingPricingPanel';
import EditListingPricingAndStockPanel from './EditListingPricingAndStockPanel/EditListingPricingAndStockPanel';
import EditListingStylePanel from './EditListingStylePanel/EditListingStylePanel';

import css from './EditListingWizardTab.module.css';

export const DETAILS = 'details';
export const PRICING = 'pricing';
export const PRICING_AND_STOCK = 'pricing-and-stock';
export const DELIVERY = 'delivery';
export const LOCATION = 'location';
export const AVAILABILITY = 'availability';
export const PHOTOS = 'photos';
export const STYLE = 'style';

// EditListingWizardTab component supports these tabs
export const SUPPORTED_TABS = [
  DETAILS,
  PRICING,
  PRICING_AND_STOCK,
  DELIVERY,
  LOCATION,
  AVAILABILITY,
  PHOTOS,
  STYLE,
];

const pathParamsToNextTab = (params, tab, marketplaceTabs) => {
  const nextTabIndex = marketplaceTabs.findIndex(s => s === tab) + 1;
  const nextTab =
    nextTabIndex < marketplaceTabs.length
      ? marketplaceTabs[nextTabIndex]
      : marketplaceTabs[marketplaceTabs.length - 1];
  return { ...params, tab: nextTab };
};

// When user has update draft listing, he should be redirected to next EditListingWizardTab
const redirectAfterDraftUpdate = (listingId, params, tab, marketplaceTabs, history, routes) => {
  console.log('redirectAfterDraftUpdate called:', { listingId, params, tab });
  console.log('history object:', history, 'hasReplace:', typeof history?.replace, 'hasPush:', typeof history?.push);

  const listingUUID = listingId.uuid;

  // Build next tab params with draft type and new ID
  const nextTabIndex = marketplaceTabs.findIndex(s => s === tab) + 1;
  const nextTab = nextTabIndex < marketplaceTabs.length
    ? marketplaceTabs[nextTabIndex]
    : marketplaceTabs[marketplaceTabs.length - 1];

  const nextPathParams = {
    ...params,
    type: LISTING_PAGE_PARAM_TYPE_DRAFT,
    id: listingUUID,
    tab: nextTab,
  };

  const to = createResourceLocatorString('EditListingPage', routes, nextPathParams, {});
  console.log('Pushing directly to next tab:', to, 'nextPathParams:', nextPathParams);

  // Use replace if coming from 'new', otherwise push
  if (params.type === LISTING_PAGE_PARAM_TYPE_NEW) {
    history.replace(to);
  } else {
    history.push(to);
  }
};

/**
 * A single tab on the EditListingWizard.
 *
 * @component
 * @param {Object} props
 * @returns {JSX.Element} EditListingWizardTab component
 */
const EditListingWizardTab = props => {
  const {
    tab,
    marketplaceTabs,
    params,
    locationSearch,
    errors,
    fetchInProgress,
    newListingPublished,
    handleCreateFlowTabScrolling,
    handlePublishListing,
    history,
    images,
    listing,
    weeklyExceptionQueries,
    monthlyExceptionQueries,
    allExceptions,
    onFetchExceptions,
    onAddAvailabilityException,
    onDeleteAvailabilityException,
    onUpdateListing,
    onCreateListingDraft,
    onImageUpload,
    onManageDisableScrolling,
    onListingTypeChange,
    onRemoveImage,
    updatedTab,
    updateInProgress,
    tabSubmitButtonText,
    config,
    routeConfiguration,
    titleId,
    intl,
  } = props;

  console.log('EditListingWizardTab rendering with tab:', tab);
  console.log('Available marketplaceTabs:', marketplaceTabs);

  const { type } = params;
  const isNewURI = type === LISTING_PAGE_PARAM_TYPE_NEW;
  const isDraftURI = type === LISTING_PAGE_PARAM_TYPE_DRAFT;
  const isNewListingFlow = isNewURI || isDraftURI;

  const currentListing = ensureListing(listing);
  const isEditURI = type === LISTING_PAGE_PARAM_TYPE_EDIT;

  // New listing flow has automatic redirects to new tab on the wizard
  // and the last panel calls publishListing API endpoint.
  const automaticRedirectsForNewListingFlow = (tab, listingId) => {
    console.log('automaticRedirectsForNewListingFlow called:', {
      tab,
      listingId,
      lastTab: marketplaceTabs[marketplaceTabs.length - 1],
      isLastTab: tab === marketplaceTabs[marketplaceTabs.length - 1],
    });

    if (tab !== marketplaceTabs[marketplaceTabs.length - 1]) {
      console.log('Redirecting to next tab after draft update');
      // Create listing flow: smooth scrolling polyfill to scroll to correct tab
      handleCreateFlowTabScrolling(false);

      // After successful saving of draft data, user should be redirected to next tab
      redirectAfterDraftUpdate(
        listingId,
        params,
        tab,
        marketplaceTabs,
        history,
        routeConfiguration
      );
    } else {
      console.log('Last tab reached, calling handlePublishListing');
      handlePublishListing(listingId);
    }
  };

  const onCompleteEditListingWizardTab = (tab, updateValues) => {
    // In edit mode (type === 'edit'), always call onUpdateListing — never create a draft
    const hasDraftId = !!currentListing.id;
    const forceUpdate = isEditURI;
    const onUpdateListingOrCreateListingDraft = (!hasDraftId && !forceUpdate)
      ? (tab, values) => onCreateListingDraft(values, config)
      : (tab, values) => onUpdateListing(tab, values, config);

    const updateListingValues = (!hasDraftId && !forceUpdate)
      ? updateValues
      : { ...updateValues, id: currentListing.id };

    return onUpdateListingOrCreateListingDraft(tab, updateListingValues)
      .then(r => {
        // In Availability tab, the submitted data (plan) is inside a modal
        // We don't redirect provider immediately after plan is set
        if (isNewListingFlow && tab !== AVAILABILITY) {
          const listingId = r.data.data.id;
          automaticRedirectsForNewListingFlow(tab, listingId);
        }
      })
      .catch(e => {
        // No need for extra actions
      });
  };

  const panelProps = tab => {
    console.log('panelProps called:', {
      tab,
      listing,
      hasListing: !!listing,
      listingId: listing?.id,
    });

    return {
      className: css.panel,
      errors,
      listing,
      panelUpdated: updatedTab === tab,
      params,
      locationSearch,
      updateInProgress,
      // newListingPublished and fetchInProgress are flags for the last wizard tab
      ready: newListingPublished,
      disabled: fetchInProgress,
      submitButtonText: tabSubmitButtonText,
      listingTypes: config.listing.listingTypes,
      onManageDisableScrolling,
      onSubmit: values => {
        return onCompleteEditListingWizardTab(tab, values);
      },
      intl,
      updatePageTitle: ({ panelHeading }) => (
        <Helmet>
          <title>{intl.formatMessage({ id: titleId }, { panelHeading })}</title>
        </Helmet>
      ),
    };
  };

  // TODO: add missing cases for supported tabs
  switch (tab) {
    case DETAILS: {
      return (
        <EditListingDetailsPanel
          {...panelProps(DETAILS)}
          onListingTypeChange={onListingTypeChange}
          config={config}
          images={images}
          onImageUpload={onImageUpload}
          onRemoveImage={onRemoveImage}
          listingImageConfig={config.layout.listingImage}
        />
      );
    }
    case PRICING_AND_STOCK: {
      return (
        <EditListingPricingAndStockPanel
          {...panelProps(PRICING_AND_STOCK)}
          marketplaceCurrency={config.currency}
          listingMinimumPriceSubUnits={config.listingMinimumPriceSubUnits}
        />
      );
    }
    case PRICING: {
      return (
        <EditListingPricingPanel
          {...panelProps(PRICING)}
          marketplaceCurrency={config.currency}
          listingMinimumPriceSubUnits={config.listingMinimumPriceSubUnits}
        />
      );
    }
    case DELIVERY: {
      return (
        <EditListingDeliveryPanel {...panelProps(DELIVERY)} marketplaceCurrency={config.currency} />
      );
    }
    case LOCATION: {
      return <EditListingLocationPanel {...panelProps(LOCATION)} />;
    }
    case AVAILABILITY: {
      return (
        <EditListingAvailabilityPanel
          allExceptions={allExceptions}
          weeklyExceptionQueries={weeklyExceptionQueries}
          monthlyExceptionQueries={monthlyExceptionQueries}
          onFetchExceptions={onFetchExceptions}
          onAddAvailabilityException={onAddAvailabilityException}
          onDeleteAvailabilityException={onDeleteAvailabilityException}
          onNextTab={() =>
            redirectAfterDraftUpdate(
              listing.id,
              params,
              tab,
              marketplaceTabs,
              history,
              routeConfiguration
            )
          }
          config={config}
          history={history}
          routeConfiguration={routeConfiguration}
          {...panelProps(AVAILABILITY)}
        />
      );
    }
    case PHOTOS: {
      return (
        <EditListingPhotosPanel
          {...panelProps(PHOTOS)}
          listingImageConfig={config.layout.listingImage}
          images={images}
          onImageUpload={onImageUpload}
          onRemoveImage={onRemoveImage}
        />
      );
    }
    case STYLE: {
      return (
        <EditListingStylePanel
          {...panelProps(STYLE)}
          listingImageConfig={config.layout.listingImage}
          images={images}
        />
      );
    }
    default:
      return null;
  }
};

export default EditListingWizardTab;
