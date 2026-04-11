import React from 'react';
import { Form as FinalForm } from 'react-final-form';
import { FormattedMessage } from '../../../util/reactIntl';
import { required } from '../../../util/validators';
import { Form, PrimaryButton, FieldTextInput } from '../../../components';

import css from './ShippingAddressForm.module.css';

const ShippingAddressForm = props => {
  const { onSubmit, inProgress } = props;

  return (
    <FinalForm
      onSubmit={onSubmit}
      render={({ handleSubmit, submitting, pristine }) => {
        const submitDisabled = submitting || pristine || inProgress;

        return (
          <Form className={css.root} onSubmit={handleSubmit}>
            <h2 className={css.sectionTitle}>
              <FormattedMessage id="ShippingAddressForm.title" />
            </h2>

            <FieldTextInput
              className={css.field}
              type="text"
              id="street"
              name="street"
              autoComplete="street-address"
              label="Street Address"
              placeholder="123 Main St"
              validate={required('Street address is required')}
            />

            <div className={css.row}>
              <FieldTextInput
                className={css.fieldHalf}
                type="text"
                id="city"
                name="city"
                autoComplete="address-level2"
                label="City"
                placeholder="City"
                validate={required('City is required')}
              />

              <FieldTextInput
                className={css.fieldHalf}
                type="text"
                id="state"
                name="state"
                autoComplete="address-level1"
                label="State"
                placeholder="CA"
                validate={required('State is required')}
              />
            </div>

            <div className={css.row}>
              <FieldTextInput
                className={css.fieldHalf}
                type="text"
                id="zip"
                name="zip"
                autoComplete="postal-code"
                label="ZIP Code"
                placeholder="12345"
                validate={required('ZIP code is required')}
              />

              <FieldTextInput
                className={css.fieldHalf}
                type="text"
                id="country"
                name="country"
                autoComplete="country"
                label="Country"
                placeholder="US"
                validate={required('Country is required')}
              />
            </div>

            <div className={css.submitButton}>
              <PrimaryButton type="submit" inProgress={inProgress} disabled={submitDisabled}>
                <FormattedMessage id="ShippingAddressForm.continue" />
              </PrimaryButton>
            </div>
          </Form>
        );
      }}
    />
  );
};

export default ShippingAddressForm;
