// Provider document requirements (shared by the wizard and the server).
export const PROVIDER_DOCS: Record<
  string,
  { name: string; docs: string[]; cond: Record<string, string> }
> = {
  RMA: {
    name: 'RMA (Payment Gateway)',
    docs: [
      'Business/Trade License Copy',
      'Company Registration Document',
      'CID Copy of authorised representative',
      'Bank Account Confirmation Letter',
    ],
    cond: {},
  },
  BoB: {
    name: 'Bank of Bhutan (Card Zone)',
    docs: [
      'CID card of proprietor/manager',
      'Valid Trade License Copy',
      'Certificate of Incorporation (corporate)',
      'Passport-sized photograph',
      'Official-letterhead application (Govt. offices)',
    ],
    cond: {
      'Certificate of Incorporation (corporate)': 'Private limited',
      'Official-letterhead application (Govt. offices)': 'Government office',
    },
  },
};
/** The documents a provider asks for, given the business type. */
export const docsFor = (prov: string, businessType: string) =>
  PROVIDER_DOCS[prov].docs.filter(
    (d) => !PROVIDER_DOCS[prov].cond[d] || PROVIDER_DOCS[prov].cond[d] === businessType,
  );
