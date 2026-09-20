export interface CapabilityMatch {
  capabilityId: string;
  // Values read out of the request and bound to the inputs the matched
  // capability declares. Inputs the request says nothing about — a credential,
  // for instance — are absent and supplied by the caller instead.
  inputs: Record<string, string>;
}

export interface StoredCapability {
  path: string;
  directory: string;
}
