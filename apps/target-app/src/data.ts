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

const MEMBERS: Member[] = [
  {
    memberNumber: '12345',
    name: 'JOHNSON, MARGARET A',
    ssn: '***-**-4829',
    dob: '03/15/1968',
    address: '2847 OAKWOOD DR',
    city: 'WESTFIELD',
    state: 'IN',
    zip: '46074',
    phone: '(317) 555-0142',
    email: 'mjohnson@mailhost.net',
    branch: 'MAIN',
    memberSince: '04/12/2003',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '4,182.90',
        availableBalance: '4,182.90',
        maturityDate: '',
        status: 'Open',
      },
      {
        id: 'S0010',
        typeCode: '10',
        description: 'Checking',
        currentBalance: '1,247.33',
        availableBalance: '1,097.33',
        maturityDate: '',
        status: 'Open',
      },
      {
        id: 'S0040',
        typeCode: '40',
        description: '12-Mo Certificate',
        currentBalance: '10,000.00',
        availableBalance: '—',
        maturityDate: '09/30/2026',
        status: 'Open',
      },
      {
        id: 'S0002',
        typeCode: '00',
        description: 'Holiday Club Savings',
        currentBalance: '0.00',
        availableBalance: '0.00',
        maturityDate: '',
        status: 'Closed',
      },
    ],
  },
  {
    memberNumber: '67890',
    name: 'CHEN, ROBERT W',
    ssn: '***-**-7713',
    dob: '11/02/1975',
    address: '519 MAPLE LANE APT 3B',
    city: 'CARMEL',
    state: 'IN',
    zip: '46032',
    phone: '(317) 555-0298',
    email: 'rwchen@provider.com',
    branch: 'WEST',
    memberSince: '08/22/2010',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '892.15',
        availableBalance: '892.15',
        maturityDate: '',
        status: 'Open',
      },
      {
        id: 'S0010',
        typeCode: '10',
        description: 'Checking',
        currentBalance: '3,401.72',
        availableBalance: '3,251.72',
        maturityDate: '',
        status: 'Open',
      },
    ],
  },
  {
    memberNumber: '11111',
    name: 'PATEL, ANITA R',
    ssn: '***-**-2201',
    dob: '07/19/1982',
    address: '8831 CONGRESS AVE',
    city: 'INDIANAPOLIS',
    state: 'IN',
    zip: '46240',
    phone: '(317) 555-0467',
    email: 'apatel@webmail.org',
    branch: 'EAST',
    memberSince: '01/05/2015',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '15,320.44',
        availableBalance: '15,320.44',
        maturityDate: '',
        status: 'Open',
      },
    ],
  },
];

export function findMember(memberNumber: string): Member | undefined {
  return MEMBERS.find((m) => m.memberNumber === memberNumber);
}

export function searchMembers(criteria: {
  memberNumber?: string;
  branch?: string;
  includeClosed?: boolean;
}): Member[] {
  return MEMBERS.filter((m) => {
    if (criteria.memberNumber && m.memberNumber !== criteria.memberNumber) {
      return false;
    }
    if (criteria.branch && criteria.branch !== 'ALL' && m.branch !== criteria.branch) {
      return false;
    }
    return true;
  });
}

export const MAGIC_NOT_FOUND = '99999';
export const MAGIC_VALIDATION_ERROR = '88888';
export const MAGIC_SESSION_TIMEOUT = '77777';
