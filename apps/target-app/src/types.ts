export interface Share {
  id: string;
  typeCode: string;
  description: string;
  currentBalance: string;
  availableBalance: string;
  maturityDate: string;
  status: 'Open' | 'Closed';
}

export interface Member {
  memberNumber: string;
  name: string;
  ssn: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  branch: string;
  memberSince: string;
  shares: Share[];
}
