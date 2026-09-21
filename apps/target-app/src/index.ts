import express from 'express';
import cookieSession from 'cookie-session';
import { loginPage, chrome, memberSearchPage, memberDetailPage } from './views.js';
import {
  searchMembers,
  findMember,
  MAGIC_NOT_FOUND,
  MAGIC_VALIDATION_ERROR,
  MAGIC_SESSION_TIMEOUT,
  MAGIC_SLOW_RENDER,
  SLOW_RENDER_DELAY_MILLISECONDS,
} from './data.js';

const PORT = Number(process.env.TARGET_APP_PORT ?? 4000);

const app = express();

app.use(express.urlencoded({ extended: false }));

app.use(
  cookieSession({
    name: 'meridian_sid',
    keys: ['meridian-core-session-key-do-not-use-in-prod'],
    maxAge: 30 * 60 * 1000,
  }),
);

function getSession(req: express.Request) {
  return req.session as { user?: string; branch?: string } & Record<string, unknown>;
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!getSession(req).user) {
    res.redirect('/login');
    return;
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'target-app' });
});

app.get('/', (_req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (getSession(req).user) {
    res.redirect('/members/search');
    return;
  }
  res.type('html').send(loginPage());
});

app.post('/login', (req, res) => {
  const userId = req.body['ctl00$ContentMain$txtUserID'];
  const password = req.body['ctl00$ContentMain$txtPassword'];
  const branch = req.body['ctl00$ContentMain$ddlBranch'];

  if (!userId || !password) {
    res.type('html').send(loginPage({ error: 'User ID and Password are required.' }));
    return;
  }

  const session = getSession(req);
  session.user = userId;
  session.branch = branch ?? 'MAIN';
  res.redirect('/members/search');
});

app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

app.get('/members/search', requireAuth, (req, res) => {
  const content = memberSearchPage({ searched: false });
  res.type('html').send(
    chrome({
      title: 'Member Search',
      breadcrumb: 'Home &rsaquo; Member Services &rsaquo; Member Search',
      activeNav: 'search',
      activeTab: 'members',
      content,
      user: getSession(req).user!,
    }),
  );
});

app.post('/members/search', requireAuth, (req, res) => {
  const memberNumber = (req.body['ctl00$ContentMain$txtMbrNo'] as string)?.trim() || undefined;
  const branch = req.body['ctl00$ContentMain$ddlBranch'] as string;
  const includeClosed = !!req.body['ctl00$ContentMain$chkIncludeClosed'];

  if (memberNumber === MAGIC_SESSION_TIMEOUT) {
    req.session = null;
    res.type('html').send(loginPage({ expired: true }));
    return;
  }

  if (memberNumber === MAGIC_VALIDATION_ERROR) {
    const content = memberSearchPage({
      criteria: { memberNumber, branch, includeClosed },
      searched: false,
      validationErrors: [
        '<strong>VAL-MBR-001:</strong> Member number must be exactly 5 digits.',
        '<strong>VAL-MBR-003:</strong> Member number contains prohibited characters (!, @, #, $).',
        '<strong>VAL-SYS-010:</strong> Branch selection is required when searching by partial criteria.',
      ],
    });
    res.type('html').send(
      chrome({
        title: 'Member Search',
        breadcrumb: 'Home &rsaquo; Member Services &rsaquo; Member Search',
        activeNav: 'search',
        activeTab: 'members',
        content,
        user: getSession(req).user!,
      }),
    );
    return;
  }

  if (memberNumber === MAGIC_NOT_FOUND) {
    const content = memberSearchPage({
      criteria: { memberNumber, branch, includeClosed },
      results: [],
      searched: true,
    });
    res.type('html').send(
      chrome({
        title: 'Member Search',
        breadcrumb: 'Home &rsaquo; Member Services &rsaquo; Member Search',
        activeNav: 'search',
        activeTab: 'members',
        content,
        user: getSession(req).user!,
      }),
    );
    return;
  }

  const members = searchMembers({ memberNumber, branch, includeClosed });

  const results = members.map((m, i) => ({
    memberNumber: m.memberNumber,
    name: m.name,
    branch: m.branch,
    memberSince: m.memberSince,
    phone: m.phone,
    status: m.shares.some((s) => s.status === 'Open') ? 'Active' : 'Closed',
    highlighted: memberNumber ? true : i === 0,
  }));

  const content = memberSearchPage({
    criteria: { memberNumber, branch, includeClosed },
    results,
    searched: true,
  });

  res.type('html').send(
    chrome({
      title: 'Member Search',
      breadcrumb: 'Home &rsaquo; Member Services &rsaquo; Member Search',
      activeNav: 'search',
      activeTab: 'members',
      content,
      user: getSession(req).user!,
    }),
  );
});

app.post('/members/detail', requireAuth, (req, res) => {
  const memberNumber = (req.body['ctl00$ContentMain$hdnMemberNo'] as string)?.trim();

  if (!memberNumber) {
    res.redirect('/members/search');
    return;
  }

  if (memberNumber === MAGIC_SESSION_TIMEOUT) {
    req.session = null;
    res.type('html').send(loginPage({ expired: true }));
    return;
  }

  const member = findMember(memberNumber);
  if (!member) {
    res.redirect('/members/search');
    return;
  }

  const content = memberDetailPage(
    member,
    memberNumber === MAGIC_SLOW_RENDER
      ? { shareSummaryDelayMilliseconds: SLOW_RENDER_DELAY_MILLISECONDS }
      : undefined,
  );
  res.type('html').send(
    chrome({
      title: `Member Detail - ${member.memberNumber}`,
      breadcrumb: `Home &rsaquo; Member Services &rsaquo; Member Search &rsaquo; ${member.name}`,
      activeNav: 'detail',
      activeTab: 'members',
      content,
      user: getSession(req).user!,
    }),
  );
});

app.listen(PORT, () => {
  console.log(`Target App listening on http://localhost:${PORT}`);
});
