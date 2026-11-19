export type FlutterwaveCourseTransaction = {
  id?: unknown;
  tx_ref?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
};

export type CourseCheckoutExpectation = {
  transactionId: string;
  txRef: string;
  amount: number;
  currency: string;
};

function amountToMinorUnits(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

/**
 * Return a safe mismatch reason unless the provider transaction exactly
 * matches the pending DCDS order. No client-supplied amount is trusted.
 */
export function validateFlutterwaveCourseTransaction(
  expected: CourseCheckoutExpectation,
  transaction: FlutterwaveCourseTransaction,
): string | null {
  const id = String(transaction.id ?? "").trim();
  const txRef = String(transaction.tx_ref ?? "").trim();
  const currency = String(transaction.currency ?? "").trim().toUpperCase();
  const status = String(transaction.status ?? "").trim().toLowerCase();
  const paidMinor = amountToMinorUnits(transaction.amount);
  const expectedMinor = amountToMinorUnits(expected.amount);

  if (!/^[0-9]{1,30}$/.test(id) || id !== expected.transactionId) {
    return "Flutterwave returned a different or invalid transaction ID.";
  }
  if (txRef !== expected.txRef) {
    return "Flutterwave transaction reference does not match the DCDS order.";
  }
  if (status !== "successful") {
    return "Flutterwave has not marked this transaction as successful.";
  }
  if (!/^[A-Z]{3}$/.test(currency) || currency !== expected.currency.toUpperCase()) {
    return "Flutterwave transaction currency does not match the DCDS order.";
  }
  if (paidMinor === null || expectedMinor === null || paidMinor !== expectedMinor) {
    return "Flutterwave transaction amount does not match the DCDS order.";
  }
  return null;
}
