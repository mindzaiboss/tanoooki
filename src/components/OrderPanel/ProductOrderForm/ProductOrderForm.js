import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Form as FinalForm, FormSpy } from 'react-final-form';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { propTypes } from '../../../util/types';
import { numberAtLeast, required } from '../../../util/validators';
import { PURCHASE_PROCESS_NAME } from '../../../transactions/transaction';

import {
  Form,
  FieldSelect,
  FieldTextInput,
  InlineTextButton,
  PrimaryButton,
  H3,
  H6,
} from '../../../components';

import EstimatedCustomerBreakdownMaybe from '../EstimatedCustomerBreakdownMaybe';

import FetchLineItemsError from '../FetchLineItemsError/FetchLineItemsError.js';

import css from './ProductOrderForm.module.css';

// Browsers can't render huge number of select options.
// (stock is shown inside select element)
// Note: input element could allow ordering bigger quantities
const MAX_QUANTITY_FOR_DROPDOWN = 100;

const handleFetchLineItems = ({
  quantity,
  deliveryMethod,
  displayDeliveryMethod,
  listingId,
  isOwnListing,
  fetchLineItemsInProgress,
  onFetchTransactionLineItems,
  shippingAmount,
}) => {
  const stockReservationQuantity = Number.parseInt(quantity, 10);
  const deliveryMethodMaybe = deliveryMethod ? { deliveryMethod } : {};
  const shippingAmountMaybe = shippingAmount ? { shippingAmount } : {};
  const isBrowser = typeof window !== 'undefined';
  if (
    isBrowser &&
    stockReservationQuantity &&
    (!displayDeliveryMethod || deliveryMethod) &&
    !fetchLineItemsInProgress
  ) {
    onFetchTransactionLineItems({
      orderData: { stockReservationQuantity, ...deliveryMethodMaybe, ...shippingAmountMaybe },
      listingId,
      isOwnListing,
    });
  }
};

const DeliveryMethodMaybe = props => {
  const {
    displayDeliveryMethod,
    hasMultipleDeliveryMethods,
    deliveryMethod,
    hasStock,
    formId,
    intl,
  } = props;
  const showDeliveryMethodSelector = displayDeliveryMethod && hasMultipleDeliveryMethods;
  const showSingleDeliveryMethod = displayDeliveryMethod && deliveryMethod;
  return !hasStock ? null : showDeliveryMethodSelector ? (
    <FieldSelect
      id={`${formId}.deliveryMethod`}
      className={css.deliveryField}
      name="deliveryMethod"
      label={intl.formatMessage({ id: 'ProductOrderForm.deliveryMethodLabel' })}
      validate={required(intl.formatMessage({ id: 'ProductOrderForm.deliveryMethodRequired' }))}
    >
      <option disabled value="">
        {intl.formatMessage({ id: 'ProductOrderForm.selectDeliveryMethodOption' })}
      </option>
      <option value={'pickup'}>
        {intl.formatMessage({ id: 'ProductOrderForm.pickupOption' })}
      </option>
      <option value={'shipping'}>
        {intl.formatMessage({ id: 'ProductOrderForm.shippingOption' })}
      </option>
    </FieldSelect>
  ) : showSingleDeliveryMethod ? (
    <div className={css.deliveryField}>
      <H3 rootClassName={css.singleDeliveryMethodLabel}>
        {intl.formatMessage({ id: 'ProductOrderForm.deliveryMethodLabel' })}
      </H3>
      <p className={css.singleDeliveryMethodSelected}>
        {deliveryMethod === 'shipping'
          ? intl.formatMessage({ id: 'ProductOrderForm.shippingOption' })
          : intl.formatMessage({ id: 'ProductOrderForm.pickupOption' })}
      </p>
      <FieldTextInput
        id={`${formId}.deliveryMethod`}
        className={css.deliveryField}
        name="deliveryMethod"
        type="hidden"
      />
    </div>
  ) : (
    <FieldTextInput
      id={`${formId}.deliveryMethod`}
      className={css.deliveryField}
      name="deliveryMethod"
      type="hidden"
    />
  );
};

