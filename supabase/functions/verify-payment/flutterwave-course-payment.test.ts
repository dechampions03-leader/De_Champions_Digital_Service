import {
  validateFlutterwaveCourseTransaction,
  type CourseCheckoutExpectation,
} from "./flutterwave-course-payment.ts";

const expected: CourseCheckoutExpectation = {
  transactionId: "123456789",
  txRef: "DCDS-12345678-1234-1234-1234-123456789012",
  amount: 15000,
  currency: "NGN",
};

const validTransaction = {
  id: "123456789",
  tx_ref: expected.txRef,
  amount: 15000,
  currency: "NGN",
  status: "successful",
};

Deno.test("accepts an exact successful NGN hosted checkout", () => {
  if (validateFlutterwaveCourseTransaction(expected, validTransaction) !== null) {
    throw new Error("Expected transaction to match.");
  }
});

Deno.test("rejects an unsuccessful provider transaction", () => {
  const error = validateFlutterwaveCourseTransaction(expected, { ...validTransaction, status: "pending" });
  if (!error) throw new Error("Pending transaction must be rejected.");
});

Deno.test("rejects a mismatched amount", () => {
  const error = validateFlutterwaveCourseTransaction(expected, { ...validTransaction, amount: 14999 });
  if (!error) throw new Error("Mismatched amount must be rejected.");
});

Deno.test("rejects a mismatched currency", () => {
  const error = validateFlutterwaveCourseTransaction(expected, { ...validTransaction, currency: "USD" });
  if (!error) throw new Error("Mismatched currency must be rejected.");
});

Deno.test("rejects a mismatched transaction reference", () => {
  const error = validateFlutterwaveCourseTransaction(expected, { ...validTransaction, tx_ref: "OTHER-REFERENCE" });
  if (!error) throw new Error("Mismatched transaction reference must be rejected.");
});

Deno.test("rejects a mismatched transaction ID", () => {
  const error = validateFlutterwaveCourseTransaction(expected, { ...validTransaction, id: "123456788" });
  if (!error) throw new Error("Mismatched transaction ID must be rejected.");
});

Deno.test("rejects non-numeric transaction IDs", () => {
  const error = validateFlutterwaveCourseTransaction(expected, { ...validTransaction, id: "charge_123" });
  if (!error) throw new Error("Non-numeric transaction ID must be rejected.");
});

Deno.test("accepts exact two-decimal amounts without floating point drift", () => {
  const error = validateFlutterwaveCourseTransaction(
    { ...expected, amount: 15000.25 },
    { ...validTransaction, amount: 15000.25 },
  );
  if (error !== null) throw new Error("Exact decimal amount should match.");
});
