import { Effect, Schema } from 'effect';

/** Validates a settings email address. */
const emailError = 'Enter an email address.';

const EmailAddress = Schema.String.check(Schema.isIncluding('@'));

export type EmailDecision =
  { readonly email: string } | { readonly error: typeof emailError };

function reject(error: typeof emailError): EmailDecision {
  return { error };
}

/** Accepts an address that includes @, otherwise the settings error copy. */
export const decideEmail = (input: string): Effect.Effect<EmailDecision> =>
  Effect.gen(function* () {
    const email = yield* Schema.decodeUnknownEffect(EmailAddress)(input).pipe(
      Effect.mapError((): typeof emailError => emailError),
    );
    return { email };
  }).pipe(
    Effect.match({
      onFailure: reject,
      onSuccess: (accepted) => accepted,
    }),
  );