const roundToNearest9 = amount => {
  const cents = Math.ceil(amount * 100);
  const mod = cents % 10;
  if (mod === 9) return cents / 100;
  return (cents + (9 - mod)) / 100;
};

const applyMarkup = amount => {
  const markup = Math.max(amount * 0.05, 0.5);
  return roundToNearest9(amount + markup);
};

const ShippingRatesMaybe = ({ listing, formApi, deliveryMethod }) => {
  const [rateTiers, setRateTiers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [usingGeo, setUsingGeo] = useState(false);
  const [selectedTier, setSelectedTier] = useState('economy');
  const [sellerCountry, setSellerCountry] = useState(null);
  const [buyerCountry, setBuyerCountry] = useState(null);

  const currentUser = useSelector(state => state.user.currentUser);

  const publicData = listing?.attributes?.publicData || {};
  console.log('listing publicData:', publicData);
  const {
    pub_packageWeight,
    pub_packageWeightUnit = 'lb',
    pub_packageLength,
    pub_packageWidth,
    pub_packageHeight,
    pub_packageDistanceUnit = 'in',
    pub_shipFrom,
  } = publicData;

  const hasPackageData =
    pub_packageWeight && pub_packageLength && pub_packageWidth && pub_packageHeight;
  const isShipping = deliveryMethod === 'shipping';
  const userId = currentUser?.id?.uuid;

  const sellerId = listing?.author?.id?.uuid;

  useEffect(() => {
    if (!isShipping || !hasPackageData) return;

    const run = async () => {
      // Step 1: Fetch the seller's real ship-from address via the Integration API
      let sellerAddress;
      try {
        const locRes = await fetch('/api/seller-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellerId }),
        });
        const locData = await locRes.json();
        sellerAddress = locData.success && locData.address ? locData.address : null;
      } catch (e) {
        sellerAddress = null;
      }
      // Fallback if seller-location call fails or returns nothing
      if (!sellerAddress) {
        sellerAddress = {
          name: 'Seller',
          street1: '215 Clayton St',
          city: 'San Francisco',
          state: 'CA',
          zip: '94117',
          country: 'US',
        };
      }

      setSellerCountry(sellerAddress.country || null);

      // Step 2: Fetch Shippo rates with the resolved seller address
      const fetchRates = async addressTo => {
        setLoading(true);
        setFailed(false);
        try {
          const payload = {
            addressFrom: sellerAddress,
            addressTo,
            parcel: {
              weight: pub_packageWeight,
              mass_unit: pub_packageWeightUnit,
              length: pub_packageLength,
              width: pub_packageWidth,
              height: pub_packageHeight,
              distance_unit: pub_packageDistanceUnit,
            },
          };
          console.log('ShippingRatesMaybe payload:', JSON.stringify(payload, null, 2));
          const res = await fetch('/api/shippo-rates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (data.rates && data.rates.length > 0) {
            // Fetch FX rates to convert any non-USD amounts to USD
            let fxRates = null;
            try {
              const fxRes = await fetch('/api/fx-rates');
              const fxData = await fxRes.json();
              fxRates = fxData.rates || null;
            } catch (e) {
              // proceed without conversion if FX fetch fails
            }

            const toUSD = (amount, currency) => {
              if (currency === 'USD' || !fxRates) return amount;
              const usdRate = fxRates['USD'];
              const srcRate = fxRates[currency];
              if (!usdRate || !srcRate) return amount;
              return amount * (usdRate / srcRate);
            };

            // Normalise all rates to USD amounts for sorting and display
            const normalised = data.rates.map(rate => ({
              ...rate,
              amountUSD: toUSD(parseFloat(rate.amount), rate.currency),
            }));

            // Sort all rates cheapest first
            const byPrice = [...normalised].sort((a, b) => a.amountUSD - b.amountUSD);

            const cheapestOf = group =>
              group.reduce((best, r) => (r.amountUSD < best.amountUSD ? r : best));

            // Distinct estimatedDays values, ascending (fastest first)
            const distinctDays = [
              ...new Set(normalised.map(r => r.estimatedDays || 999)),
            ].sort((a, b) => a - b);

            let slots;

            if (distinctDays.length === 1) {
              // All same speed — show up to 3 cheapest distinct rates by price
              const seen = new Set();
              slots = byPrice
                .filter(r => {
                  if (seen.has(r.rateId)) return false;
                  seen.add(r.rateId);
                  return true;
                })
                .slice(0, 3);
            } else {
              const fastestDays = distinctDays[0];
              const slowestDays = distinctDays[distinctDays.length - 1];

              const slowestGroup = normalised.filter(r => (r.estimatedDays || 999) === slowestDays);
              const fastestGroup = normalised.filter(r => (r.estimatedDays || 999) === fastestDays);

              const picked = [cheapestOf(slowestGroup)];

              if (distinctDays.length === 2) {
                picked.push(cheapestOf(fastestGroup));
              } else {
                const middleGroup = normalised.filter(r => {
                  const d = r.estimatedDays || 999;
                  return d > fastestDays && d < slowestDays;
                });
                picked.push(cheapestOf(middleGroup));
                picked.push(cheapestOf(fastestGroup));
              }

              // Dedup by rateId, then sort cheapest first
              const seen = new Set();
              slots = picked
                .filter(r => {
                  if (seen.has(r.rateId)) return false;
                  seen.add(r.rateId);
                  return true;
                })
                .sort((a, b) => a.amountUSD - b.amountUSD);
            }

            setRateTiers(slots);
            setSelectedTier(slots[0].rateId);
            formApi.change('shippingRate', {
              ...slots[0],
              displayAmount: applyMarkup(slots[0].amountUSD),
            });
          } else {
            setFailed(true);
          }
        } catch (e) {
          setFailed(true);
        } finally {
          setLoading(false);
        }
      };

      // Step 3: Build addressTo from saved address or IP geolocation
      const privateData = currentUser?.attributes?.profile?.privateData || {};
      const { streetAddress, city, stateProvince, postalCode, country } = privateData;
      const hasAddress = streetAddress && city && postalCode;

      if (hasAddress) {
        setBuyerCountry(country || 'US');
        setUsingGeo(false);
        await fetchRates({
          name: 'Buyer',
          street1: streetAddress,
          city,
          state: stateProvince || '',
          zip: postalCode,
          country: country || 'US',
        });
      } else {
        try {
          const geoRes = await fetch('/api/geolocate');
          const geoData = await geoRes.json();
          const { countryCode, region, city: geoCity } = geoData;
          const geoCountry = countryCode || 'US';
          const noLocation = !geoCity && !region;

          // Fallbacks for localhost/dev where IP geolocation returns null
          const COUNTRY_FALLBACKS = {
            US: { city: 'Chicago',     state: 'IL',  zip: '60601' },
            CA: { city: 'Toronto',     state: 'ON',  zip: 'M5V 3A8' },
            GB: { city: 'London',      state: '',    zip: '' },
            AU: { city: 'Sydney',      state: 'NSW', zip: '' },
            DE: { city: 'Berlin',      state: '',    zip: '' },
            FR: { city: 'Paris',       state: '',    zip: '' },
            JP: { city: 'Tokyo',       state: '',    zip: '' },
            CN: { city: 'Beijing',     state: '',    zip: '' },
            KR: { city: 'Seoul',       state: '',    zip: '' },
            MX: { city: 'Mexico City', state: '',    zip: '' },
            BR: { city: 'Brasilia',    state: '',    zip: '' },
            IN: { city: 'New Delhi',   state: '',    zip: '' },
            SG: { city: 'Singapore',   state: '',    zip: '' },
            HK: { city: 'Hong Kong',   state: '',    zip: '' },
            NL: { city: 'Amsterdam',   state: '',    zip: '' },
            IT: { city: 'Rome',        state: '',    zip: '' },
            ES: { city: 'Madrid',      state: '',    zip: '' },
          };

          const fallback = noLocation
            ? COUNTRY_FALLBACKS[geoCountry] || { city: '', state: '', zip: '' }
            : null;

          setBuyerCountry(geoCountry);
          setUsingGeo(true);
          await fetchRates({
            name: 'Buyer',
            street1: '',
            city: fallback ? fallback.city : geoCity,
            state: fallback ? fallback.state : region || '',
            zip: fallback ? fallback.zip : '',
            country: geoCountry,
          });
        } catch (e) {
          setFailed(true);
        }
      }
    };

    run();
  }, [isShipping, userId, sellerId]);

  if (!isShipping || !hasPackageData) return null;

  if (loading) {
    return (
      <div className={css.shippingRates}>
        <p className={css.shippingRatesLoading}>Calculating shipping...</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={css.shippingRates}>
        <p className={css.shippingRatesUnavailable}>Shipping unavailable</p>
      </div>
    );
  }

  if (!rateTiers || rateTiers.length === 0) return null;

  const CARRIER_ABBREV = {
    'Canada Post': 'CP',
    'UPS': 'UPS',
    'USPS': 'USPS',
    'FedEx': 'FedEx',
    'DHL Express': 'DHL',
  };
  const abbrevCarrier = name => CARRIER_ABBREV[name] || (name ? name.split(' ')[0] : name);

  const handleTierChange = e => {
    const rateId = e.target.value;
    setSelectedTier(rateId);
    const rate = rateTiers.find(r => r.rateId === rateId);
    formApi.change('shippingRate', {
      ...rate,
      displayAmount: applyMarkup(rate.amountUSD),
    });
  };

  return (
    <div className={css.shippingRates}>
      <label className={css.shippingRatesLabel}>Shipping</label>
      <select className={css.shippingRatesSelect} value={selectedTier} onChange={handleTierChange}>
        {rateTiers.map(rate => {
          const price = applyMarkup(rate.amountUSD);
          const carrier = abbrevCarrier(rate.carrier);
          const days = rate.estimatedDays
            ? `${rate.estimatedDays} day${rate.estimatedDays === 1 ? '' : 's'}`
            : 'Est. time varies';
          return (
            <option key={rate.rateId} value={rate.rateId}>
              {carrier} {rate.service} — {days} — ${price.toFixed(2)}
            </option>
          );
        })}
      </select>
      {usingGeo ? (
        <p className={css.shippingRatesDisclaimer}>
          Estimated shipping based on your location. Sign up or add your address for exact rates.
        </p>
      ) : null}
      {rateTiers && sellerCountry && buyerCountry && sellerCountry !== buyerCountry ? (
        <p className={css.shippingRatesTariffWarning}>
          ⚠️ Import duties and taxes may apply.{' '}
          <span
            className={css.shippingRatesTooltipAnchor}
            title="Cross-border shipments may be subject to customs duties and import taxes charged by the destination country. These fees are not included in the shipping rate shown and are the buyer's responsibility."
          >
            Learn more
          </span>
        </p>
      ) : null}
    </div>
  );
};

