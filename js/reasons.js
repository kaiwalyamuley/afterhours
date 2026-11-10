// These lists must match the checks in the database functions
// cancel_my_order, owner_update_order and send_support_message.
export const CUSTOMER_REASONS = [
  "Ordered by mistake",
  "Changed my mind",
  "Chose the wrong size",
  "Chose the wrong design",
  "Wrong address or phone number",
  "Placed a duplicate order",
  "Found a better price elsewhere",
  "Delivery would take too long",
  "Won't be home to receive it",
  "Cash not available for delivery",
];

export const OWNER_REASONS = [
  "Plain tee out of stock in this size",
  "Print file not good enough",
  "Payment not received",
  "Customer not reachable",
  "Customer asked to cancel",
  "Delivery not available at this address",
  "Incomplete or wrong address",
  "Duplicate order",
  "Suspected fake order",
  "Pricing error on this product",
];

export const SUPPORT_TOPICS = [
  "Where is my order?",
  "Change my order",
  "Payment question",
  "Size question",
  "Problem with my tee",
  "Something else",
];
