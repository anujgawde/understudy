import type { Member } from './types.js';

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
  {
    memberNumber: '66666',
    name: 'ALVAREZ, DIANE R',
    ssn: '***-**-3301',
    dob: '07/22/1981',
    address: '119 BIRCHWOOD LN',
    city: 'CARMEL',
    state: 'IN',
    zip: '46032',
    phone: '(317) 555-0198',
    email: 'dalvarez@mailhost.net',
    branch: 'WEST',
    memberSince: '02/08/2011',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '2,940.15',
        availableBalance: '2,940.15',
        maturityDate: '',
        status: 'Open',
      },
      {
        id: 'S0010',
        typeCode: '10',
        description: 'Checking',
        currentBalance: '610.44',
        availableBalance: '610.44',
        maturityDate: '',
        status: 'Open',
      },
    ],
  },
  {
    memberNumber: '55555',
    name: 'OKONKWO, SAMUEL T',
    ssn: '***-**-7742',
    dob: '11/30/1975',
    address: '88 SENTINEL CT',
    city: 'FISHERS',
    state: 'IN',
    zip: '46037',
    phone: '(317) 555-0144',
    email: 'sokonkwo@mailhost.net',
    branch: 'NORTH',
    memberSince: '06/14/2009',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '8,115.00',
        availableBalance: '8,115.00',
        maturityDate: '',
        status: 'Open',
      },
    ],
  },
  {
    memberNumber: '44444',
    name: 'REYES, CARMEN L',
    ssn: '***-**-2214',
    dob: '04/17/1988',
    address: '2210 KESTREL WAY',
    city: 'NOBLESVILLE',
    state: 'IN',
    zip: '46060',
    phone: '(317) 555-0177',
    email: 'creyes@webmail.org',
    branch: 'EAST',
    memberSince: '09/23/2016',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '1,204.88',
        availableBalance: '1,204.88',
        maturityDate: '',
        status: 'Open',
      },
    ],
  },
  {
    memberNumber: '33333',
    name: 'HALVORSEN, ERIK J',
    ssn: '***-**-9083',
    dob: '02/09/1969',
    address: '547 GRANITE RIDGE RD',
    city: 'ZIONSVILLE',
    state: 'IN',
    zip: '46077',
    phone: '(317) 555-0123',
    email: 'ehalvorsen@mailhost.net',
    branch: 'WEST',
    memberSince: '03/11/2004',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '22,047.63',
        availableBalance: '22,047.63',
        maturityDate: '',
        status: 'Open',
      },
    ],
  },
  {
    memberNumber: '22222',
    name: 'NAKAMURA, YUKI',
    ssn: '***-**-5561',
    dob: '08/25/1992',
    address: '31 LANTERN HILL DR',
    city: 'WESTFIELD',
    state: 'IN',
    zip: '46074',
    phone: '(317) 555-0190',
    email: 'ynakamura@webmail.org',
    branch: 'MAIN',
    memberSince: '01/19/2019',
    shares: [
      {
        id: 'S0001',
        typeCode: '00',
        description: 'Regular Share Savings',
        currentBalance: '3,870.21',
        availableBalance: '3,870.21',
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

// Renders the member detail page with its share summary injected a beat after
// load, so a replay's first checkpoint read misses it and the second finds it.
export const MAGIC_SLOW_RENDER = '66666';
export const SLOW_RENDER_DELAY_MILLISECONDS = 1_500;

// The record exists and the operator may not see it. A legitimate negative
// answer the caller needs, not a malfunction — the same class as not-found, and
// the reason business outcomes are matched on what the page says rather than on
// which checkpoint failed.
export const MAGIC_ACCESS_DENIED = '55555';

// The server itself fails. The error page renders perfectly, which is why this
// is caught on the response status rather than on anything the page shows.
export const MAGIC_APP_ERROR = '44444';

// A native confirm() nobody recorded, fired on load. Blocks the page until it
// is answered, and answering it would be agreeing to something no artifact
// declared.
export const MAGIC_UNEXPECTED_DIALOG = '33333';

// A dismissible maintenance notice standing between the flow and its result.
// The rows are withheld until it is cleared, so a replay that ignores it reads
// an empty grid rather than quietly succeeding anyway.
export const MAGIC_MAINTENANCE_NOTICE = '22222';