const renderForm = formRenderProps => {
  const [mounted, setMounted] = useState(false);
  const {
    // FormRenderProps from final-form
    handleSubmit,
    form: formApi,

    // Custom props passed to the form component
    intl,
    formId,
    currentStock,
    allowOrdersOfMultipleItems,
    hasMultipleDeliveryMethods,
    displayDeliveryMethod,
    listingId,
    isOwnListing,
    onFetchTransactionLineItems,
    onContactUser,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    price,
    payoutDetailsWarning,
    marketplaceName,
    listing,
    values,
  } = formRenderProps;

  // Note: don't add custom logic before useEffect
  useEffect(() => {
    setMounted(true);

    // Side-effect: fetch line-items after mounting if possible
    const { quantity, deliveryMethod } = values;
    if (quantity && !formRenderProps.hasMultipleDeliveryMethods) {
      handleFetchLineItems({
        quantity,
        deliveryMethod,
        displayDeliveryMethod,
        listingId,
        isOwnListing,
        fetchLineItemsInProgress,
        onFetchTransactionLineItems,
      });
    }
  }, []);

  // If form values change, update line-items for the order breakdown
  const handleOnChange = formValues => {
    const { quantity, deliveryMethod, shippingRate } = formValues.values;
    const shippingAmount = shippingRate?.displayAmount
      ? Math.round(shippingRate.displayAmount * 100)
      : undefined;
    if (mounted) {
      handleFetchLineItems({
        quantity,
        deliveryMethod,
        listingId,
        isOwnListing,
        fetchLineItemsInProgress,
        onFetchTransactionLineItems,
        shippingAmount,
      });
    }
  };

  // In case quantity and deliveryMethod are missing focus on that select-input.
  // Otherwise continue with the default handleSubmit function.
  const handleFormSubmit = e => {
    const { quantity, deliveryMethod } = values || {};
    if (!quantity || quantity < 1) {
      e.preventDefault();
      // Blur event will show validator message
      formApi.blur('quantity');
      formApi.focus('quantity');
    } else if (displayDeliveryMethod && !deliveryMethod) {
      e.preventDefault();
      // Blur event will show validator message
      formApi.blur('deliveryMethod');
      formApi.focus('deliveryMethod');
    } else {
      handleSubmit(e);
    }
  };

  const breakdownData = {};
  const showBreakdown =
    breakdownData && lineItems && !fetchLineItemsInProgress && !fetchLineItemsError;

  const showContactUser = typeof onContactUser === 'function';

  const onClickContactUser = e => {
    e.preventDefault();
    onContactUser();
  };

  const contactSellerLink = (
    <InlineTextButton onClick={onClickContactUser}>
      <FormattedMessage id="ProductOrderForm.finePrintNoStockLinkText" />
    </InlineTextButton>
  );
  const quantityRequiredMsg = intl.formatMessage({ id: 'ProductOrderForm.quantityRequired' });

  // Listing is out of stock if currentStock is zero.
  // Undefined/null stock means that stock has never been set.
  const hasNoStockLeft = typeof currentStock != null && currentStock === 0;
  const hasStock = currentStock && currentStock > 0;
  const hasOneItemLeft = currentStock === 1;
  const selectableStock =
    currentStock > MAX_QUANTITY_FOR_DROPDOWN ? MAX_QUANTITY_FOR_DROPDOWN : currentStock;
  const quantities = hasStock ? [...Array(selectableStock).keys()].map(i => i + 1) : [];

  const submitInProgress = fetchLineItemsInProgress;
  const submitDisabled = !hasStock;

  return (
    <Form onSubmit={handleFormSubmit}>
      <FormSpy subscription={{ values: true }} onChange={handleOnChange} />

      {hasNoStockLeft ? null : hasOneItemLeft || !allowOrdersOfMultipleItems ? (
        <FieldTextInput
          id={`${formId}.quantity`}
          className={css.quantityField}
          name="quantity"
          type="hidden"
          validate={numberAtLeast(quantityRequiredMsg, 1)}
        />
      ) : (
        <FieldSelect
          id={`${formId}.quantity`}
          className={css.quantityField}
          name="quantity"
          disabled={!hasStock}
          label={intl.formatMessage({ id: 'ProductOrderForm.quantityLabel' })}
          validate={numberAtLeast(quantityRequiredMsg, 1)}
        >
          <option disabled value="">
            {intl.formatMessage({ id: 'ProductOrderForm.selectQuantityOption' })}
          </option>
          {quantities.map(quantity => (
            <option key={quantity} value={quantity}>
              {intl.formatMessage({ id: 'ProductOrderForm.quantityOption' }, { quantity })}
            </option>
          ))}
        </FieldSelect>
      )}

      <DeliveryMethodMaybe
        displayDeliveryMethod={displayDeliveryMethod}
        hasMultipleDeliveryMethods={hasMultipleDeliveryMethods}
        deliveryMethod={values?.deliveryMethod}
        hasStock={hasStock}
        formId={formId}
        intl={intl}
      />

      <ShippingRatesMaybe
        listing={listing}
        formApi={formApi}
        deliveryMethod={values?.deliveryMethod}
      />

      {showBreakdown ? (
        <div className={css.breakdownWrapper}>
          <H6 as="h3" className={css.bookingBreakdownTitle}>
            <FormattedMessage id="ProductOrderForm.breakdownTitle" />
          </H6>
          <hr className={css.totalDivider} />
          <EstimatedCustomerBreakdownMaybe
            breakdownData={breakdownData}
            lineItems={lineItems}
            currency={price.currency}
            marketplaceName={marketplaceName}
            processName={PURCHASE_PROCESS_NAME}
          />
        </div>
      ) : null}

      <FetchLineItemsError error={fetchLineItemsError} />

      <div className={css.submitButton}>
        <PrimaryButton type="submit" inProgress={submitInProgress} disabled={submitDisabled}>
          {hasStock ? (
            <FormattedMessage id="ProductOrderForm.ctaButton" />
          ) : (
            <FormattedMessage id="ProductOrderForm.ctaButtonNoStock" />
          )}
        </PrimaryButton>
      </div>
      <p className={css.finePrint}>
        {payoutDetailsWarning ? (
          payoutDetailsWarning
        ) : hasStock && isOwnListing ? (
          <FormattedMessage id="ProductOrderForm.ownListing" />
        ) : hasStock ? (
          <FormattedMessage id="ProductOrderForm.finePrint" />
        ) : showContactUser ? (
          <FormattedMessage id="ProductOrderForm.finePrintNoStock" values={{ contactSellerLink }} />
        ) : null}
      </p>
    </Form>
  );
};

