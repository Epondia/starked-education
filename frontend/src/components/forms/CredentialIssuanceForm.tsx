'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Award } from 'lucide-react';
import {
  credentialIssuanceSchema,
  type CredentialIssuanceFormData,
  type CredentialIssuanceFormDataIn,
  CREDENTIAL_TYPES,
} from '@/lib/schemas';
import { FormField } from '@/components/forms/FormField';

export interface CredentialIssuanceFormProps {
  onSubmit: (data: CredentialIssuanceFormData) => Promise<void>;
  defaultValues?: Partial<CredentialIssuanceFormDataIn>;
  submitLabel?: string;
}

const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  certificate: 'Certificate', badge: 'Badge',
  diploma: 'Diploma', achievement: 'Achievement', license: 'License',
};

const selectClasses = (hasError: boolean) =>
  `w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
    hasError
      ? 'border-red-400 focus:ring-red-500'
      : 'border-gray-300 dark:border-slate-600 focus:ring-blue-500'
  }`;

/**
 * Credential issuance form with real-time (onBlur) Zod validation and inline error states.
 *
 * - Recipient info (name, email, wallet address)
 * - Credential type, title, description
 * - Optional course ID and metadata
 * - Issue date (required) and expiration date (optional)
 * - Submit disabled while form is invalid or submitting
 */
export function CredentialIssuanceForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Issue credential',
}: CredentialIssuanceFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<CredentialIssuanceFormDataIn, any, CredentialIssuanceFormData>({
    resolver: zodResolver(
      credentialIssuanceSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<CredentialIssuanceFormDataIn, any, CredentialIssuanceFormData>,
    mode: 'onBlur',
    defaultValues: {
      issueDate: today,
      expirationDate: '',
      courseId: '',
      metadata: '',
      ...defaultValues,
    },
  });

  const onFormSubmit = async (data: CredentialIssuanceFormData) => {
    setServerError(null);
    try {
      await onSubmit(data);
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : 'Failed to issue credential.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-6">
      {/* Recipient section */}
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-gray-900 dark:text-white">
          Recipient
        </legend>

        <FormField
          label="Recipient name"
          type="text"
          autoComplete="off"
          required
          placeholder="Jane Doe"
          error={errors.recipientName?.message}
          {...register('recipientName')}
        />

        <FormField
          label="Recipient email"
          type="email"
          autoComplete="off"
          required
          placeholder="jane@example.com"
          error={errors.recipientEmail?.message}
          {...register('recipientEmail')}
        />

        <FormField
          label="Recipient wallet address"
          type="text"
          autoComplete="off"
          required
          placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          helperText="Stellar public key (G…) where the credential will be issued."
          error={errors.recipientWalletAddress?.message}
          {...register('recipientWalletAddress')}
        />
      </fieldset>

      {/* Credential details section */}
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-gray-900 dark:text-white">
          Credential details
        </legend>

        {/* Credential type */}
        <div className="space-y-1">
          <label htmlFor="credential-type" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Credential type <span className="text-red-500 ml-0.5" aria-label="required">*</span>
          </label>
          <select
            id="credential-type"
            aria-invalid={Boolean(errors.credentialType)}
            aria-describedby={errors.credentialType ? 'credential-type-error' : undefined}
            className={selectClasses(Boolean(errors.credentialType))}
            {...register('credentialType')}
          >
            <option value="">Select a type</option>
            {CREDENTIAL_TYPES.map((t) => (
              <option key={t} value={t}>{CREDENTIAL_TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>
          {errors.credentialType && (
            <p id="credential-type-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.credentialType.message}
            </p>
          )}
        </div>

        <FormField
          label="Credential title"
          type="text"
          required
          placeholder="e.g. Stellar Smart Contract Developer"
          error={errors.credentialTitle?.message}
          {...register('credentialTitle')}
        />

        <FormField
          label="Description"
          multiline
          rows={4}
          required
          placeholder="Describe what this credential represents and how it was earned…"
          error={errors.description?.message}
          {...register('description')}
        />

        <FormField
          label="Associated course ID"
          type="text"
          placeholder="course-abc123 (optional)"
          helperText="Link this credential to a specific course."
          error={errors.courseId?.message}
          {...register('courseId')}
        />
      </fieldset>

      {/* Dates section */}
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-gray-900 dark:text-white">
          Validity
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Issue date"
            type="date"
            required
            error={errors.issueDate?.message}
            {...register('issueDate')}
          />

          <FormField
            label="Expiration date"
            type="date"
            helperText="Leave blank for credentials that do not expire."
            error={errors.expirationDate?.message}
            {...register('expirationDate')}
          />
        </div>
      </fieldset>

      {/* Additional metadata */}
      <FormField
        label="Additional metadata"
        multiline
        rows={2}
        placeholder='{"grade": "A+", "score": 98} — optional JSON or plain text'
        helperText="Stored on-chain alongside the credential."
        error={errors.metadata?.message}
        {...register('metadata')}
      />

      {serverError && (
        <div role="alert" aria-live="assertive" className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !isValid}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Issuing…</>
        ) : (
          <><Award className="w-4 h-4" aria-hidden="true" /> {submitLabel}</>
        )}
      </button>
    </form>
  );
}
