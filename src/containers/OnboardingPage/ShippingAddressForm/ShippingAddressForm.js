import React, { useState } from 'react';
import { FormattedMessage } from '../../../util/reactIntl';
import { PrimaryButton } from '../../../components';

import css from './ShippingAddressForm.module.css';

const COUNTRIES = [
  { value: 'CA', label: 'Canada' },
  { value: 'US', label: 'United States' },
];

const INITIAL_VALUES = {
  street: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
  country: '',
  secondaryStreet: '',
  secondaryAddress2: '',
  secondaryCity: '',
  secondaryState: '',
  secondaryZip: '',
  secondaryCountry: '',
};

const AddressBlock = ({ prefix = '', values, handleChange, errors }) => {
  const f = name => (prefix ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}` : name);

  return (
    <>
      <div className={css.field}>
        <label className={css.label} htmlFor={f('street')}>Street Address</label>
        <input
          className={css.input}
          type="text"
          id={f('street')}
          name={f('street')}
          value={values[f('street')] || ''}
          onChange={handleChange}
          placeholder="123 Main St"
          autoComplete="street-address"
        />
        {errors[f('street')] && <div className={css.fieldError}>{errors[f('street')]}</div>}
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor={f('address2')}>Address Line 2 (optional)</label>
        <input
          className={css.input}
          type="text"
          id={f('address2')}
          name={f('address2')}
          value={values[f('address2')] || ''}
          onChange={handleChange}
          placeholder="Apt, Suite, Unit, etc."
          autoComplete="address-line2"
        />
      </div>

      <div className={css.row}>
        <div className={css.fieldHalf}>
          <label className={css.label} htmlFor={f('city')}>City</label>
          <input
            className={css.input}
            type="text"
            id={f('city')}
            name={f('city')}
            value={values[f('city')] || ''}
            onChange={handleChange}
            placeholder="City"
            autoComplete="address-level2"
          />
          {errors[f('city')] && <div className={css.fieldError}>{errors[f('city')]}</div>}
        </div>

        <div className={css.fieldHalf}>
          <label className={css.label} htmlFor={f('state')}>Province / State</label>
          <input
            className={css.input}
            type="text"
            id={f('state')}
            name={f('state')}
            value={values[f('state')] || ''}
            onChange={handleChange}
            placeholder="ON"
            autoComplete="address-level1"
          />
          {errors[f('state')] && <div className={css.fieldError}>{errors[f('state')]}</div>}
        </div>
      </div>

      <div className={css.row}>
        <div className={css.fieldHalf}>
          <label className={css.label} htmlFor={f('zip')}>Postal / Zip Code</label>
          <input
            className={css.input}
            type="text"
            id={f('zip')}
            name={f('zip')}
            value={values[f('zip')] || ''}
            onChange={handleChange}
            placeholder="M1M 1A1 or 90210"
            autoComplete="postal-code"
          />
          {errors[f('zip')] && <div className={css.fieldError}>{errors[f('zip')]}</div>}
        </div>

        <div className={css.fieldHalf}>
          <label className={css.label} htmlFor={f('country')}>Country</label>
          <select
            className={css.select}
            id={f('country')}
            name={f('country')}
            value={values[f('country')] || ''}
            onChange={handleChange}
          >
            <option value="">Select country</option>
            {COUNTRIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          {errors[f('country')] && <div className={css.fieldError}>{errors[f('country')]}</div>}
        </div>
      </div>
    </>
  );
};

const validate = (values, hasSeparateShipping) => {
  const errors = {};
  const required = ['street', 'city', 'state', 'zip', 'country'];

  required.forEach(field => {
    if (!values[field]) errors[field] = 'This field is required';
  });

  if (hasSeparateShipping) {
    required.forEach(field => {
      const key = `secondary${field.charAt(0).toUpperCase()}${field.slice(1)}`;
      if (!values[key]) errors[key] = 'This field is required';
    });
  }

  return errors;
};

const ShippingAddressForm = props => {
  const { onSubmit, inProgress } = props;
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [hasSeparateShipping, setHasSeparateShipping] = useState(false);

  const handleChange = e => {
    const { name, value } = e.target;
    setValues(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = e => {
    e.preventDefault();

    const validationErrors = validate(values, hasSeparateShipping);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const primaryAddress = {
      street: values.street,
      address2: values.address2 || null,
      city: values.city,
      state: values.state,
      zip: values.zip,
      country: values.country,
    };

    let deliveryAddress, shippingAddress;

    if (!hasSeparateShipping) {
      deliveryAddress = primaryAddress;
      shippingAddress = null;
    } else {
      // Primary = delivery, secondary = shipping (where items are sent from)
      deliveryAddress = primaryAddress;
      shippingAddress = {
        street: values.secondaryStreet,
        address2: values.secondaryAddress2 || null,
        city: values.secondaryCity,
        state: values.secondaryState,
        zip: values.secondaryZip,
        country: values.secondaryCountry,
      };
    }

    onSubmit({ deliveryAddress, shippingAddress });
  };

  return (
    <form className={css.root} onSubmit={handleSubmit}>
      <p className={css.addressGroupLabel}>Your Address</p>
      <AddressBlock values={values} handleChange={handleChange} errors={errors} />

      <label className={css.checkboxLabel}>
        <input
          type="checkbox"
          className={css.checkbox}
          checked={hasSeparateShipping}
          onChange={e => setHasSeparateShipping(e.target.checked)}
        />
        I ship items from a different address
      </label>

      {hasSeparateShipping && (
        <div className={css.secondaryAddress}>
          <h3 className={css.secondaryTitle}>Shipping Address (where you send items from)</h3>
          <AddressBlock
            prefix="secondary"
            values={values}
            handleChange={handleChange}
            errors={errors}
          />
        </div>
      )}

      <div className={css.submitButton}>
        <PrimaryButton type="submit" inProgress={inProgress} disabled={inProgress}>
          <FormattedMessage id="ShippingAddressForm.continue" />
        </PrimaryButton>
      </div>
    </form>
  );
};

export default ShippingAddressForm;