/**
 * A form for ordering a product.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} props.marketplaceName - The name of the marketplace
 * @param {string} props.formId - The ID of the form
 * @param {Function} props.onSubmit - The function to handle the form submission
 * @param {propTypes.uuid} props.listingId - The ID of the listing
 * @param {propTypes.money} props.price - The price of the listing
 * @param {number} props.currentStock - The current stock of the listing
 * @param {boolean} props.isOwnListing - Whether the listing is owned by the current user
 * @param {boolean} props.pickupEnabled - Whether pickup is enabled
 * @param {boolean} props.shippingEnabled - Whether shipping is enabled
 * @param {boolean} props.displayDeliveryMethod - Whether the delivery method is displayed
 * @param {Object} props.lineItems - The line items
 * @param {Function} props.onFetchTransactionLineItems - The function to fetch the transaction line items
 * @param {boolean} props.fetchLineItemsInProgress - Whether the line items are being fetched
 * @param {propTypes.error} props.fetchLineItemsError - The error for fetching the line items
 * @param {Function} props.onContactUser - The function to contact the user
 * @returns {JSX.Element}
 */
const ProductOrderForm = props => {
  const intl = useIntl();
  const {
    price,
    currentStock,
    pickupEnabled,
    shippingEnabled,
    displayDeliveryMethod,
    allowOrdersOfMultipleItems,
  } = props;

  // Should not happen for listings that go through EditListingWizard.
  // However, this might happen for imported listings.
  if (displayDeliveryMethod && !pickupEnabled && !shippingEnabled) {
    return (
      <p className={css.error}>
        <FormattedMessage id="ProductOrderForm.noDeliveryMethodSet" />
      </p>
    );
  }

  const hasOneItemLeft = currentStock && currentStock === 1;
  const hasOneItemMode = !allowOrdersOfMultipleItems && currentStock > 0;
  const quantityMaybe = hasOneItemLeft || hasOneItemMode ? { quantity: '1' } : {};
  const deliveryMethodMaybe =
    shippingEnabled && !pickupEnabled
      ? { deliveryMethod: 'shipping' }
      : !shippingEnabled && pickupEnabled
      ? { deliveryMethod: 'pickup' }
      : !shippingEnabled && !pickupEnabled
      ? { deliveryMethod: 'none' }
      : {};
  const hasMultipleDeliveryMethods = pickupEnabled && shippingEnabled;
  const initialValues = { ...quantityMaybe, ...deliveryMethodMaybe };

  return (
    <FinalForm
      initialValues={initialValues}
      hasMultipleDeliveryMethods={hasMultipleDeliveryMethods}
      displayDeliveryMethod={displayDeliveryMethod}
      {...props}
      intl={intl}
      render={renderForm}
    />
  );
};

export default ProductOrderForm;
