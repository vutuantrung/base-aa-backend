/** Internal marker for a failure proven to occur before transport emission. */
export class ProvenUnsentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvenUnsentDeliveryError';
  }
}
